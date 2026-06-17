import { NextRequest } from 'next/server';
import { getPublicProductsPage } from '@/lib/queries/inventory';
import { checkApiKey, preflight, publicJson, shapeMedia } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return preflight();
}

// GET /api/public/products?limit=30&cursor=…&category=<categoryId>
// Active, top-level products (newest first), each with its active variants.
// Returns { items, nextCursor } — pass nextCursor back as ?cursor= for the next page.
export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const { searchParams, origin } = new URL(req.url);
    const { items, nextCursor } = await getPublicProductsPage({
      limit:      parseInt(searchParams.get('limit') ?? '30', 10) || 30,
      cursor:     searchParams.get('cursor'),
      categoryId: searchParams.get('category'),
    });

    const shaped = items.map(p => ({
      ...p,
      media: shapeMedia(origin, p.media),
      variants: p.variants.map(v => ({ ...v, media: shapeMedia(origin, v.media) })),
    }));

    return publicJson({ items: shaped, nextCursor });
  } catch (err) {
    return publicJson({ error: err instanceof Error ? err.message : 'Failed to load products' }, 500);
  }
}
