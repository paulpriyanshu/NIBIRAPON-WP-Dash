import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { templateSnapshots, broadcastCampaigns, broadcastRecipients, contacts, conversations, messages, messageStatusLog, leads } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { sendRichTemplateMessage } from '@/lib/whatsapp-api';
import { normalizePhone } from '@/lib/utils';

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

// PATCH — update label, bodyParams, headerParam, headerMediaUrl, recipients
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const allowed = ['label', 'bodyParams', 'headerParam', 'headerMediaUrl', 'recipients', 'language'] as const;
    const patch: Record<string, any> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (key in body) patch[key === 'bodyParams' ? 'bodyParams' : key === 'headerParam' ? 'headerParam' : key === 'headerMediaUrl' ? 'headerMediaUrl' : key] = body[key];
    }
    if (body.recipients) patch.sentCount = (body.recipients as string[]).length;

    const [row] = await db.update(templateSnapshots).set(patch).where(eq(templateSnapshots.id, id)).returning();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(row);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await db.delete(templateSnapshots).where(eq(templateSnapshots.id, id));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/template-snapshots/[id] — resend (SSE stream) or duplicate
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { action, recipients: overrideRecipients } = await req.json().catch(() => ({ action: 'resend' }));

  const [snap] = await db.select().from(templateSnapshots).where(eq(templateSnapshots.id, id)).limit(1);
  if (!snap) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ── Duplicate ────────────────────────────────────────────────────────────────
  if (action === 'duplicate') {
    const [copy] = await db.insert(templateSnapshots).values({
      label:          `${snap.label} (Copy)`,
      templateName:   snap.templateName,
      language:       snap.language,
      bodyParams:     snap.bodyParams,
      headerParam:    snap.headerParam,
      headerMediaUrl: snap.headerMediaUrl,
      recipients:     snap.recipients,
      sentCount:      0,
      source:         snap.source,
    }).returning();
    return NextResponse.json(copy);
  }

  // ── Resend (SSE) ─────────────────────────────────────────────────────────────
  const phones: string[] = (overrideRecipients ?? (snap.recipients as string[])).map(normalizePhone);
  if (phones.length === 0) return NextResponse.json({ error: 'No recipients' }, { status: 400 });

  const bodyParams  = (snap.bodyParams  as string[]) || [];
  const headerParam = snap.headerParam || '';
  const bizPhone    = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const hasRealCreds = accessToken && accessToken !== 'your_access_token_here';

  // Create a broadcast campaign to track delivery
  const [campaign] = await db.insert(broadcastCampaigns).values({
    name:            snap.label,
    templateName:    snap.templateName,
    language:        snap.language,
    bodyParams,
    headerParams:    headerParam ? [headerParam] : [],
    headerMediaUrl:  snap.headerMediaUrl || null,
    totalRecipients: phones.length,
    status:          'sending',
  }).returning();

  await db.insert(broadcastRecipients).values(
    phones.map((phone) => ({ campaignId: campaign.id, phone, status: 'pending' as const }))
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };

      emit({ type: 'start', campaignId: campaign.id, snapshotId: id, total: phones.length });

      let sentCount = 0, failedCount = 0;

      for (const phone of phones) {
        await new Promise((r) => setTimeout(r, 3000 + Math.floor(Math.random() * 3001)));
        const now = new Date();
        try {
          let waMessageId: string | null = null;
          if (hasRealCreds) {
            const waRes = await sendRichTemplateMessage({
              to: phone, templateName: snap.templateName, language: snap.language,
              bodyParams, headerParam: headerParam || undefined,
              headerMediaUrl: snap.headerMediaUrl || undefined,
            });
            waMessageId = waRes?.messages?.[0]?.id || null;
          } else {
            waMessageId = `wamid.snap_${Date.now()}_${phone}`;
          }

          const [existingContact] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.phone, phone)).limit(1);
          let contactId = existingContact?.id;
          if (!contactId) {
            const [c] = await db.insert(contacts).values({ name: phone, phone, leadStatus: 'contacted' }).returning({ id: contacts.id });
            contactId = c.id;
            await db.insert(leads).values({ contactId, status: 'contacted', source: 'Template History', value: '0' });
          }

          const [existingConv] = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.contactId, contactId)).limit(1);
          let conversationId = existingConv?.id;
          if (!conversationId) {
            const [cv] = await db.insert(conversations).values({ contactId, status: 'open', unreadCount: 0 }).returning({ id: conversations.id });
            conversationId = cv.id;
          }

          const msgId = waMessageId || `wamid.snap_local_${Date.now()}_${phone}`;
          await db.insert(messages).values({
            id: msgId, conversationId, fromNumber: bizPhone, toNumber: phone, type: 'template',
            text: `[Template] ${snap.templateName}`, templateName: snap.templateName,
            templateData: { bodyParams, headerParam }, status: 'sent', isOutgoing: true, sentAt: now,
          }).onConflictDoNothing();
          await db.insert(messageStatusLog).values({ messageId: msgId, status: 'sent', loggedAt: now }).onConflictDoNothing();
          await db.update(broadcastRecipients)
            .set({ status: 'sent', messageId: msgId, contactId, conversationId, sentAt: now })
            .where(sql`${broadcastRecipients.campaignId} = ${campaign.id} AND ${broadcastRecipients.phone} = ${phone}`);

          sentCount++;
          emit({ type: 'progress', phone, status: 'sent', sentCount, failedCount, total: phones.length });
        } catch (err: any) {
          failedCount++;
          await db.update(broadcastRecipients).set({ status: 'failed', error: err.message })
            .where(sql`${broadcastRecipients.campaignId} = ${campaign.id} AND ${broadcastRecipients.phone} = ${phone}`);
          emit({ type: 'progress', phone, status: 'failed', error: err.message, sentCount, failedCount, total: phones.length });
        }
      }

      await db.update(broadcastCampaigns).set({
        sentCount, failedCount, status: failedCount === phones.length ? 'failed' : 'completed', updatedAt: new Date(),
      }).where(eq(broadcastCampaigns.id, campaign.id));

      // Update snapshot sent count
      await db.update(templateSnapshots).set({
        sentCount: sql`${templateSnapshots.sentCount} + ${sentCount}`,
        recipients: phones, updatedAt: new Date(),
      }).where(eq(templateSnapshots.id, id));

      emit({ type: 'done', campaignId: campaign.id, snapshotId: id, total: phones.length, sent: sentCount, failed: failedCount });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}
