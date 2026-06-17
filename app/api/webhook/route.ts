import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  contacts, conversations, messages, messageStatusLog,
  webhookEvents, leads, messageReactions,
  broadcastRecipients, broadcastCampaigns, orders,
} from '@/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { verifyWebhook, sendTextMessage, sendMediaMessage, sendListMessage, sendRichTemplateMessage, sendMPMTemplateMessage, sendCheckoutTemplate, getProductFromCatalog } from '@/lib/whatsapp-api';
import { runAgent, type AgentMessage } from '@/lib/agent';
import { sendCustomMessage } from '@/lib/custom-message-send';
import { handleCustomOptionPick } from '@/lib/custom-option-reply';
import { configToSendPayload } from '@/lib/templates';
import { getSendUrl } from '@/lib/inventory-media';
import { advanceRunOnButton } from '@/lib/flow-store';

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

/** Canonical phone: bare 10-digit Indian number → prepend 91 */
function canonicalPhone(raw: string): string {
  const s = raw.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(s)) return `91${s}`;
  return s;
}

async function handleIncomingMessage(msg: any, contactProfile: any, metadata: any) {
  const fromPhone    = canonicalPhone(msg.from);   // normalise on arrival
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
      status:       'open',
      unreadCount:  1,
      agentEnabled: true,   // agent ON by default for every new chat
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
    sentBy:        null,   // incoming — always null
    sentAt:        new Date(parseInt(msg.timestamp) * 1000),
  }).onConflictDoNothing();

  // ── Cart / order received → capture it and send the payment option ────────
  if (msg.type === 'order') {
    await handleCartOrder({
      msg, fromPhone, bizPhone: phoneNumberId, contactId, conversationId,
    }).catch(err => console.error('[order]', err));
    return; // order handled — don't run the agent on this message
  }

  // ── AI agent reply ────────────────────────────────────────────────────────
  // MUST be awaited before returning — Vercel kills the lambda the moment
  // the response is sent, so fire-and-forget never executes the OpenAI call.
  // GPT-4o-mini responds in ~1-2 s; total flow stays well under the 10 s limit.
  const conv = existingConv ?? (await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)
    .then(r => r[0]));

  // ── Live-flow automation ──────────────────────────────────────────────────
  // A quick-reply button tap advances the customer's active flow run (if any),
  // sending the next template. Typed messages are left to the AI agent below.
  const isButtonTap   = msg.type === 'button' || msg.type === 'interactive';
  const isListPick    = msg.type === 'interactive' && templateData?.interactiveType === 'list_reply';

  let flowAdvanced = false;
  if (isButtonTap) {
    const buttonText   = templateData?.buttonTitle || msgText || '';
    const contextMsgId = templateData?.contextMsgId || msg.context?.id || undefined;
    console.log(`[flow] button tap from=${fromPhone} type=${msg.type} text="${buttonText}" id="${templateData?.buttonId ?? ''}" context=${contextMsgId ?? 'none'}`);
    if (buttonText) {
      flowAdvanced = await advanceRunOnButton({
        phone: fromPhone,
        contextMsgId,
        buttonText,
        conversationId,
        bizPhone: phoneNumberId,
      }).catch(err => { console.error('[flow-advance]', err); return false; });
    }
  }

  // A tap on a dynamic custom-message option (category/product) that NO flow branch
  // consumed. Flow branching takes priority; this is the fallback.
  if (!flowAdvanced && isButtonTap && templateData?.buttonId?.startsWith('cmopt:')) {
    const bid = templateData.buttonId;
    const prodTap = /^cmopt:product:(.+)$/.exec(bid);
    const catTap  = /^cmopt:category:(.+)$/.exec(bid);
    // Let the AI handle taps conversationally (warm text + a follow-up question),
    // preferring saved templates / custom messages. Product tap → present the item;
    // category tap → send its marketing template / custom message, else a product list.
    // Falls back to the deterministic drill-down when the agent is off.
    if ((prodTap || catTap) && conv?.agentEnabled) {
      await agentReply({
        conversationId, toPhone: fromPhone, bizPhone: phoneNumberId, userText: '',
        focusProductId:  prodTap?.[1],
        focusCategoryId: catTap?.[1],
      }).catch(err => console.error('[agent-reply]', err));
      return;
    }
    const handled = await handleCustomOptionPick({
      buttonId: bid, toPhone: fromPhone, bizPhone: phoneNumberId, conversationId,
    }).catch(err => { console.error('[cmopt]', err); return false; });
    if (handled) return;
  }

  // The agent handles messages the customer typed (type "text") AND category
  // picks from a list it sent (list_reply) that no flow consumed. Quick-reply
  // button taps drive the flow, not the agent.
  const agentInput = msg.type === 'text'
    ? msgText
    : (isListPick && !flowAdvanced ? (templateData?.buttonTitle || msgText) : null);

  if (conv?.agentEnabled && agentInput) {
    await agentReply({
      conversationId,
      toPhone: fromPhone,
      bizPhone: phoneNumberId,
      userText: agentInput,
    }).catch(err => console.error('[agent-reply]', err));
  }
}

