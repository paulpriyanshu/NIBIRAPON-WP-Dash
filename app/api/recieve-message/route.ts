import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import {
  contacts, conversations, messages, messageStatusLog,
  leads, messageReactions, orders,
} from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { sendCheckoutTemplate, sendFlowMessage, getProductFromCatalog } from '@/lib/whatsapp-api'

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'hello'
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || ''

// ─── GET: Webhook verification ────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge)
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ─── POST: Receive messages ───────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ status: 'ok' })
  }

  // Log every webhook so we can see payment / other event types
  console.log('[webhook] RAW:', JSON.stringify(body, null, 2))

  if (body.object !== 'whatsapp_business_account') {
    return NextResponse.json({ status: 'ok' })
  }

  try {
    body.entry?.forEach(async (entry: any) => {
      entry.changes?.forEach(async (change: any) => {
        // Log the field so we can see if payment comes on a different field
        console.log('[webhook] change.field:', change.field)

        if (change.field !== 'messages') return

        const value    = change.value
        const msgList  = value.messages  || []
        const statuses = value.statuses  || []
        const contacts_ = value.contacts || []

        // Log every message type coming in
        for (const msg of msgList) {
          console.log('[webhook] msg.type:', msg.type, '| msg:', JSON.stringify(msg, null, 2))
          const contactProfile = contacts_.find((c: any) => c.wa_id === msg.from)
          await handleMessage(msg, contactProfile, value.metadata)
        }

        // ── Delivery/read status updates ───────────────────────────────────
        for (const status of statuses) {
          await handleStatus(status)
        }
      })
    })
  } catch (err: any) {
    console.error('[recieve-message] Error:', err.message)
  }

  return NextResponse.json({ status: 'ok' })
}

