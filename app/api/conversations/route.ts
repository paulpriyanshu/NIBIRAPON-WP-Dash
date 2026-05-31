import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { conversations, contacts, messages, contactTags, conversationTags } from '@/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';

/**
 * Returns the canonical phone number so that 91XXXXXXXXXX and XXXXXXXXXX
 * (bare 10-digit Indian mobile) both map to the same key.
 */
function canonicalPhone(phone: string): string {
  const s = phone.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(s)) return `91${s}`;   // bare 10-digit → add 91
  if (/^091[6-9]\d{9}$/.test(s)) return s.slice(1); // 0-prefixed 91 → drop 0
  return s;
}

export async function GET() {
  try {
    // Fetch all conversations with their contact
    const rows = await db
      .select()
      .from(conversations)
      .innerJoin(contacts, eq(conversations.contactId, contacts.id))
      .orderBy(desc(conversations.isPinned), desc(conversations.updatedAt));

    if (rows.length === 0) return NextResponse.json([]);

    const convIds = rows.map((r) => r.conversations.id);
    const contactIds = rows.map((r) => r.contacts.id);

    // Fetch last message per conversation (latest by sentAt)
    const allLatestMessages = await db
      .selectDistinctOn([messages.conversationId])
      .from(messages)
      .where(inArray(messages.conversationId, convIds))
      .orderBy(messages.conversationId, desc(messages.sentAt));

    const lastMsgByConv = Object.fromEntries(
      allLatestMessages.map((m) => [m.conversationId, m])
    );

    // Fetch tags for contacts
    const allContactTags = await db
      .select()
      .from(contactTags)
      .where(inArray(contactTags.contactId, contactIds));

    const tagsByContact: Record<string, string[]> = {};
    for (const t of allContactTags) {
      if (!tagsByContact[t.contactId]) tagsByContact[t.contactId] = [];
      tagsByContact[t.contactId].push(t.tag);
    }

    // Fetch tags for conversations
    const allConvTags = await db
      .select()
      .from(conversationTags)
      .where(inArray(conversationTags.conversationId, convIds));

    const tagsByConv: Record<string, string[]> = {};
    for (const t of allConvTags) {
      if (!tagsByConv[t.conversationId]) tagsByConv[t.conversationId] = [];
      tagsByConv[t.conversationId].push(t.tag);
    }

    // Shape response to match the Conversation type the frontend expects
    const result = rows.map(({ conversations: conv, contacts: contact }) => {
      const lastMsg = lastMsgByConv[conv.id];
      return {
        id: conv.id,
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          company: contact.company,
          isOnline: contact.isOnline,
          lastSeen: contact.lastSeen?.toISOString(),
          notes: contact.notes,
          leadStatus: contact.leadStatus,
          leadValue: contact.leadValue ? Number(contact.leadValue) : 0,
          tags: tagsByContact[contact.id] || [],
        },
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              conversationId: lastMsg.conversationId,
              from: lastMsg.fromNumber,
              to: lastMsg.toNumber,
              type: lastMsg.type,
              text: lastMsg.text,
              timestamp: lastMsg.sentAt.getTime(),
              status: lastMsg.status,
              isOutgoing: lastMsg.isOutgoing,
              isDeleted: lastMsg.isDeleted,
              isStarred: lastMsg.isStarred,
              templateName: lastMsg.templateName,
            }
          : undefined,
        unreadCount:  conv.unreadCount,
        status:       conv.status,
        assignedTo:   conv.assignedTo,
        isPinned:     conv.isPinned,
        isArchived:   conv.isArchived,
        isMuted:      conv.isMuted,
        agentEnabled: conv.agentEnabled,
        tags:         tagsByConv[conv.id] || [],
        createdAt:    conv.createdAt.getTime(),
        updatedAt:    conv.updatedAt.getTime(),
      };
    });

    // ── Deduplicate: group conversations whose contacts share the same
    //    canonical phone (e.g. 91XXXXXXXXXX vs XXXXXXXXXX).
    //    Keep the most-recently-updated conversation as the representative;
    //    sum unread counts; use whichever lastMessage is newest.
    const phoneGroups = new Map<string, typeof result>();
    for (const conv of result) {
      const key = canonicalPhone(conv.contact.phone);
      if (!phoneGroups.has(key)) phoneGroups.set(key, []);
      phoneGroups.get(key)!.push(conv);
    }

    const deduped = Array.from(phoneGroups.values()).map(group => {
      if (group.length === 1) return group[0];

      // Primary = most recently active conversation
      group.sort((a, b) => b.updatedAt - a.updatedAt);
      const primary = { ...group[0] };

      // Aggregate unread across all duplicates
      primary.unreadCount = group.reduce((s, c) => s + c.unreadCount, 0);

      // Use the newest lastMessage from any duplicate
      const newest = group
        .filter(c => c.lastMessage)
        .sort((a, b) => (b.lastMessage!.timestamp) - (a.lastMessage!.timestamp))[0];
      if (newest) primary.lastMessage = newest.lastMessage;

      // Normalise the stored phone to canonical form
      primary.contact = {
        ...primary.contact,
        phone: canonicalPhone(primary.contact.phone),
      };

      return primary;
    });

    // Restore sort: pinned first, then by updatedAt desc
    deduped.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.updatedAt - a.updatedAt;
    });

    return NextResponse.json(deduped);
  } catch (err: any) {
    console.error('[Conversations API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — update conversation status, pin, mute, assignee
export async function PATCH(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const allowed = ['status', 'isPinned', 'isMuted', 'isArchived', 'assignedTo', 'unreadCount', 'agentEnabled'] as const;
    const patch: Record<string, any> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (key in updates) patch[key] = updates[key];
    }

    await db.update(conversations).set(patch).where(eq(conversations.id, id));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
