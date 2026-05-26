import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  broadcastCampaigns, broadcastRecipients,
  contacts, conversations, messages, messageStatusLog, leads,
} from '@/db/schema';
import { eq, desc, sql, and, inArray, gt } from 'drizzle-orm';
import { sendRichTemplateMessage, sendMPMTemplateMessage, MPMSection } from '@/lib/whatsapp-api';
import { normalizePhone } from '@/lib/utils';

export const maxDuration = 300;

// ─── GET: List campaigns or fetch one by ?id= ────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    // Single campaign stats for delivery polling
    if (id) {
      const [campaign] = await db
        .select({
          deliveredCount:  broadcastCampaigns.deliveredCount,
          readCount:       broadcastCampaigns.readCount,
          sentCount:       broadcastCampaigns.sentCount,
          failedCount:     broadcastCampaigns.failedCount,
          totalRecipients: broadcastCampaigns.totalRecipients,
          status:          broadcastCampaigns.status,
        })
        .from(broadcastCampaigns)
        .where(eq(broadcastCampaigns.id, id))
        .limit(1);

      if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(campaign);
    }

    // All campaigns list
    const campaigns = await db
      .select()
      .from(broadcastCampaigns)
      .orderBy(desc(broadcastCampaigns.createdAt));

    const enriched = await Promise.all(
      campaigns.map(async (c) => {
        const recipRows = await db
          .select({ status: broadcastRecipients.status, phone: broadcastRecipients.phone })
          .from(broadcastRecipients)
          .where(eq(broadcastRecipients.campaignId, c.id));

        const phones = recipRows.map((r) => r.phone);

        let repliedCount = 0;
        if (phones.length > 0) {
          const [row] = await db
            .select({ count: sql<number>`count(distinct ${messages.fromNumber})::int` })
            .from(messages)
            .where(
              and(
                eq(messages.isOutgoing, false),
                inArray(messages.fromNumber, phones),
                gt(messages.sentAt, c.createdAt)
              )
            );
          repliedCount = row?.count ?? 0;
        }

        const undeliveredCount = recipRows.filter((r) => r.status === 'sent').length;

        return {
          ...c,
          bodyParams:       c.bodyParams   as string[],
          headerParams:     c.headerParams as string[],
          recipients:       recipRows,
          repliedCount,
          undeliveredCount,
        };
      })
    );

    return NextResponse.json(enriched);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST: Create and stream broadcast progress via SSE ───────────────────────
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    name,
    templateId,
    templateName,
    language = 'en',
    bodyParams = [] as string[],
    headerParam = '',
    headerMediaUrl = '',
    headerMediaType = 'image',
    isCatalogTemplate = false,
    isMPMTemplate = false,
    mpmSections = [] as MPMSection[],
    thumbnailProductRetailerId = '',
    recipients = [] as string[],
  } = body;

  if (!templateName || recipients.length === 0) {
    return NextResponse.json(
      { error: 'templateName and at least one recipient are required' },
      { status: 400 }
    );
  }

  const phones = recipients
    .map((p: string) => normalizePhone(p))
    .filter((p: string) => p.length >= 10);

  if (phones.length === 0) {
    return NextResponse.json({ error: 'No valid phone numbers provided' }, { status: 400 });
  }

  // Create campaign and recipients upfront so the client gets campaignId immediately
  const [campaign] = await db.insert(broadcastCampaigns).values({
    name: name || `Campaign ${new Date().toLocaleString('en-IN')}`,
    templateId: templateId || null,
    templateName,
    language,
    bodyParams,
    headerParams: headerParam ? [headerParam] : [],
    headerMediaUrl: headerMediaUrl || null,
    totalRecipients: phones.length,
    status: 'sending',
  }).returning();

  await db.insert(broadcastRecipients).values(
    phones.map((phone: string) => ({ campaignId: campaign.id, phone, status: 'pending' as const }))
  );

  const bizPhone    = process.env.WHATSAPP_PHONE_NUMBER_ID || '680420725151873';
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const hasRealCreds = accessToken && accessToken !== 'your_access_token_here';

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      };

      emit({ type: 'start', campaignId: campaign.id, total: phones.length });

      let sentCount   = 0;
      let failedCount = 0;

      for (const phone of phones) {
        // 1–2 second delay between sends (respects WhatsApp rate limits)
        await new Promise((r) => setTimeout(r, 1000 + Math.floor(Math.random() * 1001)));

        const now = new Date();
        try {
          let waMessageId: string | null = null;

          if (hasRealCreds) {
            let waRes: any;
            if (isMPMTemplate && mpmSections.length > 0 && thumbnailProductRetailerId) {
              waRes = await sendMPMTemplateMessage({
                to: phone, templateName, language,
                headerParam: headerParam || undefined,
                bodyParams,
                thumbnailProductRetailerId,
                sections: mpmSections,
              });
            } else {
              waRes = await sendRichTemplateMessage({
                to: phone, templateName, language, bodyParams,
                headerParam: headerParam || undefined,
                headerMediaUrl: headerMediaUrl || undefined,
                headerMediaType: headerMediaType as any,
                isCatalogTemplate,
              });
            }
            waMessageId = waRes?.messages?.[0]?.id || null;
          } else {
            waMessageId = `wamid.dev_${Date.now()}_${phone}`;
          }

          // Upsert contact
          const [existingContact] = await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(eq(contacts.phone, phone))
            .limit(1);

          let contactId = existingContact?.id;
          if (!contactId) {
            const [newContact] = await db.insert(contacts).values({
              name: phone,
              phone,
              leadStatus: 'contacted',
            }).returning({ id: contacts.id });
            contactId = newContact.id;

            await db.insert(leads).values({
              contactId,
              status: 'contacted',
              source: 'Broadcast',
              value: '0',
            });
          } else {
            await db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, contactId));
          }

          // Upsert conversation
          const [existingConv] = await db
            .select({ id: conversations.id })
            .from(conversations)
            .where(eq(conversations.contactId, contactId))
            .limit(1);

          let conversationId = existingConv?.id;
          if (!conversationId) {
            const [newConv] = await db.insert(conversations).values({
              contactId,
              status: 'open',
              unreadCount: 0,
            }).returning({ id: conversations.id });
            conversationId = newConv.id;
          } else {
            await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversationId));
          }

          const msgId = waMessageId || `wamid.local_${Date.now()}_${phone}`;

          await db.insert(messages).values({
            id: msgId,
            conversationId,
            fromNumber: bizPhone,
            toNumber: phone,
            type: 'template',
            text: buildPreviewText(templateName, bodyParams),
            templateName,
            templateData: { bodyParams, headerParam },
            status: 'sent',
            isOutgoing: true,
            sentAt: now,
          }).onConflictDoNothing();

          await db.insert(messageStatusLog).values({ messageId: msgId, status: 'sent', loggedAt: now });

          await db.update(broadcastRecipients).set({
            status: 'sent',
            messageId: msgId,
            contactId,
            conversationId,
            sentAt: now,
          }).where(
            sql`${broadcastRecipients.campaignId} = ${campaign.id} AND ${broadcastRecipients.phone} = ${phone}`
          );

          sentCount++;
          emit({ type: 'progress', phone, status: 'sent', sentCount, failedCount, total: phones.length });

        } catch (sendErr: any) {
          failedCount++;
          await db.update(broadcastRecipients).set({
            status: 'failed',
            error: sendErr.message,
          }).where(
            sql`${broadcastRecipients.campaignId} = ${campaign.id} AND ${broadcastRecipients.phone} = ${phone}`
          );
          emit({ type: 'progress', phone, status: 'failed', error: sendErr.message, sentCount, failedCount, total: phones.length });
        }
      }

      await db.update(broadcastCampaigns).set({
        sentCount,
        failedCount,
        status: failedCount === phones.length ? 'failed' : 'completed',
        updatedAt: new Date(),
      }).where(eq(broadcastCampaigns.id, campaign.id));

      emit({ type: 'done', campaignId: campaign.id, total: phones.length, sent: sentCount, failed: failedCount });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function buildPreviewText(templateName: string, bodyParams: string[]): string {
  let text = `[Template: ${templateName}]`;
  if (bodyParams.length > 0) text += ` — ${bodyParams.join(', ')}`;
  return text;
}