// ─── Handle an incoming message ───────────────────────────────────────────────
async function handleMessage(msg: any, contactProfile: any, metadata: any) {
  const fromPhone    = String(msg.from)
  const phoneNumId   = metadata?.phone_number_id || PHONE_NUMBER_ID
  const contactName  = contactProfile?.profile?.name || fromPhone


  // Reactions: update reaction table, don't insert a message row
  if (msg.type === 'reaction') {
    const { message_id, emoji } = msg.reaction || {}
    if (message_id && emoji) {
      await db.insert(messageReactions)
        .values({ messageId: message_id, fromNumber: fromPhone, emoji })
        .onConflictDoUpdate({
          target: [messageReactions.messageId, messageReactions.fromNumber],
          set: { emoji },
        })
    }
    return
  }

  // ── Upsert contact ─────────────────────────────────────────────────────────
  // Priority 1: exact match (phone already in full international format)
  let [existing] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.phone, fromPhone))
    .limit(1)

  // Priority 2: suffix match (broadcast stored short number, WhatsApp sends full number)
  // Only attempt if exact match failed — this guarantees the phone update won't collide.
  if (!existing) {
    const [fuzzy] = await db
      .select()
      .from(contacts)
      .where(
        sql`${fromPhone} LIKE '%' || ${contacts.phone}
            OR ${contacts.phone} LIKE '%' || ${fromPhone}`
      )
      .limit(1)
    if (fuzzy) existing = fuzzy
  }

  let contactId: string
  if (existing) {
    contactId = existing.id
    const nameIsPhone = existing.name === existing.phone || /^\d+$/.test(existing.name)
    const phoneChanged = existing.phone !== fromPhone
    await db.update(contacts)
      .set({
        name:      nameIsPhone && contactName !== fromPhone ? contactName : existing.name,
        // Only write phone if it's changing — and it's safe because exact match returned nothing
        ...(phoneChanged ? { phone: fromPhone } : {}),
        isOnline:  true,
        lastSeen:  new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contactId))
  } else {
    const [created] = await db.insert(contacts).values({
      name:       contactName,
      phone:      fromPhone,
      isOnline:   true,
      lastSeen:   new Date(),
      leadStatus: 'new',
    }).returning()
    contactId = created.id

    await db.insert(leads).values({
      contactId,
      status: 'new',
      source: 'WhatsApp Inbound',
      value:  '0',
    })
  }

  // ── Upsert conversation ────────────────────────────────────────────────────
  const [existingConv] = await db.select().from(conversations)
    .where(and(eq(conversations.contactId, contactId), eq(conversations.status, 'open')))
    .limit(1)

  let conversationId: string
  if (existingConv) {
    conversationId = existingConv.id
    await db.update(conversations)
      .set({ unreadCount: sql`${conversations.unreadCount} + 1`, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId))
  } else {
    const [created] = await db.insert(conversations).values({
      contactId,
      status: 'open',
      unreadCount: 1,
    }).returning()
    conversationId = created.id
  }

  // ── Extract message content ────────────────────────────────────────────────
  const msgType = mapType(msg.type)
  const msgText = extractText(msg)
  const media   = extractMedia(msg)
  let templateData = extractTemplateData(msg)

  // ── catalog_message: customer messaged from catalog overview ─────────────────
  if (msg.type === 'interactive' && msg.interactive?.type === 'catalog_message') {
    const retailerId = msg.interactive.action?.thumbnail_product_retailer_id as string | undefined
    templateData = {
      interactiveType:   'catalog_message',
      productRetailerId: retailerId || '',
      catalogId:         process.env.WHATSAPP_CATALOG_ID || '',
      contextMsgId:      msg.context?.id || '',
    }
  }

  // ── referred_product: customer messaged from a product detail page ────────────
  if (msg.context?.referred_product) {
    const { catalog_id, product_retailer_id } = msg.context.referred_product as any
    templateData = {
      interactiveType:   'product_ref',
      catalogId:         catalog_id       || '',
      productRetailerId: product_retailer_id || '',
    }
  }


  // Only keep replyToId if the referenced message actually exists in our DB.
  // If it doesn't (e.g. sent before this DB existed), null it out to avoid FK violation.
  let replyToId: string | null = null
  if (msg.context?.id) {
    const [refMsg] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.id, msg.context.id))
      .limit(1)
    replyToId = refMsg ? msg.context.id : null
  }

  // ── Insert message (idempotent) ────────────────────────────────────────────
  await db.insert(messages).values({
    id:            msg.id,
    conversationId,
    fromNumber:    fromPhone,
    toNumber:      phoneNumId,
    type:          msgType as any,
    text:          msgText,
    replyToId,
    templateData:  templateData || undefined,
    ...media,
    status:        'delivered',
    isOutgoing:    false,
    sentAt:        new Date(parseInt(msg.timestamp) * 1000),
  }).onConflictDoNothing()

  // ── Auto-send customer_info flow when cart is received ───────────────────
  if (msg.type === 'order') {
    try {
      const rawItems     = (msg.order?.product_items || []) as any[]
      const currency     = rawItems[0]?.currency || 'INR'
      const orderNum     = Date.now().toString().slice(-8)
      const catalogId    = String(msg.order?.catalog_id || process.env.WHATSAPP_CATALOG_ID || '')

      // Fetch product name + image from catalog for each item in parallel
      const catalogResults = await Promise.all(
        rawItems.map(async (i: any) => {
          try {
            const res = await getProductFromCatalog(catalogId, String(i.product_retailer_id))
            return (res?.data?.[0] ?? null) as { name?: string; image_url?: string } | null
          } catch {
            return null
          }
        })
      )

      // item_price from WhatsApp is in major currency units (e.g. rupees); convert to paise
      const checkoutItems = rawItems.map((i: any, idx: number) => {
        const product = catalogResults[idx]
        return {
          retailerId:   String(i.product_retailer_id || 'product'),
          name:         product?.name || String(i.product_retailer_id || 'product'),
          imageUrl:     product?.image_url || undefined,
          priceInPaise: Math.round(Number(i.item_price || 0) * 100),
          quantity:     Number(i.quantity) || 1,
        }
      })
      const totalInPaise = checkoutItems.reduce((sum, item) => sum + item.priceInPaise * item.quantity, 0)

      // 1. Insert order record (pending, no checkout yet)
      await db.insert(orders).values({
        referenceId:    orderNum,
        contactId:      contactId as any,
        conversationId: conversationId as any,
        waOrderMsgId:   msg.id,
        phone:          fromPhone,
        currency,
        totalPaise:     totalInPaise,
        items:          checkoutItems as any,
      }).onConflictDoNothing()

      // 2. Send customer_info_template flow to collect recipient details
      const waRes = await sendFlowMessage({
        to:        fromPhone,
        flowId:    '1671422473892304',
        flowToken: `order_${orderNum}`,
      })

      const waId = waRes?.messages?.[0]?.id
      if (waId) {
        const now = new Date()

        // 3. Save flow message to DB
        await db.insert(messages).values({
          id:           waId,
          conversationId,
          fromNumber:   phoneNumId,
          toNumber:     fromPhone,
          type:         'interactive',
          text:         'Please fill in your details to complete the order.',
          templateName: 'customer_info_template',
          templateData: { flowToken: `order_${orderNum}`, orderNum } as any,
          status:       'sent',
          isOutgoing:   true,
          sentAt:       now,
        }).onConflictDoNothing()

        // 4. Link flow msg wamid to the order
        await db.update(orders)
          .set({ flowMsgId: waId, updatedAt: now })
          .where(eq(orders.referenceId, orderNum))

        await db.update(conversations)
          .set({ updatedAt: now })
          .where(eq(conversations.id, conversationId))
      }
    } catch (err: any) {
      console.error('[webhook] flow send failed:', err)
    }
  }

  // ── nfm_reply: customer submitted the info flow ───────────────────────────
  if (msg.type === 'interactive' && msg.interactive?.type === 'nfm_reply') {
    try {
      const nfm = msg.interactive.nfm_reply || {}
      console.log('[nfm_reply] raw nfm:', JSON.stringify(nfm, null, 2))

      // response_json is a JSON string with submitted form data + flow_token
      let flowData: Record<string, any> = {}
      try {
        const raw = nfm.response_json
        flowData = typeof raw === 'string' ? JSON.parse(raw) : (raw || {})
      } catch {
        console.error('[nfm_reply] failed to parse response_json')
      }

      console.log('[nfm_reply] flowData:', JSON.stringify(flowData, null, 2))

      // flow_token is "order_<orderNum>" — strip prefix to get referenceId
      const rawToken = flowData.flow_token as string | undefined
      if (!rawToken) {
        console.error('[nfm_reply] no flow_token in response_json — cannot link to order')
        return
      }
      const flowToken = rawToken.startsWith('order_') ? rawToken.slice(6) : rawToken

      // Look up the pending order by referenceId
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.referenceId, flowToken))
        .limit(1)

      if (!order) {
        console.error('[nfm_reply] no order found for flow_token:', rawToken)
        return
      }

      // Extract fields using the real screen field names from customer_info_template
      const recipientName    = flowData.screen_1_Recipients_Name_0 || ''
      const recipientPhone   = flowData.screen_1_Contact_Number_1  || ''
      const addressLine1     = flowData.screen_2_Address_Line_1_0  || ''
      const addressLine2     = flowData.screen_2_Address_Line_2_1  || ''
      const city             = flowData.screen_2_City_2            || ''
      const pin              = flowData.screen_2_PIN_Code_3        || ''
      const state            = flowData.screen_2_State_4           || ''
      const recipientAddress = [addressLine1, addressLine2, city, pin, state].filter(Boolean).join(', ')

      const now = new Date()

      // Update contact address
      await db.update(contacts)
        .set({ address: recipientAddress, updatedAt: now })
        .where(eq(contacts.id, order.contactId as string))

      // Update order with recipient details
      await db.update(orders)
        .set({ recipientName, recipientPhone, recipientAddress, updatedAt: now })
        .where(eq(orders.referenceId, flowToken))

      // Now send the checkout / "Review and Pay" message
      const checkoutItems = order.items as any[]
      const waCheckout = await sendCheckoutTemplate({
        to:                 fromPhone,
        referenceId:        flowToken,
        currency:           order.currency,
        totalAmountInPaise: order.totalPaise,
        items:              checkoutItems,
      })

      const checkoutWaId = waCheckout?.messages?.[0]?.id
      if (checkoutWaId) {
        const totalStr = (order.totalPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

        await db.insert(messages).values({
          id:           checkoutWaId,
          conversationId: order.conversationId as string,
          fromNumber:   phoneNumId,
          toNumber:     fromPhone,
          type:         'template',
          text:         `Checkout for order ${flowToken}`,
          templateName: 'checkout_template',
          templateData: {
            referenceId:      flowToken,
            currency:         order.currency,
            totalStr,
            items:            JSON.stringify(checkoutItems),
            recipientName,
            recipientPhone,
            recipientAddress,
          } as any,
          status:       'sent',
          isOutgoing:   true,
          sentAt:       now,
        }).onConflictDoNothing()

        await db.update(orders)
          .set({ checkoutMsgId: checkoutWaId, updatedAt: now })
          .where(eq(orders.referenceId, flowToken))

        await db.update(conversations)
          .set({ updatedAt: now })
          .where(eq(conversations.id, order.conversationId as string))
      }
    } catch (err: any) {
      console.error('[webhook] nfm_reply handling failed:', err)
    }
  }

}

