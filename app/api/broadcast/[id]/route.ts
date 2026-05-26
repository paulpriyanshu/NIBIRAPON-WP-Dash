import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  broadcastCampaigns, broadcastRecipients,
  contacts, conversations, messages, messageStatusLog, leads,
} from '@/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { sendRichTemplateMessage } from '@/lib/whatsapp-api';
import { normalizePhone } from '@/lib/utils';

export const maxDuration = 300;

// POST /api/broadcast/[id] — retry undelivered (status='sent') and failed recipients
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;

  const [campaign] = await db
    .select()
    .from(broadcastCampaigns)
    .where(eq(broadcastCampaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  // Only retry recipients still stuck at 'sent' (undelivered) or 'failed'
  const toRetry = await db
    .select({ phone: broadcastRecipients.phone, id: broadcastRecipients.id })
    .from(broadcastRecipients)
    .where(
      and(
        eq(broadcastRecipients.campaignId, campaignId),
        inArray(broadcastRecipients.status, ['sent', 'failed'])
      )
    );

  if (toRetry.length === 0) {
    return NextResponse.json({ error: 'No undelivered or failed recipients to retry' }, { status: 400 });
  }

  const bizPhone    = process.env.WHATSAPP_PHONE_NUMBER_ID || '680420725151873';
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const hasRealCreds = accessToken && accessToken !== 'your_access_token_here';

  const bodyParams  = (campaign.bodyParams  as string[]) || [];
  const headerParam = ((campaign.headerParams as string[]) || [])[0] || '';

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };

      emit({ type: 'start', campaignId, total: toRetry.length, isRetry: true });

      let sentCount   = 0;
      let failedCount = 0;

      for (const recip of toRetry) {
        const delay = 3000 + Math.floor(Math.random() * 3001);
        await new Promise((r) => setTimeout(r, delay));

        // const phone = normalizePhone(recip.phone);  // uncomment to auto-prefix Indian 10-digit numbers
        const phone = recip.phone;
        const now = new Date();
        try {
          let waMessageId: string | null = null;

          if (hasRealCreds) {
            const waRes = await sendRichTemplateMessage({
              to:             phone,
              templateName:   campaign.templateName,
              language:       campaign.language,
              bodyParams,
              headerParam:    headerParam || undefined,
              headerMediaUrl: campaign.headerMediaUrl || undefined,
            });
            waMessageId = waRes?.messages?.[0]?.id || null;
          } else {
            waMessageId = `wamid.retry_${Date.now()}_${phone}`;
          }

          // Upsert contact + conversation (may already exist)
          const [existingContact] = await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(eq(contacts.phone, phone))
            .limit(1);

          let contactId = existingContact?.id;
          if (!contactId) {
            const [c] = await db.insert(contacts).values({
              name: phone, phone, leadStatus: 'contacted',
            }).returning({ id: contacts.id });
            contactId = c.id;
            await db.insert(leads).values({ contactId, status: 'contacted', source: 'Broadcast Retry', value: '0' });
          }

          const [existingConv] = await db
            .select({ id: conversations.id })
            .from(conversations)
            .where(eq(conversations.contactId, contactId))
            .limit(1);

          let conversationId = existingConv?.id;
          if (!conversationId) {
            const [cv] = await db.insert(conversations).values({
              contactId, status: 'open', unreadCount: 0,
            }).returning({ id: conversations.id });
            conversationId = cv.id;
          }

          const msgId = waMessageId || `wamid.retry_local_${Date.now()}_${phone}`;

          await db.insert(messages).values({
            id: msgId,
            conversationId,
            fromNumber:   bizPhone,
            toNumber:     phone,
            type:         'template',
            text:         `[Retry] ${campaign.templateName}`,
            templateName: campaign.templateName,
            templateData: { bodyParams, headerParam },
            status:       'sent',
            isOutgoing:   true,
            sentAt:       now,
          }).onConflictDoNothing();

          await db.insert(messageStatusLog)
            .values({ messageId: msgId, status: 'sent', loggedAt: now })
            .onConflictDoNothing();

          // Update stored phone to normalized form + reset delivery tracking
          await db.update(broadcastRecipients)
            .set({ phone, status: 'sent', messageId: msgId, sentAt: now, error: null, deliveredAt: null, readAt: null })
            .where(eq(broadcastRecipients.id, recip.id));

          sentCount++;
          emit({ type: 'progress', phone, status: 'sent', sentCount, failedCount, total: toRetry.length });

        } catch (err: any) {
          failedCount++;
          await db.update(broadcastRecipients)
            .set({ status: 'failed', error: err.message })
            .where(eq(broadcastRecipients.id, recip.id));
          emit({ type: 'progress', phone, status: 'failed', error: err.message, sentCount, failedCount, total: toRetry.length });
        }
      }

      emit({ type: 'done', campaignId, total: toRetry.length, sent: sentCount, failed: failedCount, isRetry: true });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// PATCH /api/broadcast/[id] — update campaign meta + recipients (mainly for drafts)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { name, templateName, language, bodyParams, headerParam, headerMediaUrl, recipients } = body;

  const update: Record<string, any> = { updatedAt: new Date() };
  if (name          !== undefined) update.name           = name;
  if (templateName  !== undefined) update.templateName   = templateName;
  if (language      !== undefined) update.language       = language;
  if (bodyParams    !== undefined) update.bodyParams      = bodyParams;
  if (headerParam   !== undefined) update.headerParams   = headerParam ? [headerParam] : [];
  if (headerMediaUrl !== undefined) update.headerMediaUrl = headerMediaUrl || null;

  await db.update(broadcastCampaigns).set(update).where(eq(broadcastCampaigns.id, id));

  if (recipients !== undefined) {
    const phones = (recipients as string[]).map(normalizePhone).filter((p) => p.length >= 10);
    await db.delete(broadcastRecipients).where(eq(broadcastRecipients.campaignId, id));
    if (phones.length > 0) {
      await db.insert(broadcastRecipients).values(
        phones.map((phone) => ({ campaignId: id, phone, status: 'pending' as const }))
      );
    }
    await db.update(broadcastCampaigns)
      .set({ totalRecipients: phones.length })
      .where(eq(broadcastCampaigns.id, id));
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/broadcast/[id] — delete a campaign (cascades recipients)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(broadcastCampaigns).where(eq(broadcastCampaigns.id, id));
  return NextResponse.json({ success: true });
}
