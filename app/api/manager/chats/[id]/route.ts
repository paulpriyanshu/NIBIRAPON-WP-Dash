import { NextRequest, NextResponse } from 'next/server';
import { managerChatsColl, serializeChat, toObjectId } from '@/lib/manager-store';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const coll = await managerChatsColl();
    const doc = await coll.findOne({ _id });
    if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(serializeChat(doc));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const coll = await managerChatsColl();
    await coll.deleteOne({ _id });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
