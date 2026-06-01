import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { catalogProducts } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db
      .select({
        id: catalogProducts.id,
        name: catalogProducts.name,
        description: catalogProducts.description,
        priceRange: catalogProducts.priceRange,
        category: catalogProducts.category,
        fabric: catalogProducts.fabric,
        occasions: catalogProducts.occasions,
        imageUrl: catalogProducts.imageUrl,
        isActive: catalogProducts.isActive,
        syncedAt: catalogProducts.syncedAt,
        createdAt: catalogProducts.createdAt,
        // Don't return the embedding array — it's large and not needed by the UI
      })
      .from(catalogProducts)
      .orderBy(desc(catalogProducts.createdAt));

    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, priceRange, category, fabric, occasions, imageUrl } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const [inserted] = await db
      .insert(catalogProducts)
      .values({
        name:        name.trim(),
        description: description || null,
        priceRange:  priceRange  || null,
        category:    category    || null,
        fabric:      fabric      || null,
        occasions:   occasions   || null,
        imageUrl:    imageUrl    || null,
      })
      .returning({ id: catalogProducts.id });

    return NextResponse.json({ id: inserted.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
