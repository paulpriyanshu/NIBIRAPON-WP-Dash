import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { templates } from '@/db/schema';
import { getMessageTemplates, createMessageTemplate } from '@/lib/whatsapp-api';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const wabaId = process.env.WHATSAPP_WABA_ID;

    // Try to sync from WhatsApp API if credentials exist
    if (accessToken && wabaId && accessToken !== 'your_access_token_here') {
      try {
        const waData = await getMessageTemplates();
        const waTemplates = waData.data || [];

        if (waTemplates.length > 0) {
          // Upsert each template
          for (const t of waTemplates) {
            await db
              .insert(templates)
              .values({
                id: t.id || `wa_${t.name}`,
                name: t.name,
                language: t.language || 'en',
                status: t.status as any,
                category: t.category as any,
                components: t.components || [],
                syncedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: templates.id,
                set: {
                  status: t.status as any,
                  components: t.components || [],
                  syncedAt: new Date(),
                },
              });
          }
        }
      } catch (apiErr) {
        console.error('[Templates] WhatsApp API sync failed, serving DB cache:', apiErr);
      }
    }

    // Always return from DB (cached or seeded)
    const rows = await db.select().from(templates).orderBy(desc(templates.syncedAt));

    const shaped = rows.map((t) => ({
      id: t.id,
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category,
      components: t.components,
    }));

    return NextResponse.json(shaped);
  } catch (err: any) {
    console.error('[Templates API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST: Create a new message template ─────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { name, language, category, components } = await req.json();

    if (!name || !language || !category || !components?.length) {
      return NextResponse.json(
        { error: 'name, language, category, and components are required' },
        { status: 400 }
      );
    }

    // Validate template name: lowercase, underscores only
    if (!/^[a-z0-9_]+$/.test(name)) {
      return NextResponse.json(
        { error: 'Template name must be lowercase letters, numbers, and underscores only' },
        { status: 400 }
      );
    }

    const result = await createMessageTemplate({ name, language, category, components });
    return NextResponse.json({ success: true, id: result.id, status: result.status });
  } catch (err: any) {
    console.error('[Templates POST]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
