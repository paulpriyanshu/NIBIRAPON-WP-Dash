import { NextRequest, NextResponse } from 'next/server';
import { templateMessagesColl, serializeId } from '@/lib/template-store';

export async function GET() {
  try {
    const coll = await templateMessagesColl();
    const rows = await coll.find({}).sort({ createdAt: -1 }).toArray();
    return NextResponse.json(rows.map(serializeId));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, templateName, language, config, preview } = await req.json();
    if (!name?.trim())     return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!templateName)     return NextResponse.json({ error: 'templateName is required' }, { status: 400 });

    const now = new Date();
    const coll = await templateMessagesColl();
    const result = await coll.insertOne({
      name:         name.trim(),
      templateName,
      language:     language || 'en',
      config:       config ?? {},
      preview:      preview ?? '',
      createdAt:    now,
      updatedAt:    now,
    });

    return NextResponse.json({ id: result.insertedId.toString() }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