// ─── Handle a status update ───────────────────────────────────────────────────
async function handleStatus(statusUpdate: any) {
  const { id: messageId, status, timestamp, type: statusType } = statusUpdate

  // Payment captured/failed — patch original message + insert a notification message
  if (statusType === 'payment') {
    const p   = statusUpdate.payment
    const now = new Date()

    const patch = {
      paymentCaptured: status === 'captured' ? 'true' : 'false',
      paymentStatus:   status,
      referenceId:     p?.reference_id                   || '',
      transactionId:   p?.transaction?.id                || '',
      pgTransactionId: p?.transaction?.pg_transaction_id || '',
      amount:          String(p?.amount?.value           || ''),
      currency:        p?.currency                       || 'INR',
    }

    // 1. Mark order as paid and fetch the order's checkoutMsgId + conversationId
    const [order] = await db
      .select({
        checkoutMsgId:  orders.checkoutMsgId,
        conversationId: orders.conversationId,
        phone:          orders.phone,
      })
      .from(orders)
      .where(eq(orders.referenceId, patch.referenceId))
      .limit(1)

    if (status === 'captured') {
      await db.update(orders)
        .set({
          status:          'paid' as any,
          transactionId:   patch.transactionId,
          pgTransactionId: patch.pgTransactionId,
          paidAt:          now,
          updatedAt:       now,
        })
        .where(eq(orders.referenceId, patch.referenceId))
    }

    // 2. Patch the checkout message (the "Review and Pay" template we sent)
    // Use checkoutMsgId from the order; fall back to the webhook id if not found
    const checkoutMsgId = order?.checkoutMsgId || messageId
    await db.update(messages)
      .set({ templateData: sql`COALESCE(${messages.templateData}, '{}') || ${JSON.stringify(patch)}::jsonb` })
      .where(eq(messages.id, checkoutMsgId))

    console.log('[payment] patching checkoutMsgId:', checkoutMsgId, '| webhookId:', messageId)

    // 3. Insert a notification message so it surfaces in the chat poll
    const convId = order?.conversationId
    if (convId) {
      const amtRupees = p?.amount?.value ? (p.amount.value / (p.amount.offset || 100)).toFixed(2) : '?'
      const notifText = status === 'captured'
        ? `✅ Payment received ₹${amtRupees} · Order ${p?.reference_id || ''} · Txn ${p?.transaction?.pg_transaction_id || p?.transaction?.id || ''}`
        : `❌ Payment ${status} · Order ${p?.reference_id || ''}`

      await db.insert(messages).values({
        id:             `pay_notif_${patch.referenceId}`,
        conversationId: convId,
        fromNumber:     order?.phone || '',
        toNumber:       PHONE_NUMBER_ID,
        type:           'text' as any,
        text:           notifText,
        templateData:   patch as any,
        status:         'delivered' as any,
        isOutgoing:     true,
        sentAt:         now,
      }).onConflictDoNothing()

      await db.update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, convId))
    }

    console.log('[payment]', status, '| ref:', p?.reference_id, '| msg:', messageId)
    return
  }

  const valid = ['sent', 'delivered', 'read', 'failed']
  if (!valid.includes(status)) return

  await db.update(messages).set({ status: status as any }).where(eq(messages.id, messageId))

  await db.insert(messageStatusLog).values({
    messageId,
    status: status as any,
    loggedAt: new Date(parseInt(timestamp) * 1000),
  }).onConflictDoNothing()

}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const VALID_TYPES = new Set([
  'text', 'image', 'document', 'audio', 'video',
  'template', 'interactive', 'sticker', 'location', 'contacts',
])

