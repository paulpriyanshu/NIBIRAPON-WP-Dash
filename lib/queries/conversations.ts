import { db } from '@/db';
import { conversations, contacts, messages, contactTags, conversationTags } from '@/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';

/**
 * Canonical phone so 91XXXXXXXXXX and bare XXXXXXXXXX map to the same key
 * (used to merge duplicate conversations for the same person).
 */
export function canonicalPhone(phone: string): string {
  const s = phone.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(s)) return `91${s}`;
  if (/^091[6-9]\d{9}$/.test(s)) return s.slice(1);
  return s;
}

/**
 * The inbox conversation list: each conversation with its contact, last message,
 * tags, and unread count — deduplicated by canonical phone. Shared by the API
 * route and the server-rendered inbox page so the first screen needs no client fetch.
 */
export async function getConversations() {
  const rows = await db
    .select()
    .from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .orderBy(desc(conversations.isPinned), desc(conversations.updatedAt));

  if (rows.length === 0) return [];

  const convIds = rows.map((r) => r.conversations.id);
  const contactIds = rows.map((r) => r.contacts.id);

  const allLatestMessages = await db
    .selectDistinctOn([messages.conversationId])
    .from(messages)
    .where(inArray(messages.conversationId, convIds))
    .orderBy(messages.conversationId, desc(messages.sentAt));
  const lastMsgByConv = Object.fromEntries(allLatestMessages.map((m) => [m.conversationId, m]));

  const allContactTags = await db.select().from(contactTags).where(inArray(contactTags.contactId, contactIds));
  const tagsByContact: Record<string, string[]> = {};
  for (const t of allContactTags) (tagsByContact[t.contactId] ??= []).push(t.tag);

  const allConvTags = await db.select().from(conversationTags).where(inArray(conversationTags.conversationId, convIds));
  const tagsByConv: Record<string, string[]> = {};
  for (const t of allConvTags) (tagsByConv[t.conversationId] ??= []).push(t.tag);

  const result = rows.map(({ conversations: conv, contacts: contact }) => {
    const lastMsg = lastMsgByConv[conv.id];
    return {
      id: conv.id,
      contact: {
        id: contact.id, name: contact.name, phone: contact.phone, email: contact.email,
        company: contact.company, isOnline: contact.isOnline,
        lastSeen: contact.lastSeen?.toISOString(), notes: contact.notes,
        leadStatus: contact.leadStatus, leadValue: contact.leadValue ? Number(contact.leadValue) : 0,
        tags: tagsByContact[contact.id] || [],
      },
      lastMessage: lastMsg
        ? {
            id: lastMsg.id, conversationId: lastMsg.conversationId, from: lastMsg.fromNumber,
            to: lastMsg.toNumber, type: lastMsg.type, text: lastMsg.text,
            timestamp: lastMsg.sentAt.getTime(), status: lastMsg.status, isOutgoing: lastMsg.isOutgoing,
            isDeleted: lastMsg.isDeleted, isStarred: lastMsg.isStarred, templateName: lastMsg.templateName,
          }
        : undefined,
      unreadCount: conv.unreadCount, status: conv.status, assignedTo: conv.assignedTo,
      isPinned: conv.isPinned, isArchived: conv.isArchived, isMuted: conv.isMuted,
      agentEnabled: conv.agentEnabled, tags: tagsByConv[conv.id] || [],
      createdAt: conv.createdAt.getTime(), updatedAt: conv.updatedAt.getTime(),
    };
  });

  // Merge conversations whose contacts share a canonical phone.
  const phoneGroups = new Map<string, typeof result>();
  for (const conv of result) {
    const key = canonicalPhone(conv.contact.phone);
    (phoneGroups.get(key) ?? phoneGroups.set(key, []).get(key)!).push(conv);
  }

  const deduped = Array.from(phoneGroups.values()).map((group) => {
    if (group.length === 1) return group[0];
    group.sort((a, b) => b.updatedAt - a.updatedAt);
    const primary = { ...group[0] };
    primary.unreadCount = group.reduce((s, c) => s + c.unreadCount, 0);
    const newest = group.filter((c) => c.lastMessage).sort((a, b) => b.lastMessage!.timestamp - a.lastMessage!.timestamp)[0];
    if (newest) primary.lastMessage = newest.lastMessage;
    primary.contact = { ...primary.contact, phone: canonicalPhone(primary.contact.phone) };
    return primary;
  });

  deduped.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  return deduped;
}
