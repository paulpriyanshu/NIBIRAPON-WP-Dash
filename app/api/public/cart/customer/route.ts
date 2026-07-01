import { NextRequest } from 'next/server';
import { setCartCustomer } from '@/lib/queries/cart';
import { checkApiKey, preflight, publicJson } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return preflight();
}

// POST /api/public/cart/customer — stamp customer contact details on the cart
// (captured at checkout). Body: { token, name?, email?, phone? }
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const body = (await req.json()) ?? {};
    if (!body.token) return publicJson({ error: 'Missing token' }, 400);
    const cart = await setCartCustomer(body.token, {
      name:  body.name,
      email: body.email,
      phone: body.phone,
    });
    return publicJson(cart);
  } catch (err) {
    return publicJson({ error: err instanceof Error ? err.message : 'Failed to save customer' }, 500);
  }
}
