import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { agentDrafts } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db.select().from(agentDrafts).orderBy(desc(agentDrafts.createdAt));
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, content, triggerHint } = await req.json();
    if (!name?.trim() || !content?.trim()) {
      return NextResponse.json({ error: 'name and content are required' }, { status: 400 });
    }

    const [inserted] = await db
      .insert(agentDrafts)
      .values({ name: name.trim(), content: content.trim(), triggerHint: triggerHint || null })
      .returning({ id: agentDrafts.id });

    return NextResponse.json({ id: inserted.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
