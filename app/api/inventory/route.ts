import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { catalogProducts } from '@/db/schema';
import { getInventoryPage, getAllInventory } from '@/lib/queries/inventory';
import { cleanMedia, cleanVariantAttributes, categoryNameById } from '@/lib/inventory-write';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');

    // Paginated mode (opt-in via ?limit=) → { items, nextCursor } for infinite scroll.
    if (limit) {
      const page = await getInventoryPage({
        limit: parseInt(limit, 10) || 30,
        cursor: searchParams.get('cursor'),
      });
      return NextResponse.json(page);
    }

    // Legacy: full array (the agent catalog tab and other callers rely on this).
    return NextResponse.json(await getAllInventory());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name, description, priceRange, categoryId, fabric, occasions,
      customInfo, contentId, media, inAgentContext, parentId, variantAttributes,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // The dropdown is the source of truth: derive the denormalized `category` name from categoryId.
    const categoryName = await categoryNameById(categoryId);

    const [inserted] = await db
      .insert(catalogProducts)
      .values({
        name:              name.trim(),
        description:       description || null,
        priceRange:        priceRange  || null,
        category:          categoryName,
        categoryId:        categoryId   || null,
        fabric:            fabric      || null,
        occasions:         occasions   || null,
        customInfo:        customInfo  || null,
        contentId:         contentId?.trim() || null,
        media:             cleanMedia(media),
        parentId:          parentId    || null,
        variantAttributes: cleanVariantAttributes(variantAttributes),
        inAgentContext:    !!inAgentContext,
      })
      .returning({ id: catalogProducts.id });

    return NextResponse.json({ id: inserted.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
