import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { templateSnapshots } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db.select().from(templateSnapshots).orderBy(desc(templateSnapshots.createdAt));
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { label, templateName, language = 'en', bodyParams = [], headerParam = '', headerMediaUrl, recipients = [], source = 'dm' } = body;
    if (!templateName) return NextResponse.json({ error: 'templateName required' }, { status: 400 });

    const [row] = await db.insert(templateSnapshots).values({
      label: label || `${templateName} — ${new Date().toLocaleString('en-IN')}`,
      templateName,
      language,
      bodyParams,
      headerParam,
      headerMediaUrl: headerMediaUrl || null,
      recipients,
      sentCount: recipients.length,
      source,
    }).returning();
    return NextResponse.json(row);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
