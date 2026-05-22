import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { conversations, contacts, messages, contactTags, conversationTags } from '@/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';

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
        unreadCount: conv.unreadCount,
        status: conv.status,
        assignedTo: conv.assignedTo,
        isPinned: conv.isPinned,
        isArchived: conv.isArchived,
        isMuted: conv.isMuted,
        tags: tagsByConv[conv.id] || [],
        createdAt: conv.createdAt.getTime(),
        updatedAt: conv.updatedAt.getTime(),
      };
    });

    return NextResponse.json(result);
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

    const allowed = ['status', 'isPinned', 'isMuted', 'isArchived', 'assignedTo', 'unreadCount'] as const;
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