function mapType(waType: string): string {
  if (VALID_TYPES.has(waType)) return waType
  if (waType === 'button')  return 'interactive'
  if (waType === 'order')   return 'interactive'
  if (waType === 'payment') return 'text'
  return 'text'
}

function extractText(msg: any): string | null {
  switch (msg.type) {
    case 'text':        return msg.text?.body || null
    case 'interactive': {
      const ia = msg.interactive
      if (ia?.type === 'button_reply')    return ia.button_reply?.title || null
      if (ia?.type === 'list_reply')      return ia.list_reply?.title   || null
      if (ia?.type === 'catalog_message') return ia.body?.text          || null
      if (ia?.type === 'nfm_reply')       return ia.nfm_reply?.body     || '📋 Form submitted'
      return null
    }
    case 'button':      return msg.button?.text || null
    case 'location':    return `📍 Location${msg.location?.name ? ' — ' + msg.location.name : ''}`
    case 'contacts':    return `👤 ${msg.contacts?.[0]?.name?.formatted_name || 'Contact shared'}`
    case 'order': {
      const items = msg.order?.product_items || []
      const count = items.length
      const total = items.reduce((sum: number, i: any) => sum + (i.item_price || 0) * (i.quantity || 1), 0)
      const currency = items[0]?.currency || 'INR'
      return `🛒 ${count} item${count !== 1 ? 's' : ''} · ${currency} ${total.toFixed(2)}`
    }
    case 'payment': {
      const p      = msg.payment
      const status = p?.status as string | undefined
      const amt    = p?.transaction?.amount
      const amtStr = amt ? `₹${(amt.value / amt.offset).toFixed(2)}` : ''
      const ref    = p?.reference_id ? ` · Order ${p.reference_id}` : ''
      const txn    = p?.transaction?.id ? ` · Txn ${p.transaction.id}` : ''
      if (status === 'captured') return `✅ Payment received ${amtStr}${ref}${txn}`
      return `❌ Payment ${status || 'failed'}${ref}`
    }
    default:            return null
  }
}

