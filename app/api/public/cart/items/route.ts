import { NextRequest } from 'next/server';
import { addItem } from '@/lib/queries/cart';
import { checkApiKey, preflight, publicJson } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return preflight();
}

// POST /api/public/cart/items — add a product to the token's cart (increments
// quantity if it's already there). Body: { token, productId, name, price, image?, color?, quantity? }
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { token, productId, name, price } = body ?? {};
    if (!token) return publicJson({ error: 'Missing token' }, 400);
    if (!name)  return publicJson({ error: 'Missing item name' }, 400);

    const cart = await addItem(token, {
      productId: productId ?? null,
      name,
      price:     Number(price) || 0,
      image:     body.image ?? null,
      color:     body.color ?? null,
      quantity:  Number(body.quantity) || 1,
    });
    return publicJson(cart);
  } catch (err) {
    return publicJson({ error: err instanceof Error ? err.message : 'Failed to add item' }, 500);
  }
}
