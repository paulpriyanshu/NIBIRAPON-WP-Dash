import { NextRequest, NextResponse } from 'next/server';
import { agentDraftsColl, toObjectId } from '@/lib/template-store';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const { name, content, triggerHint, description, isActive, templateMessageId } = await req.json();
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (name              !== undefined) set.name = name;
    if (content           !== undefined) set.content = content;
    if (triggerHint       !== undefined) set.triggerHint = triggerHint;
    if (description       !== undefined) set.description = description;
    if (isActive          !== undefined) set.isActive = isActive;
    if (templateMessageId !== undefined) set.templateMessageId = templateMessageId;

    const coll = await agentDraftsColl();
    await coll.updateOne({ _id }, { $set: set });
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
    const _id = toObjectId(id);
    if (!_id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const coll = await agentDraftsColl();
    await coll.deleteOne({ _id });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
