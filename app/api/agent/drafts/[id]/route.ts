import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { agentDrafts } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { name, content, triggerHint, isActive, templateName, language, templateConfig } = await req.json();

    await db
      .update(agentDrafts)
      .set({
        ...(name           !== undefined && { name }),
        ...(content        !== undefined && { content }),
        ...(triggerHint    !== undefined && { triggerHint }),
        ...(isActive       !== undefined && { isActive }),
        ...(templateName   !== undefined && { templateName }),
        ...(language       !== undefined && { language }),
        ...(templateConfig !== undefined && { templateConfig }),
        updatedAt: new Date(),
      })
      .where(eq(agentDrafts.id, id));

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await db.delete(agentDrafts).where(eq(agentDrafts.id, id));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
