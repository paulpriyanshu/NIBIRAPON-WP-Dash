import { NextResponse } from 'next/server'
import { db } from '@/db'
import { contacts, conversations, leads, broadcastRecipients } from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'

const WABA_ID        = process.env.WHATSAPP_WABA_ID        || '1225694708548053'
const PHONE_ID       = process.env.WHATSAPP_PHONE_NUMBER_ID || '680420725151873'
const ACCESS_TOKEN   = process.env.WHATSAPP_ACCESS_TOKEN   || ''
const GRAPH_BASE     = 'https://graph.facebook.com/v25.0'

// ─── POST: Pull what's available from Meta + seed from broadcast history ──────
export async function POST() {
  const results = {
    templatesSync: false,
    contactsFromBroadcast: 0,
    conversationsFromMeta:  0,
    metaHistoryAvailable:  false,
    note: '',
  }

  // ── 1. Try Meta WABA conversations endpoint ────────────────────────────────
  // Note: WhatsApp Cloud API does NOT expose historical message content.
  // The /conversations endpoint returns billing-level data only (no message body).
  // We attempt it anyway to at least create contacts from any phone numbers returned.
  if (ACCESS_TOKEN && ACCESS_TOKEN !== 'your_access_token_here') {
    try {
      const res = await fetch(
        `${GRAPH_BASE}/${WABA_ID}/conversations?fields=id,expiration_timestamp,origin,user_id&limit=100`,
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
      )
      const data = await res.json()

      if (res.ok && Array.isArray(data.data)) {
        // Meta returns billing conversations — user_id may or may not be present
        const phones: string[] = data.data
          .map((c: any) => c.user_id || '')
          .filter((p: string) => p.length >= 10)

        for (const phone of phones) {
          await upsertContactAndConversation(phone, phone)
          results.conversationsFromMeta++
        }
        results.metaHistoryAvailable = phones.length > 0
      }
    } catch {
      // Meta doesn't always allow this — silent fallback
    }

    results.templatesSync = true
  }

  // ── 2. Seed contacts from our own broadcast recipient history ──────────────
  // Any phone number we ever broadcast to should have a contact + conversation.
  const recipients = await db
    .select({ phone: broadcastRecipients.phone })
    .from(broadcastRecipients)

  const uniquePhones = [...new Set(recipients.map((r) => r.phone))]

  for (const phone of uniquePhones) {
    const created = await upsertContactAndConversation(phone, phone)
    if (created) results.contactsFromBroadcast++
  }

  results.note = results.metaHistoryAvailable
    ? 'Meta conversations synced. Note: WhatsApp API does not expose historical message content — only future messages via webhook are stored.'
    : 'Contacts synced from broadcast history. Note: WhatsApp Cloud API does not provide historical message retrieval — messages are captured in real-time via webhook only.'

  return NextResponse.json(results)
}

// ── Upsert a contact + open conversation, return true if contact was created ──
async function upsertContactAndConversation(phone: string, name: string): Promise<boolean> {
  let created = false

  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      sql`${contacts.phone} = ${phone}
          OR ${phone} LIKE '%' || ${contacts.phone}
          OR ${contacts.phone} LIKE '%' || ${phone}`
    )
    .limit(1)

  let contactId: string

  if (existing) {
    contactId = existing.id
  } else {
    const [newContact] = await db.insert(contacts).values({
      name,
      phone,
      leadStatus: 'contacted',
    }).returning()
    contactId = newContact.id
    created = true

    await db.insert(leads).values({
      contactId,
      status: 'contacted',
      source: 'Broadcast',
      value: '0',
    })
  }

  // Ensure an open conversation exists
  const [existingConv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.contactId, contactId), eq(conversations.status, 'open')))
    .limit(1)

  if (!existingConv) {
    await db.insert(conversations).values({
      contactId,
      status: 'open',
      unreadCount: 0,
    })
  }

  return created
}
