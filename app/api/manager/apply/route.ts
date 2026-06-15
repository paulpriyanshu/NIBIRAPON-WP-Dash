import { NextRequest } from 'next/server';
import { managerChatsColl, serializeChat, toObjectId } from '@/lib/manager-store';
import { applyPending } from '@/lib/manager-agent';

export const maxDuration = 60;

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Approve or cancel the chat's staged write actions, streaming the confirmation.
export async function POST(req: NextRequest) {
  const { chatId, approve, imageAssignments, actionEdits } = await req.json();
  const _id = toObjectId(chatId);
  if (!_id) return Response.json({ error: 'bad chatId' }, { status: 400 });

  const coll = await managerChatsColl();
  const doc = await coll.findOne({ _id });
  if (!doc) return Response.json({ error: 'not found' }, { status: 404 });

  const pending = doc.pendingActions ?? [];
  if (pending.length === 0) return Response.json({ error: 'nothing to apply' }, { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const assignments = (imageAssignments && typeof imageAssignments === 'object') ? imageAssignments as Record<string, string[]> : undefined;
        const edits = (actionEdits && typeof actionEdits === 'object') ? actionEdits as Record<string, Record<string, any>> : undefined;
        const { appended, pending: nextPending } = await applyPending(doc.messages ?? [], pending, !!approve, t => controller.enqueue(sse('delta', { text: t })), assignments, edits);

        const messages = [...(doc.messages ?? []), ...appended];
        await coll.updateOne({ _id }, { $set: { messages, pendingActions: nextPending.length ? nextPending : null, updatedAt: new Date() } });

        const fresh = await coll.findOne({ _id });
        controller.enqueue(sse('done', serializeChat(fresh!)));
      } catch (err: any) {
        console.error('[manager/apply]', err);
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
