import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createMessageTemplate } from '@/lib/whatsapp-api';
import { getLiveTemplates } from '@/lib/queries/templates';

// Always fetch fresh from the Meta API (no route-level caching).
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getLiveTemplates());
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
    revalidateTag('templates', 'max'); // mark the cached catalog stale (stale-while-revalidate)
    return NextResponse.json({ success: true, id: result.id, status: result.status });
  } catch (err: any) {
    console.error('[Templates POST]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
