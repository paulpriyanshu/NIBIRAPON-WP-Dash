import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { catalogProducts, type ProductMedia } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db
      .select({
        id:             catalogProducts.id,
        name:           catalogProducts.name,
        description:    catalogProducts.description,
        priceRange:     catalogProducts.priceRange,
        category:       catalogProducts.category,
        fabric:         catalogProducts.fabric,
        occasions:      catalogProducts.occasions,
        media:          catalogProducts.media,
        customInfo:     catalogProducts.customInfo,
        isActive:       catalogProducts.isActive,
        inAgentContext: catalogProducts.inAgentContext,
        syncedAt:       catalogProducts.syncedAt,
        createdAt:      catalogProducts.createdAt,
        // Exclude the large embedding array — not needed by the UI
      })
      .from(catalogProducts)
      .orderBy(desc(catalogProducts.createdAt));

    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function cleanMedia(media: unknown): ProductMedia[] {
  if (!Array.isArray(media)) return [];
  return media
    .filter((m): m is ProductMedia => !!m && (m.type === 'image' || m.type === 'video') && (!!m.url || !!m.assetId))
    .map(m => ({
      type:        m.type,
      url:         m.url        || undefined,
      assetId:     m.assetId    || undefined,
      mimeType:    m.mimeType   || undefined,
      description: m.description || undefined,
    }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, priceRange, category, fabric, occasions, customInfo, media, inAgentContext } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const [inserted] = await db
      .insert(catalogProducts)
      .values({
        name:           name.trim(),
        description:    description || null,
        priceRange:     priceRange  || null,
        category:       category    || null,
        fabric:         fabric      || null,
        occasions:      occasions   || null,
        customInfo:     customInfo  || null,
        media:          cleanMedia(media),
        inAgentContext: !!inAgentContext,
      })
      .returning({ id: catalogProducts.id });

    return NextResponse.json({ id: inserted.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
