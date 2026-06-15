import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { catalogProducts, categories } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, imageUrl, imageAssetId, sortOrder, inAgentContext } = body;

    await db
      .update(categories)
      .set({
        ...(name           !== undefined && { name: String(name).trim() }),
        ...(description    !== undefined && { description: description || null }),
        ...(imageUrl       !== undefined && { imageUrl: imageUrl || null }),
        ...(imageAssetId   !== undefined && { imageAssetId: imageAssetId || null }),
        ...(sortOrder      !== undefined && { sortOrder: Number(sortOrder) || 0 }),
        ...(inAgentContext !== undefined && { inAgentContext: !!inAgentContext }),
        updatedAt: new Date(),
      })
      .where(eq(categories.id, id));

    // Keep the denormalized `category` name on products in sync when renamed.
    if (name !== undefined) {
      await db
        .update(catalogProducts)
        .set({ category: String(name).trim() })
        .where(eq(catalogProducts.categoryId, id));
    }

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
    // The FK (onDelete: set null) clears categoryId; also clear the denormalized
    // name so orphaned products don't show a stale category.
    await db
      .update(catalogProducts)
      .set({ category: null })
      .where(eq(catalogProducts.categoryId, id));
    await db.delete(categories).where(eq(categories.id, id));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
