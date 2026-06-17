import { NextRequest } from 'next/server';
import { getPublicCategories } from '@/lib/queries/inventory';
import { checkApiKey, preflight, publicJson, publicMediaUrl } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return preflight();
}

// GET /api/public/categories — storefront categories with a browser-fetchable image URL.
export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const { origin } = new URL(req.url);
    const cats = await getPublicCategories();
    const shaped = cats.map(c => ({
      id:          c.id,
      name:        c.name,
      description: c.description,
      sortOrder:   c.sortOrder,
      image:       (c.imageAssetId || c.imageUrl)
        ? publicMediaUrl(origin, { assetId: c.imageAssetId, url: c.imageUrl })
        : null,
    }));
    return publicJson(shaped);
  } catch (err) {
    return publicJson({ error: err instanceof Error ? err.message : 'Failed to load categories' }, 500);
  }
}
