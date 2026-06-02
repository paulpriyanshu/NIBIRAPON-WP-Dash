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
    const { name, kind = 'text', content, triggerHint, templateName, language, templateConfig } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (kind === 'template') {
      if (!templateName) return NextResponse.json({ error: 'templateName is required for a template draft' }, { status: 400 });
    } else if (!content?.trim()) {
      return NextResponse.json({ error: 'content is required for a text draft' }, { status: 400 });
    }

    const [inserted] = await db
      .insert(agentDrafts)
      .values({
        name:           name.trim(),
        kind,
        content:        kind === 'template' ? '' : content.trim(),
        triggerHint:    triggerHint || null,
        templateName:   kind === 'template' ? templateName : null,
        language:       kind === 'template' ? (language || 'en') : null,
        templateConfig: kind === 'template' ? (templateConfig ?? {}) : null,
      })
      .returning({ id: agentDrafts.id });

    return NextResponse.json({ id: inserted.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
