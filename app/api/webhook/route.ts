import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  contacts, conversations, messages, messageStatusLog,
  webhookEvents, leads, messageReactions,
  broadcastRecipients, broadcastCampaigns,
} from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { verifyWebhook } from '@/lib/whatsapp-api';

export const maxDuration = 60;

// ─── GET: Webhook verification ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get('hub.mode') || '';
  const token     = searchParams.get('hub.verify_token') || '';
  const challenge = searchParams.get('hub.challenge') || '';

  const result = verifyWebhook(mode, token, challenge);
  if (result) return new NextResponse(result, { status: 200 });
  return new NextResponse('Forbidden', { status: 403 });
}

// ─── POST: Receive webhook events ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let rawBody: any;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ status: 'ok' });
  }

  // Only process WhatsApp Business Account events
  if (rawBody?.object !== 'whatsapp_business_account') {
    return NextResponse.json({ status: 'ok' });
  }

  // Log raw payload immediately before any processing — ensures nothing is lost
  try {
    await db.insert(webhookEvents).values({
      type: 'other',
      payload: rawBody,
      processed: false,
    });
  } catch { /* ignore — don't let logging block processing */ }

  try {
    await processWebhookPayload(rawBody);
  } catch (err: any) {
    console.error('[Webhook] Processing error:', err.message);
    try {
      await db.insert(webhookEvents).values({
        type: 'other',
        payload: rawBody,
        processed: false,
        error: err.message,
      });
    } catch { /* ignore */ }
  }

  return NextResponse.json({ status: 'ok' });
}

// ─── Core processing ──────────────────────────────────────────────────────────
async function processWebhookPayload(body: any) {
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0]?.value;
  if (!change) return;

  if (change.messages?.length) {
    for (const msg of change.messages) {
      const contactProfile = change.contacts?.find((c: any) => c.wa_id === msg.from);
      await handleIncomingMessage(msg, contactProfile, change.metadata);
    }
  }

  if (change.statuses?.length) {
    for (const statusUpdate of change.statuses) {
      await handleStatusUpdate(statusUpdate);
    }
  }
}

// ─── Map WhatsApp message type to our DB enum ─────────────────────────────────
const ALLOWED_TYPES = new Set([
  'text', 'image', 'document', 'audio', 'video',
  'template', 'interactive', 'sticker', 'location', 'contacts',
]);

function mapMsgType(waType: string): string {
  if (ALLOWED_TYPES.has(waType)) return waType;
  if (waType === 'button') return 'interactive'; // template quick-reply tap
  return 'text'; // fallback for order, unknown, etc.
}

// ─── Extract human-readable text from any message type ───────────────────────
function extractText(msg: any): string | null {
  switch (msg.type) {
    case 'text':
      return msg.text?.body || null;
    case 'interactive': {
      const ia = msg.interactive;
      if (ia?.type === 'button_reply') return ia.button_reply?.title || null;
      if (ia?.type === 'list_reply')   return ia.list_reply?.title   || null;
      if (ia?.type === 'nfm_reply')    return 'Form submitted';
      return null;
    }
    case 'button':
      return msg.button?.text || null;
    case 'location': {
      const loc = msg.location;
      const name = loc?.name ? ` — ${loc.name}` : '';
      return `📍 Location${name}`;
    }
    case 'contacts':
      return `👤 Contact: ${msg.contacts?.[0]?.name?.formatted_name || 'shared'}`;
    case 'order':
      return `🛒 Order received`;
    case 'sticker':
      return null;
    default:
      return null;
  }
}

function extractTemplateData(msg: any): Record<string, string> | undefined {
  if (msg.type === 'interactive') {
    const ia = msg.interactive;
    return {
      interactiveType: ia?.type || '',
      buttonTitle: ia?.button_reply?.title || ia?.list_reply?.title || '',
      buttonId:    ia?.button_reply?.id    || ia?.list_reply?.id    || '',
      contextMsgId: msg.context?.id || '',
    };
  }
  if (msg.type === 'button') {
    return {
      interactiveType: 'button_reply',
      buttonTitle:  msg.button?.text    || '',
      buttonId:     msg.button?.payload || '',
      contextMsgId: msg.context?.id     || '',
    };
  }
  return undefined;
}

