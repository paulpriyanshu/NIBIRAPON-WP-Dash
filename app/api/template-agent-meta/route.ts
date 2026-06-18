import { NextRequest, NextResponse } from 'next/server';
import { templateAgentMetaColl } from '@/lib/template-store';

// Agent instructions attached to a raw WhatsApp template (keyed by templateName).
// These are app-local — saving them never resets the template's Meta approval.

export async function GET(req: NextRequest) {
  try {
    const name = new URL(req.url).searchParams.get('name');
    const coll = await templateAgentMetaColl();
    if (name) {
      const doc = await coll.findOne({ templateName: name });
      return NextResponse.json(doc
        ? { templateName: doc.templateName, agentDescription: doc.agentDescription ?? '', whenToSend: doc.whenToSend ?? '' }
        : { templateName: name, agentDescription: '', whenToSend: '' });
    }
    const docs = await coll.find({}).toArray();
    return NextResponse.json(docs.map(d => ({
      templateName: d.templateName,
      agentDescription: d.agentDescription ?? '',
      whenToSend: d.whenToSend ?? '',
    })));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { templateName, agentDescription, whenToSend } = await req.json();
    if (!templateName?.trim()) return NextResponse.json({ error: 'templateName is required' }, { status: 400 });

    const coll = await templateAgentMetaColl();
    await coll.updateOne(
      { templateName: templateName.trim() },
      {
        $set: {
          templateName: templateName.trim(),
          agentDescription: agentDescription?.trim() || undefined,
          whenToSend: whenToSend?.trim() || undefined,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
