import { NextRequest } from 'next/server';
import { setItemQuantity, removeItem } from '@/lib/queries/cart';
import { checkApiKey, preflight, publicJson } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return preflight();
}

// PATCH /api/public/cart/items/:id — set quantity (removes the item at ≤ 0).
// Body: { token, quantity }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const { token, quantity } = (await req.json()) ?? {};
    if (!token) return publicJson({ error: 'Missing token' }, 400);
    return publicJson(await setItemQuantity(token, id, Number(quantity) || 0));
  } catch (err) {
    return publicJson({ error: err instanceof Error ? err.message : 'Failed to update item' }, 500);
  }
}

// DELETE /api/public/cart/items/:id?token=… — remove the item from the cart.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const token = new URL(req.url).searchParams.get('token');
    if (!token) return publicJson({ error: 'Missing token' }, 400);
    return publicJson(await removeItem(token, id));
  } catch (err) {
    return publicJson({ error: err instanceof Error ? err.message : 'Failed to remove item' }, 500);
  }
}