// ─── Extract media info ───────────────────────────────────────────────────────
function extractMedia(msg: any) {
  const src = msg.image || msg.video || msg.document || msg.audio || msg.sticker;
  if (!src) return {};
  return {
    mediaId:       src.id || null,
    mediaMimeType: src.mime_type || null,
    mediaFilename: msg.document?.filename || null,
    mediaCaption:  src.caption || null,
  };
}

async function handleIncomingMessage(msg: any, contactProfile: any, metadata: any) {
  const fromPhone    = msg.from;
  const phoneNumberId = metadata?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const contactName  = contactProfile?.profile?.name || fromPhone;

  // ── Handle reactions separately ──────────────────────────────────────────
  if (msg.type === 'reaction') {
    const { message_id: reactionMsgId, emoji } = msg.reaction || {};
    if (reactionMsgId && emoji) {
      await db
        .insert(messageReactions)
        .values({ messageId: reactionMsgId, fromNumber: fromPhone, emoji })
        .onConflictDoUpdate({
          target: [messageReactions.messageId, messageReactions.fromNumber],
          set: { emoji },
        });
    }
    await db.insert(webhookEvents).values({
      type: 'message_received',
      waMessageId: msg.id,
      fromNumber: fromPhone,
      payload: msg,
      processed: true,
    });
    return; // reactions don't create a new message row
  }

  // ── Log raw event ─────────────────────────────────────────────────────────
  await db.insert(webhookEvents).values({
    type: 'message_received',
    waMessageId: msg.id,
    fromNumber: fromPhone,
    payload: msg,
    processed: true,
  });

  // ── Upsert contact ────────────────────────────────────────────────────────
  // Priority 1: exact match
  let [existingContact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.phone, fromPhone))
    .limit(1);

  // Priority 2: suffix match only when exact match fails (safe to update phone then)
  if (!existingContact) {
    const [fuzzy] = await db
      .select()
      .from(contacts)
      .where(
        sql`${fromPhone} LIKE '%' || ${contacts.phone}
            OR ${contacts.phone} LIKE '%' || ${fromPhone}`
      )
      .limit(1);
    if (fuzzy) existingContact = fuzzy;
  }

  let contactId: string;
  if (existingContact) {
    contactId = existingContact.id;
    const nameIsPhone = existingContact.name === existingContact.phone || /^\d+$/.test(existingContact.name);
    const phoneChanged = existingContact.phone !== fromPhone;
    await db.update(contacts)
      .set({
        name:      nameIsPhone && contactName !== fromPhone ? contactName : existingContact.name,
        ...(phoneChanged ? { phone: fromPhone } : {}),
        isOnline:  true,
        lastSeen:  new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contactId));
  } else {
    const [newContact] = await db.insert(contacts).values({
      name:       contactName,
      phone:      fromPhone,
      isOnline:   true,
      lastSeen:   new Date(),
      leadStatus: 'new',
      leadValue:  '0',
    }).returning();
    contactId = newContact.id;

    await db.insert(leads).values({
      contactId,
      status: 'new',
      source: 'WhatsApp Inbound',
      value: '0',
    });
  }

  // ── Find or create conversation ───────────────────────────────────────────
  const [existingConv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.contactId, contactId), eq(conversations.status, 'open')))
    .limit(1);

  let conversationId: string;
  if (existingConv) {
    conversationId = existingConv.id;
    await db.update(conversations)
      .set({ unreadCount: sql`${conversations.unreadCount} + 1`, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  } else {
    const [newConv] = await db.insert(conversations).values({
      contactId,
      status: 'open',
      unreadCount: 1,
    }).returning();
    conversationId = newConv.id;
  }

  // ── Build message fields ──────────────────────────────────────────────────
  const msgType      = mapMsgType(msg.type);
  const msgText      = extractText(msg);
  const mediaInfo    = extractMedia(msg);
  const templateData = extractTemplateData(msg);

  // Only keep replyToId if the referenced message exists in our DB.
  // Messages sent from a broadcast before this DB existed won't be present,
  // so we null it out to avoid FK constraint violations.
  let replyToId: string | null = null;
  if (msg.context?.id) {
    const [refMsg] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.id, msg.context.id))
      .limit(1);
    replyToId = refMsg ? msg.context.id : null;
  }

  // ── Insert message (idempotent) ───────────────────────────────────────────
  await db.insert(messages).values({
    id:            msg.id,
    conversationId,
    fromNumber:    fromPhone,
    toNumber:      phoneNumberId,
    type:          msgType as any,
    text:          msgText,
    replyToId,
    templateData:  templateData || undefined,
    ...mediaInfo,
    status:        'delivered',
    isOutgoing:    false,
    sentAt:        new Date(parseInt(msg.timestamp) * 1000),
  }).onConflictDoNothing();

}

