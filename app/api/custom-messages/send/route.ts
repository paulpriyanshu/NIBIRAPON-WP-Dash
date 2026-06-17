import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { messages, conversations, contacts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCustomMessage } from '@/lib/custom-message-store';
import { sendCustomMessage } from '@/lib/custom-message-send';

// Manually send a saved custom message to a conversation (inbox composer).
export async function POST(req: NextRequest) {
  try {
    const { conversationId, customMessageId, to: toInput } = await req.json();
    if (!conversationId || !customMessageId) {
      return NextResponse.json({ error: 'conversationId and customMessageId are required' }, { status: 400 });
    }

    // Resolve the customer's phone (from the request, else via the conversation's contact).
    let to: string | undefined = toInput;
    if (!to) {
      const row = await db
        .select({ phone: contacts.phone })
        .from(conversations)
        .innerJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(eq(conversations.id, conversationId))
        .limit(1)
        .then(r => r[0]);
      to = row?.phone;
    }
    if (!to) return NextResponse.json({ error: 'could not resolve recipient phone' }, { status: 400 });

    const m = await getCustomMessage(customMessageId);
    if (!m) return NextResponse.json({ error: 'custom message not found' }, { status: 404 });

    const result = await sendCustomMessage(to, m);

    const bizPhone = process.env.WHATSAPP_PHONE_NUMBER_ID || '680420725151873';
    const now = new Date();
    const id = result.msgId || `wamid.local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await db.insert(messages).values({
      id,
      conversationId,
      fromNumber:   bizPhone,
      toNumber:     to,
      type:         result.recordType as any,
      text:         result.text,
      mediaUrl:     result.mediaUrl ?? null,
      status:       result.msgId ? 'sent' : 'failed',
      isOutgoing:   true,
      sentBy:       'admin',
      sentAt:       now,
    }).onConflictDoNothing();
    await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversationId));

    return NextResponse.json({ ok: true, id, status: result.msgId ? 'sent' : 'failed' });
  } catch (err: any) {
    console.error('[custom-messages/send]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
