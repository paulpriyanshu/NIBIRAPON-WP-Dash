import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { contacts, conversations, messages, leads } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { canonicalPhone, isTemplateLocked } from '@/lib/flow-store';
import { getCustomMessage } from '@/lib/custom-message-store';
import { sendCustomMessage } from '@/lib/custom-message-send';
import { configToSendPayload, type TemplateMessageConfig } from '@/lib/templates';
import { sendRichTemplateMessage, sendMPMTemplateMessage, PHONE_NUMBER_ID } from '@/lib/whatsapp-api';

export const maxDuration = 300;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Find or create a contact + open conversation for a phone. */
async function ensureConversation(phone: string): Promise<string> {
  let [contact] = await db.select().from(contacts).where(eq(contacts.phone, phone)).limit(1);
  if (!contact) {
    [contact] = await db.insert(contacts).values({
      name: phone, phone, leadStatus: 'new', leadValue: '0',
    }).returning();
    await db.insert(leads).values({ contactId: contact.id, status: 'new', source: 'Flow', value: '0' }).catch(() => {});
  }
  let [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.contactId, contact.id), eq(conversations.status, 'open')))
    .limit(1);
  if (!conv) {
    [conv] = await db.insert(conversations).values({
      contactId: contact.id, status: 'open', agentEnabled: true,
    }).returning();
  }
  return conv.id;
}

type ResendBody =
  | { action: 'custom'; phones: string[]; customMessageId: string }
  | { action: 'template'; phones: string[]; templateName: string; language?: string; config?: TemplateMessageConfig };

/**
 * Bulk re-engage a set of flow participants — the action behind the flow tracking
 * panel's send bar. Sends either a saved custom message or a saved marketing
 * template (reusing the same send paths the flow/agent use) to the selected
 * phones, paced at one recipient per second (matching the broadcast launch).
 * At maxDuration=300s a single send caps at ~300 recipients.
 *
 * Flow re-runs are NOT handled here — the frontend calls /launch for those,
 * which reuses the flow's stored root + template params.
 */
export async function POST(
  req: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  try {
    const body = await req.json() as ResendBody;

    const unique = [...new Set(
      (body.phones ?? []).map(canonicalPhone).filter(p => p.length >= 10),
    )];
    if (unique.length === 0) return NextResponse.json({ error: 'No valid recipients' }, { status: 400 });

    // Resolve what to send once, up front.
    let send: (phone: string) => Promise<{ msgId?: string; type: string; text: string; mediaUrl?: string | null }>;

    if (body.action === 'custom') {
      if (!body.customMessageId) return NextResponse.json({ error: 'customMessageId is required' }, { status: 400 });
      const m = await getCustomMessage(body.customMessageId);
      if (!m) return NextResponse.json({ error: 'custom message not found' }, { status: 404 });
      send = async (phone) => {
        const r = await sendCustomMessage(phone, m);
        return { msgId: r.msgId, type: r.recordType, text: r.text, mediaUrl: r.mediaUrl ?? null };
      };
    } else if (body.action === 'template') {
      if (!body.templateName) return NextResponse.json({ error: 'templateName is required' }, { status: 400 });
      // Same guard as the broadcast page: a template wired into the live flow can't
      // be sent independently — guide the user to "Re-run flow" instead.
      const lock = await isTemplateLocked(body.templateName).catch(() => null);
      if (lock) {
        return NextResponse.json(
          { error: `"${body.templateName}" is used in the live flow "${lock.flowName}". Use "Re-run flow" instead.` },
          { status: 423 },
        );
      }
      const language = body.language || 'en';
      const config = body.config || {};
      send = async (phone) => {
        const payload = configToSendPayload(phone, body.templateName, language, config);
        const res = payload.kind === 'mpm'
          ? await sendMPMTemplateMessage(payload.args)
          : await sendRichTemplateMessage(payload.args);
        return { msgId: res?.messages?.[0]?.id, type: 'template', text: `[Template] ${body.templateName}` };
      };
    } else {
      return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }

    const bizPhone = PHONE_NUMBER_ID;
    let sent = 0;
    const failures: { phone: string; error: string }[] = [];

    for (let i = 0; i < unique.length; i++) {
      const phone = unique[i];
      if (i > 0) await sleep(1000); // 1 recipient / second
      try {
        const conversationId = await ensureConversation(phone);
        const r = await send(phone);
        const now = new Date();
        const id = r.msgId || `wamid.local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await db.insert(messages).values({
          id,
          conversationId,
          fromNumber: bizPhone,
          toNumber:   phone,
          type:       r.type as any,
          text:       r.text,
          mediaUrl:   r.mediaUrl ?? null,
          status:     r.msgId ? 'sent' : 'failed',
          isOutgoing: true,
          sentBy:     'admin',
          sentAt:     now,
        }).onConflictDoNothing();
        await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversationId));
        if (r.msgId) sent++;
        else failures.push({ phone, error: 'send failed' });
      } catch (e) {
        failures.push({ phone, error: e instanceof Error ? e.message : 'failed' });
      }
    }

    return NextResponse.json({ sent, total: unique.length, failures });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