async function handleStatusUpdate(statusUpdate: any) {
  const { id: messageId, status, timestamp } = statusUpdate;

  await db.insert(webhookEvents).values({
    type: 'status_update',
    waMessageId: messageId,
    fromNumber: statusUpdate.recipient_id,
    payload: statusUpdate,
    processed: true,
  });

  const validStatuses = ['sent', 'delivered', 'read', 'failed'];
  if (!validStatuses.includes(status)) return;

  await db
    .update(messages)
    .set({ status: status as any })
    .where(eq(messages.id, messageId));

  await db.insert(messageStatusLog).values({
    messageId,
    status: status as any,
    loggedAt: new Date(parseInt(timestamp) * 1000),
  }).onConflictDoNothing();

  // Track delivery/read/failure back to the broadcast recipient row
  if (['delivered', 'read', 'failed'].includes(status)) {
    try {
      const [recip] = await db
        .select({ id: broadcastRecipients.id, campaignId: broadcastRecipients.campaignId, status: broadcastRecipients.status })
        .from(broadcastRecipients)
        .where(eq(broadcastRecipients.messageId, messageId))
        .limit(1);

      if (recip) {
        const ts = new Date(parseInt(timestamp) * 1000);
        if (status === 'delivered' && recip.status === 'sent') {
          await db.update(broadcastRecipients)
            .set({ status: 'delivered', deliveredAt: ts })
            .where(eq(broadcastRecipients.id, recip.id));
          await db.update(broadcastCampaigns)
            .set({ deliveredCount: sql`${broadcastCampaigns.deliveredCount} + 1` })
            .where(eq(broadcastCampaigns.id, recip.campaignId));
        } else if (status === 'read' && (recip.status === 'sent' || recip.status === 'delivered')) {
          const wasUndelivered = recip.status === 'sent';
          await db.update(broadcastRecipients)
            .set({ status: 'read', readAt: ts, ...(wasUndelivered ? { deliveredAt: ts } : {}) })
            .where(eq(broadcastRecipients.id, recip.id));
          if (wasUndelivered) {
            await db.update(broadcastCampaigns)
              .set({ deliveredCount: sql`${broadcastCampaigns.deliveredCount} + 1`, readCount: sql`${broadcastCampaigns.readCount} + 1` })
              .where(eq(broadcastCampaigns.id, recip.campaignId));
          } else {
            await db.update(broadcastCampaigns)
              .set({ readCount: sql`${broadcastCampaigns.readCount} + 1` })
              .where(eq(broadcastCampaigns.id, recip.campaignId));
          }
        } else if (status === 'failed' && recip.status === 'sent') {
          await db.update(broadcastRecipients)
            .set({ status: 'failed' })
            .where(eq(broadcastRecipients.id, recip.id));
          await db.update(broadcastCampaigns)
            .set({ failedCount: sql`${broadcastCampaigns.failedCount} + 1` })
            .where(eq(broadcastCampaigns.id, recip.campaignId));
        }
      }
    } catch { /* not a broadcast message — ignore */ }
  }
}
