import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { catalogProducts, type ProductMedia } from '@/db/schema';
import { eq } from 'drizzle-orm';

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      name, description, priceRange, category, fabric, occasions,
      customInfo, media, isActive, inAgentContext,
    } = body;

    // Toggling agent-context alone doesn't change product content, so keep the
    // embedding. Any change to a content/media field invalidates it for re-sync.
    const contentChanged = [
      name, description, priceRange, category, fabric, occasions, customInfo, media,
    ].some(v => v !== undefined);

    await db
      .update(catalogProducts)
      .set({
        ...(name           !== undefined && { name }),
        ...(description    !== undefined && { description }),
        ...(priceRange     !== undefined && { priceRange }),
        ...(category       !== undefined && { category }),
        ...(fabric         !== undefined && { fabric }),
        ...(occasions      !== undefined && { occasions }),
        ...(customInfo     !== undefined && { customInfo }),
        ...(media          !== undefined && { media: cleanMedia(media) }),
        ...(isActive       !== undefined && { isActive }),
        ...(inAgentContext !== undefined && { inAgentContext }),
        // Clear embedding so it gets re-synced with updated info
        ...(contentChanged && { embedding: null, syncedAt: null }),
        updatedAt: new Date(),
      })
      .where(eq(catalogProducts.id, id));

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await db.delete(catalogProducts).where(eq(catalogProducts.id, id));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
