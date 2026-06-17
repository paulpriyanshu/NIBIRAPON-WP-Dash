import { NextRequest } from 'next/server';
import { getPublicProductById } from '@/lib/queries/inventory';
import { checkApiKey, preflight, publicJson, shapeMedia } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return preflight();
}

// GET /api/public/products/:id — a single active product (or variant) with its
// active variants and browser-fetchable media URLs.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const { origin } = new URL(req.url);
    const product = await getPublicProductById(id);
    if (!product) return publicJson({ error: 'Product not found' }, 404);

    return publicJson({
      ...product,
      media: shapeMedia(origin, product.media),
      variants: product.variants.map(v => ({ ...v, media: shapeMedia(origin, v.media) })),
    });
  } catch (err) {
    return publicJson({ error: err instanceof Error ? err.message : 'Failed to load product' }, 500);
  }
}
