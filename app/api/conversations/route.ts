import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { conversations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getConversations } from '@/lib/queries/conversations';

export async function GET() {
  try {
    return NextResponse.json(await getConversations());
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
