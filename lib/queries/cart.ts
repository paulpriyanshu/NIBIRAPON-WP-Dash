import { db } from '@/db';
import { carts, cartItems } from '@/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';

/* Storefront cart queries. A cart is owned by an opaque `token` the website
 * keeps in a browser cookie — every operation is scoped to that token, so a
 * caller can only ever touch their own cart. */

export interface CartItemInput {
  productId: string | null;
  name:      string;
  price:     number;
  image?:    string | null;
  color?:    string | null;
  quantity?: number;
}

const itemColumns = {
  id:        cartItems.id,
  productId: cartItems.productId,
  quantity:  cartItems.quantity,
  name:      cartItems.name,
  price:     cartItems.price,
  image:     cartItems.image,
  color:     cartItems.color,
} as const;

/** Fetch the cart row for a token, if any. */
async function findCart(token: string) {
  const [cart] = await db.select().from(carts).where(eq(carts.token, token)).limit(1);
  return cart ?? null;
}

/** Fetch (creating if needed) the active cart for a token. */
async function ensureCart(token: string) {
  const existing = await findCart(token);
  if (existing) return existing;
  const [created] = await db.insert(carts).values({ token }).returning();
  return created;
}

/** The cart + its items + derived totals, shaped for the storefront. */
export async function getCartByToken(token: string) {
  const cart = await findCart(token);
  if (!cart) {
    return { token, id: null, items: [], count: 0, subtotal: 0, customer: null };
  }
  return shapeCart(cart);
}

async function shapeCart(cart: typeof carts.$inferSelect) {
  const items = await db
    .select(itemColumns)
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id))
    .orderBy(asc(cartItems.createdAt), asc(cartItems.id));

  const count = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = items.reduce((n, i) => n + i.price * i.quantity, 0);

  return {
    id:       cart.id,
    token:    cart.token,
    status:   cart.status,
    items,
    count,
    subtotal,
    customer: cart.customerName || cart.customerEmail || cart.customerPhone
      ? { name: cart.customerName, email: cart.customerEmail, phone: cart.customerPhone }
      : null,
  };
}

/** Add an item (or bump its quantity if the same product is already in the cart). */
export async function addItem(token: string, input: CartItemInput) {
  const cart = await ensureCart(token);
  const qty = Math.max(1, Math.floor(input.quantity ?? 1));

  // Re-adding the same product increments quantity (guarded by the unique index).
  await db
    .insert(cartItems)
    .values({
      cartId:    cart.id,
      productId: input.productId,
      name:      input.name,
      price:     Math.max(0, Math.round(input.price)),
      image:     input.image ?? null,
      color:     input.color ?? null,
      quantity:  qty,
    })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.productId],
      set: {
        quantity:  sql`${cartItems.quantity} + ${qty}`,
        updatedAt: new Date(),
      },
    });

  await touch(cart.id);
  return shapeCart(cart);
}

/** Set an item's quantity (removing it when quantity ≤ 0). Scoped to the token. */
export async function setItemQuantity(token: string, itemId: string, quantity: number) {
  const cart = await findCart(token);
  if (!cart) return getCartByToken(token);

  if (quantity <= 0) {
    await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
  } else {
    await db
      .update(cartItems)
      .set({ quantity: Math.floor(quantity), updatedAt: new Date() })
      .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
  }
  await touch(cart.id);
  return shapeCart(cart);
}

/** Remove one item from the cart. Scoped to the token. */
export async function removeItem(token: string, itemId: string) {
  const cart = await findCart(token);
  if (!cart) return getCartByToken(token);
  await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
  await touch(cart.id);
  return shapeCart(cart);
}

/** Stamp customer contact details onto the cart (captured at checkout). */
export async function setCartCustomer(
  token: string,
  customer: { name?: string; email?: string; phone?: string },
) {
  const cart = await ensureCart(token);
  await db
    .update(carts)
    .set({
      customerName:  customer.name ?? cart.customerName,
      customerEmail: customer.email ?? cart.customerEmail,
      customerPhone: customer.phone ?? cart.customerPhone,
      updatedAt:     new Date(),
    })
    .where(eq(carts.id, cart.id));
  const fresh = await findCart(token);
  return shapeCart(fresh!);
}

/** Empty a cart's items (e.g. after an order is placed). */
export async function clearCart(token: string) {
  const cart = await findCart(token);
  if (!cart) return getCartByToken(token);
  await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
  await touch(cart.id);
  return shapeCart(cart);
}

function touch(cartId: string) {
  return db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
}
