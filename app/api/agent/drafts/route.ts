import { NextRequest, NextResponse } from 'next/server';
import { agentDraftsColl, serializeId } from '@/lib/template-store';

export async function GET() {
  try {
    const coll = await agentDraftsColl();
    const rows = await coll.find({}).sort({ createdAt: -1 }).toArray();
    return NextResponse.json(rows.map(serializeId));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, kind = 'text', content, triggerHint, templateMessageId } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (kind === 'template') {
      if (!templateMessageId) return NextResponse.json({ error: 'templateMessageId is required for a template draft' }, { status: 400 });
    } else if (!content?.trim()) {
      return NextResponse.json({ error: 'content is required for a text draft' }, { status: 400 });
    }

    const now = new Date();
    const coll = await agentDraftsColl();
    const result = await coll.insertOne({
      name:              name.trim(),
      kind,
      content:           kind === 'template' ? '' : content.trim(),
      triggerHint:       triggerHint || null,
      templateMessageId: kind === 'template' ? templateMessageId : undefined,
      isActive:          true,
      createdAt:         now,
      updatedAt:         now,
    });

    return NextResponse.json({ id: result.insertedId.toString() }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