/** One line item in a WhatsApp cart/order webhook payload. */
interface OrderItem { product_retailer_id?: string; quantity?: number; item_price?: number; currency?: string }

/**
 * A WhatsApp cart/order arrived → record it as a pending order (amount, qty,
 * product name + pic per item) and send the customer the payment option:
 * a short summary followed by the "Review and Pay" interactive.
 */
async function handleCartOrder({
  msg, fromPhone, bizPhone, contactId, conversationId,
}: {
  msg: { id: string; order?: { product_items?: OrderItem[]; catalog_id?: string } };
  fromPhone: string; bizPhone: string; contactId: string; conversationId: string;
}) {
  const rawItems = msg.order?.product_items ?? [];
  if (rawItems.length === 0) { console.warn('[order] empty cart — nothing to do'); return; }

  const currency    = rawItems[0]?.currency || 'INR';
  const catalogId   = String(msg.order?.catalog_id || process.env.WHATSAPP_CATALOG_ID || '');
  const referenceId = `nbr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Resolve each item's name + image from the WhatsApp catalog (best effort).
  const catalogInfo = await Promise.all(rawItems.map(async (i) => {
    if (!catalogId) return null;
    try {
      const res = await getProductFromCatalog(catalogId, String(i.product_retailer_id));
      return (res?.data?.[0] ?? null) as { name?: string; image_url?: string } | null;
    } catch { return null; }
  }));

  const items = rawItems.map((i, idx) => ({
    retailerId:   String(i.product_retailer_id || 'product'),
    name:         catalogInfo[idx]?.name || String(i.product_retailer_id || 'Product'),
    imageUrl:     catalogInfo[idx]?.image_url || undefined,
    priceInPaise: Math.round(Number(i.item_price || 0) * 100),  // WA sends major units
    quantity:     Number(i.quantity) || 1,
  }));
  const totalPaise = items.reduce((sum, it) => sum + it.priceInPaise * it.quantity, 0);
  const totalQty   = items.reduce((sum, it) => sum + it.quantity, 0);
  const headerImageUrl = items.find(it => it.imageUrl)?.imageUrl;
  const money = (paise: number) => `${currency === 'INR' ? '₹' : currency + ' '}${(paise / 100).toLocaleString('en-IN')}`;

  // 1. Capture the order (pending) so it shows in the dashboard / can be paid.
  await db.insert(orders).values({
    referenceId,
    contactId,
    conversationId,
    waOrderMsgId:   msg.id,
    phone:          fromPhone,
    currency,
    totalPaise,
    items,
  }).onConflictDoNothing();

  const localId = (s: string) => `wamid.order_${s}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // 2. Warm confirmation summarising products, qty and amount.
  const summary = `🛒 Thanks for your order!\n\n${items.map(it => `• ${it.name} × ${it.quantity} — ${money(it.priceInPaise * it.quantity)}`).join('\n')}\n\n*Total: ${money(totalPaise)}* (${totalQty} item${totalQty !== 1 ? 's' : ''})\n\nTap below to pay securely 👇`;
  try {
    const txt = await sendTextMessage({ to: fromPhone, text: summary });
    await db.insert(messages).values({
      id: txt?.messages?.[0]?.id || localId('sum'), conversationId,
      fromNumber: bizPhone, toNumber: fromPhone, type: 'text', text: summary,
      status: txt?.messages?.[0]?.id ? 'sent' : 'failed', isOutgoing: true, sentBy: 'agent', sentAt: new Date(),
    }).onConflictDoNothing();
  } catch (e) { console.error('[order] summary send failed:', e instanceof Error ? e.message : e); }

  // 3. The payment option — WhatsApp "Review and Pay" (order_details interactive).
  try {
    const res  = await sendCheckoutTemplate({ to: fromPhone, referenceId, currency, totalAmountInPaise: totalPaise, headerImageUrl, items });
    const waId = res?.messages?.[0]?.id;
    await db.insert(messages).values({
      id: waId || localId('pay'), conversationId,
      fromNumber: bizPhone, toNumber: fromPhone, type: 'interactive',
      text: `💳 Payment request — ${money(totalPaise)}`,
      status: waId ? 'sent' : 'failed', isOutgoing: true, sentBy: 'agent', sentAt: new Date(),
    }).onConflictDoNothing();
    if (waId) await db.update(orders).set({ checkoutMsgId: waId, updatedAt: new Date() }).where(eq(orders.referenceId, referenceId));
    console.log(`[order] captured ref=${referenceId} total=${totalPaise} qty=${totalQty} → checkout waId=${waId ?? 'none'}`);
  } catch (e) {
    console.error('[order] checkout send failed:', e instanceof Error ? e.message : e);
  }

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId)).catch(() => {});
}

