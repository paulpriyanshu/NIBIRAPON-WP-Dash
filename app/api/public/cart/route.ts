import { NextRequest } from 'next/server';
import { getCartByToken } from '@/lib/queries/cart';
import { checkApiKey, preflight, publicJson } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return preflight();
}

// GET /api/public/cart?token=… — the storefront cart for a guest token.
export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const token = new URL(req.url).searchParams.get('token');
  if (!token) return publicJson({ error: 'Missing token' }, 400);

  try {
    return publicJson(await getCartByToken(token));
  } catch (err) {
    return publicJson({ error: err instanceof Error ? err.message : 'Failed to load cart' }, 500);
  }
}
