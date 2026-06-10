import { db } from '@/db';
import { catalogProducts } from '@/db/schema';
import { and, desc, eq, lt, or } from 'drizzle-orm';

// UI columns only — the large `embedding` array is never sent to the client.
const productColumns = {
  id:             catalogProducts.id,
  name:           catalogProducts.name,
  description:    catalogProducts.description,
  priceRange:     catalogProducts.priceRange,
  category:       catalogProducts.category,
  fabric:         catalogProducts.fabric,
  occasions:      catalogProducts.occasions,
  media:          catalogProducts.media,
  customInfo:     catalogProducts.customInfo,
  isActive:       catalogProducts.isActive,
  inAgentContext: catalogProducts.inAgentContext,
  syncedAt:       catalogProducts.syncedAt,
  createdAt:      catalogProducts.createdAt,
} as const;

/** Cursor = "<createdAt-ms>_<id>" — keyset over (createdAt desc, id desc). */
function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.getTime()}_${id}`;
}
function decodeCursor(cursor: string | null): { ms: number; id: string } | null {
  if (!cursor) return null;
  const i = cursor.indexOf('_');
  if (i < 0) return null;
  const ms = Number(cursor.slice(0, i));
  const id = cursor.slice(i + 1);
  return Number.isFinite(ms) && id ? { ms, id } : null;
}

/** One page of products, newest first, with a cursor for the next page. */
export async function getInventoryPage({ limit = 30, cursor = null }: { limit?: number; cursor?: string | null }) {
  const lim = Math.min(Math.max(limit, 1), 100);
  const cur = decodeCursor(cursor);

  const where = cur
    ? or(
        lt(catalogProducts.createdAt, new Date(cur.ms)),
        and(eq(catalogProducts.createdAt, new Date(cur.ms)), lt(catalogProducts.id, cur.id)),
      )
    : undefined;

  const rows = await db
    .select(productColumns)
    .from(catalogProducts)
    .where(where)
    .orderBy(desc(catalogProducts.createdAt), desc(catalogProducts.id))
    .limit(lim + 1);

  const items = rows.slice(0, lim);
  const last = items[items.length - 1];
  const nextCursor = rows.length > lim && last ? encodeCursor(last.createdAt, last.id) : null;
  return { items, nextCursor };
}

/** Legacy full list — kept for callers that need every product (e.g. the agent catalog tab). */
export async function getAllInventory() {
  return db.select(productColumns).from(catalogProducts).orderBy(desc(catalogProducts.createdAt));
}
