import { NextRequest, NextResponse } from 'next/server';
import { customMessagesColl, serializeCustomMessage, toObjectId } from '@/lib/custom-message-store';
import { cleanCustomMessage } from '@/lib/custom-messages';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const doc = await (await customMessagesColl()).findOne({ _id });
    if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(serializeCustomMessage(doc));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const clean = cleanCustomMessage(await req.json());
    await (await customMessagesColl()).updateOne({ _id }, { $set: { ...clean, updatedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    await (await customMessagesColl()).deleteOne({ _id });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