// Extra JSON stored for interactive/button/order/catalog messages
function extractTemplateData(msg: any): Record<string, string> | undefined {
  if (msg.type === 'interactive') {
    const ia = msg.interactive
    if (ia?.type === 'catalog_message') {
      return {
        interactiveType:   'catalog_message',
        productRetailerId: ia.action?.thumbnail_product_retailer_id || '',
        contextMsgId:      msg.context?.id || '',
      }
    }
    if (ia?.type === 'nfm_reply') {
      return {
        interactiveType: 'nfm_reply',
        responseJson:    ia.nfm_reply?.response_json || '',
        flowName:        ia.nfm_reply?.name          || '',
      }
    }
    return {
      interactiveType: ia?.type || '',
      buttonTitle: ia?.button_reply?.title || ia?.list_reply?.title || '',
      buttonId:    ia?.button_reply?.id    || ia?.list_reply?.id    || '',
      contextMsgId: msg.context?.id || '',
    }
  }
  if (msg.type === 'button') {
    return {
      interactiveType: 'button_reply',
      buttonTitle:  msg.button?.text    || '',
      buttonId:     msg.button?.payload || '',
      contextMsgId: msg.context?.id     || '',
    }
  }
  if (msg.type === 'order') {
    return {
      interactiveType: 'order',
      catalogId:    msg.order?.catalog_id || '',
      productItems: JSON.stringify(msg.order?.product_items || []),
    }
  }
  if (msg.type === 'payment') {
    const p = msg.payment
    return {
      interactiveType: 'payment',
      referenceId:     p?.reference_id              || '',
      status:          p?.status                    || '',
      transactionId:   p?.transaction?.id           || '',
      amount:          String(p?.transaction?.amount?.value  || ''),
      offset:          String(p?.transaction?.amount?.offset || '100'),
      currency:        p?.transaction?.currency     || 'INR',
    }
  }
  return undefined
}

function extractMedia(msg: any) {
  const src = msg.image || msg.video || msg.document || msg.audio || msg.sticker
  if (!src) return {}
  return {
    mediaId:       src.id            || null,
    mediaMimeType: src.mime_type     || null,
    mediaFilename: msg.document?.filename || null,
    mediaCaption:  src.caption       || null,
  }
}
