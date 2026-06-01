import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { catalogProducts } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, priceRange, category, fabric, occasions, imageUrl, isActive, customInfo } = body;

    await db
      .update(catalogProducts)
      .set({
        ...(name        !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(priceRange  !== undefined && { priceRange }),
        ...(category    !== undefined && { category }),
        ...(fabric      !== undefined && { fabric }),
        ...(occasions   !== undefined && { occasions }),
        ...(imageUrl    !== undefined && { imageUrl }),
        ...(isActive    !== undefined && { isActive }),
        ...(customInfo  !== undefined && { customInfo }),
        // Clear embedding so it gets re-synced with updated info
        embedding: null,
        syncedAt:  null,
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