/** Fetch conversation history, run the agent, and send the reply. */
async function agentReply({
  conversationId,
  toPhone,
  bizPhone,
  userText,
  focusProductId,
  focusCategoryId,
}: {
  conversationId: string;
  toPhone: string;
  bizPhone: string;
  userText: string;
  focusProductId?: string;
  focusCategoryId?: string;
}) {
  console.log(`[agent] ▶ triggered for conv=${conversationId} msg="${userText}" focusProduct=${focusProductId ?? 'none'} focusCategory=${focusCategoryId ?? 'none'}`);

  // Most recent 30 messages as context, then put them back in chronological order.
  // (Ordering desc + limit gets the LATEST 30; asc + limit would wrongly grab the
  // oldest 30 and lose recent context in long chats.)
  const recent = await db
    .select({ text: messages.text, isOutgoing: messages.isOutgoing })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.isDeleted, false)))
    .orderBy(desc(messages.sentAt))
    .limit(30);
  const history = recent.reverse();

  // Map to AgentMessage (skip the very last message — it's the current user message)
  const chatHistory: AgentMessage[] = history
    .slice(0, -1)
    .filter(m => m.text)
    .map(m => ({ role: m.isOutgoing ? 'assistant' : 'user', content: m.text! }));

  const { reply, media, list, template, customMessage, shouldRespond } = await runAgent(userText, chatHistory, { focusProductId, focusCategoryId });
  console.log(`[agent] shouldRespond=${shouldRespond} media=${media.length} list=${list ? 'yes' : 'no'} template=${template?.name ?? 'no'} custom=${customMessage?.name ?? 'no'} reply="${reply?.slice(0, 60)}…"`);

  if (!shouldRespond) return;

  const localId = (suffix: string) =>
    `wamid.agent_${Date.now()}_${suffix}_${Math.random().toString(36).slice(2, 6)}`;

  // ── 1. Text reply ─────────────────────────────────────────────────────────
  if (reply) {
    const waRes = await sendTextMessage({ to: toPhone, text: reply });
    const waId = waRes?.messages?.[0]?.id;
    console.log(`[agent] ✓ text send waId=${waId ?? 'local'}`);

    await db.insert(messages).values({
      id:            waId || localId('txt'),
      conversationId,
      fromNumber:    bizPhone,
      toNumber:      toPhone,
      type:          'text',
      text:          reply,
      status:        waId ? 'sent' : 'failed',
      isOutgoing:    true,
      sentBy:        'agent',
      sentAt:        new Date(),
    }).onConflictDoNothing();
  }

  // ── 2. Product photos / videos ────────────────────────────────────────────
  // Bytes for uploaded assets live in our DB; we hand WhatsApp a transient copy
  // (cached) only to deliver the message. Pasted URLs are sent as a link.
  for (const m of media) {
    try {
      // Stored assets live in R2; hand WhatsApp a fetchable URL (public or
      // presigned). Pasted URLs are sent as-is.
      const sendUrl = m.assetId ? await getSendUrl(m.assetId) : m.url;
      if (!sendUrl) {
        console.error(`[agent] no sendable URL for media`, m);
        continue;
      }

      const waRes = await sendMediaMessage({
        to:       toPhone,
        type:     m.type,
        mediaUrl: sendUrl,
        caption:  m.caption,
      });
      const waId = waRes?.messages?.[0]?.id;
      console.log(`[agent] ✓ ${m.type} send waId=${waId ?? 'local'}`);

      // Persist a URL the inbox can render: our permanent proxy, or the link.
      const displayUrl = m.assetId ? `/api/inventory/media/${m.assetId}` : (m.url ?? null);

      await db.insert(messages).values({
        id:            waId || localId(m.type),
        conversationId,
        fromNumber:    bizPhone,
        toNumber:      toPhone,
        type:          m.type,
        mediaUrl:      displayUrl,
        mediaCaption:  m.caption ?? null,
        status:        waId ? 'sent' : 'failed',
        isOutgoing:    true,
        sentBy:        'agent',
        sentAt:        new Date(),
      }).onConflictDoNothing();
    } catch (err) {
      console.error(`[agent] media send failed (${m.type}):`, err instanceof Error ? err.message : err);
    }
  }

  // ── 3. Saved template draft ───────────────────────────────────────────────
  if (template) {
    try {
      const payload = configToSendPayload(toPhone, template.name, template.language, template.config || {});
      const waRes = payload.kind === 'mpm'
        ? await sendMPMTemplateMessage(payload.args)
        : await sendRichTemplateMessage(payload.args);
      const waId = waRes?.messages?.[0]?.id;
      console.log(`[agent] ✓ template "${template.name}" send waId=${waId ?? 'local'}`);
      await db.insert(messages).values({
        id:            waId || localId('tmpl'),
        conversationId,
        fromNumber:    bizPhone,
        toNumber:      toPhone,
        type:          'template',
        templateName:  template.name,
        text:          `[Template] ${template.name}`,
        status:        waId ? 'sent' : 'failed',
        isOutgoing:    true,
        sentBy:        'agent',
        sentAt:        new Date(),
      }).onConflictDoNothing();
    } catch (err) {
      console.error('[agent] template send failed:', err instanceof Error ? err.message : err);
    }
  }

  // ── 4. Category list (tappable) ───────────────────────────────────────────
  if (list) {
    // Send each category image first (caption = category name), so the customer
    // sees visuals before the tappable list. Same delivery path as product media.
    for (const m of list.media ?? []) {
      try {
        const sendUrl = m.assetId ? await getSendUrl(m.assetId) : m.url;
        if (!sendUrl) continue;
        const waRes = await sendMediaMessage({ to: toPhone, type: m.type, mediaUrl: sendUrl, caption: m.caption });
        const waId = waRes?.messages?.[0]?.id;
        const displayUrl = m.assetId ? `/api/inventory/media/${m.assetId}` : (m.url ?? null);
        await db.insert(messages).values({
          id:            waId || localId('cat'),
          conversationId,
          fromNumber:    bizPhone,
          toNumber:      toPhone,
          type:          m.type,
          mediaUrl:      displayUrl,
          mediaCaption:  m.caption ?? null,
          status:        waId ? 'sent' : 'failed',
          isOutgoing:    true,
          sentBy:        'agent',
          sentAt:        new Date(),
        }).onConflictDoNothing();
      } catch (err) {
        console.error('[agent] category image send failed:', err instanceof Error ? err.message : err);
      }
    }
    try {
      const waRes = await sendListMessage({
        to: toPhone, body: list.body, button: list.button,
        header: list.header, sections: list.sections,
      });
      const waId = waRes?.messages?.[0]?.id;
      console.log(`[agent] ✓ list send waId=${waId ?? 'local'}`);
      await db.insert(messages).values({
        id:            waId || localId('list'),
        conversationId,
        fromNumber:    bizPhone,
        toNumber:      toPhone,
        type:          'interactive',
        text:          list.body,
        status:        waId ? 'sent' : 'failed',
        isOutgoing:    true,
        sentBy:        'agent',
        sentAt:        new Date(),
      }).onConflictDoNothing();
    } catch (err) {
      console.error('[agent] list send failed:', err instanceof Error ? err.message : err);
    }
  }

  // ── 5. Saved custom message (option list / buttons / text / media) ─────────
  if (customMessage) {
    try {
      const r = await sendCustomMessage(toPhone, customMessage);
      console.log(`[agent] ✓ custom message "${customMessage.name}" send waId=${r.msgId ?? 'local'}`);
      await db.insert(messages).values({
        id:            r.msgId || localId('custom'),
        conversationId,
        fromNumber:    bizPhone,
        toNumber:      toPhone,
        type:          r.recordType as any,
        text:          r.text,
        mediaUrl:      r.mediaUrl ?? null,
        status:        r.msgId ? 'sent' : 'failed',
        isOutgoing:    true,
        sentBy:        'agent',
        sentAt:        new Date(),
      }).onConflictDoNothing();
    } catch (err) {
      console.error('[agent] custom message send failed:', err instanceof Error ? err.message : err);
    }
  }

  await db.update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
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
