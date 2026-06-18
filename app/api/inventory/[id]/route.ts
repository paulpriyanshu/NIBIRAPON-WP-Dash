import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { catalogProducts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { cleanMedia, cleanVariantAttributes, cleanTags, categoryNameById } from '@/lib/inventory-write';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      name, description, priceRange, categoryId, fabric, occasions,
      customInfo, contentId, tags, media, isActive, inAgentContext, featured, parentId, variantAttributes,
    } = body;

    // Toggling agent-context alone doesn't change product content, so keep the
    // embedding. Any change to a content/media field invalidates it for re-sync.
    const contentChanged = [
      name, description, priceRange, categoryId, fabric, occasions, customInfo, tags, media, variantAttributes,
    ].some(v => v !== undefined);

    // When the category changes, re-derive the denormalized `category` name.
    const categoryName = categoryId !== undefined ? await categoryNameById(categoryId) : undefined;

    await db
      .update(catalogProducts)
      .set({
        ...(name              !== undefined && { name }),
        ...(description       !== undefined && { description }),
        ...(priceRange        !== undefined && { priceRange }),
        ...(categoryId        !== undefined && { categoryId: categoryId || null, category: categoryName }),
        ...(fabric            !== undefined && { fabric }),
        ...(occasions         !== undefined && { occasions }),
        ...(customInfo        !== undefined && { customInfo }),
        ...(contentId         !== undefined && { contentId: contentId?.trim() || null }),
        ...(tags              !== undefined && { tags: cleanTags(tags) }),
        ...(media             !== undefined && { media: cleanMedia(media) }),
        ...(parentId          !== undefined && { parentId: parentId || null }),
        ...(variantAttributes !== undefined && { variantAttributes: cleanVariantAttributes(variantAttributes) }),
        ...(isActive          !== undefined && { isActive }),
        ...(inAgentContext    !== undefined && { inAgentContext }),
        ...(featured          !== undefined && { featured }),
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
