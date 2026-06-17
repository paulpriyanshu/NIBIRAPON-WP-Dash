import { NextRequest, NextResponse } from 'next/server';
import { templateMessagesColl, toObjectId, serializeId } from '@/lib/template-store';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const { name, templateName, language, config, preview, agentDescription, whenToSend } = await req.json();
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (name             !== undefined) set.name = name;
    if (templateName     !== undefined) set.templateName = templateName;
    if (language         !== undefined) set.language = language;
    if (config           !== undefined) set.config = config;
    if (preview          !== undefined) set.preview = preview;
    if (agentDescription !== undefined) set.agentDescription = agentDescription?.trim() || undefined;
    if (whenToSend       !== undefined) set.whenToSend = whenToSend?.trim() || undefined;

    const coll = await templateMessagesColl();
    await coll.updateOne({ _id }, { $set: set });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const coll = await templateMessagesColl();
    await coll.deleteOne({ _id });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Duplicate a saved template message. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const _id = toObjectId(id);
    if (!_id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const coll = await templateMessagesColl();
    const src = await coll.findOne({ _id });
    if (!src) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const now = new Date();
    const { _id: _omit, ...rest } = src;
    const result = await coll.insertOne({
      ...rest,
      name: `${src.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ id: result.insertedId.toString() }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
