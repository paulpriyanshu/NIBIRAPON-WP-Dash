import { NextRequest } from 'next/server';
import {
  managerChatsColl, serializeChat, toObjectId, deriveTitle,
  type ManagerStoredMessage, type ManagerImage,
} from '@/lib/manager-store';
import { runChatTurn } from '@/lib/manager-agent';

export const maxDuration = 60;

/** Encode one Server-Sent Event. */
function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Send a message: append it, run the manager agent, stream the reply, persist.
export async function POST(req: NextRequest) {
  const { chatId, message, images } = await req.json();
  const _id = toObjectId(chatId);
  if (!_id) return Response.json({ error: 'bad chatId' }, { status: 400 });

  const text = String(message ?? '').trim();
  const imgs: ManagerImage[] = Array.isArray(images)
    ? images.filter((i: any) => i?.assetId).map((i: any) => ({
        assetId: String(i.assetId),
        description: String(i.description ?? ''),
        type: i.type === 'video' ? 'video' : 'image',
      }))
    : [];
  if (!text && imgs.length === 0) return Response.json({ error: 'empty message' }, { status: 400 });

  const coll = await managerChatsColl();
  const doc = await coll.findOne({ _id });
  if (!doc) return Response.json({ error: 'not found' }, { status: 404 });

  // A message sent while a proposal is open is a REVISION: resolve the staged
  // (unanswered) write tool-calls as superseded so the conversation stays valid,
  // then let the agent re-plan from the owner's new instruction.
  const superseded: ManagerStoredMessage[] = (doc.pendingActions ?? []).map(a => ({
    role: 'tool', tool_call_id: a.toolCallId, name: a.name,
    content: 'Not applied — the owner revised the plan instead. Follow their new instruction below and propose an updated plan.',
    hidden: true, createdAt: new Date(),
  }));

  const userMsg: ManagerStoredMessage = { role: 'user', content: text, images: imgs.length ? imgs : undefined, createdAt: new Date() };
  const history = [...(doc.messages ?? []), ...superseded, userMsg];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { appended, pending } = await runChatTurn(history, t => controller.enqueue(sse('delta', { text: t })));

        const messages = [...history, ...appended];
        const title = (!doc.title || doc.title === 'New chat') ? deriveTitle(text || 'Images') : doc.title;
        await coll.updateOne({ _id }, { $set: { messages, pendingActions: pending.length ? pending : null, title, updatedAt: new Date() } });

        const fresh = await coll.findOne({ _id });
        controller.enqueue(sse('done', serializeChat(fresh!)));
      } catch (err: any) {
        console.error('[manager/chat]', err);
        controller.enqueue(sse('error', { message: err?.message || 'failed' }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive' },
  });
}
