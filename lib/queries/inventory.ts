import { db } from '@/db';
import { catalogProducts, categories } from '@/db/schema';
import { and, asc, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';

// UI columns only — the large `embedding` array is never sent to the client.
const productColumns = {
  id:                catalogProducts.id,
  name:              catalogProducts.name,
  description:       catalogProducts.description,
  priceRange:        catalogProducts.priceRange,
  category:          catalogProducts.category,
  categoryId:        catalogProducts.categoryId,
  fabric:            catalogProducts.fabric,
  occasions:         catalogProducts.occasions,
  media:             catalogProducts.media,
  parentId:          catalogProducts.parentId,
  variantAttributes: catalogProducts.variantAttributes,
  customInfo:        catalogProducts.customInfo,
  contentId:         catalogProducts.contentId,
  tags:              catalogProducts.tags,
  isActive:          catalogProducts.isActive,
  inAgentContext:    catalogProducts.inAgentContext,
  featured:          catalogProducts.featured,
  syncedAt:          catalogProducts.syncedAt,
  createdAt:         catalogProducts.createdAt,
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

/**
 * One page of top-level products (parentId is null), newest first, with a cursor
 * for the next page. Each product carries its `variants` array so the UI can nest
 * them; variants themselves never appear as their own top-level rows.
 */
export async function getInventoryPage({ limit = 30, cursor = null }: { limit?: number; cursor?: string | null }) {
  const lim = Math.min(Math.max(limit, 1), 100);
  const cur = decodeCursor(cursor);

  const keyset = cur
    ? or(
        lt(catalogProducts.createdAt, new Date(cur.ms)),
        and(eq(catalogProducts.createdAt, new Date(cur.ms)), lt(catalogProducts.id, cur.id)),
      )
    : undefined;
  const where = and(isNull(catalogProducts.parentId), keyset);

  const rows = await db
    .select(productColumns)
    .from(catalogProducts)
    .where(where)
    .orderBy(desc(catalogProducts.createdAt), desc(catalogProducts.id))
    .limit(lim + 1);

  const page = rows.slice(0, lim);
  const last = page[page.length - 1];
  const nextCursor = rows.length > lim && last ? encodeCursor(last.createdAt, last.id) : null;

  // Attach each parent's variants in one extra query.
  const parentIds = page.map(p => p.id);
  const variantRows = parentIds.length
    ? await db
        .select(productColumns)
        .from(catalogProducts)
        .where(inArray(catalogProducts.parentId, parentIds))
        .orderBy(asc(catalogProducts.createdAt), asc(catalogProducts.id))
    : [];
  const variantsByParent = new Map<string, typeof variantRows>();
  for (const v of variantRows) {
    if (!v.parentId) continue;
    const arr = variantsByParent.get(v.parentId) ?? [];
    arr.push(v);
    variantsByParent.set(v.parentId, arr);
  }

  const items = page.map(p => ({ ...p, variants: variantsByParent.get(p.id) ?? [] }));
  return { items, nextCursor };
}

/** Legacy full list — kept for callers that need every product (e.g. the agent catalog tab). */
export async function getAllInventory() {
  return db.select(productColumns).from(catalogProducts).orderBy(desc(catalogProducts.createdAt));
}

/** All categories, ordered for display. Used by the categories tab and the agent. */
export async function getAllCategories() {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
}

/* ── Public storefront queries ───────────────────────────────────────────────
 * Read-only views for the public catalog API. Only active products/variants, and
 * none of the internal-only columns (customInfo, inAgentContext, embedding…).
 */
const publicProductColumns = {
  id:                catalogProducts.id,
  name:              catalogProducts.name,
  description:       catalogProducts.description,
  priceRange:        catalogProducts.priceRange,
  category:          catalogProducts.category,
  categoryId:        catalogProducts.categoryId,
  fabric:            catalogProducts.fabric,
  occasions:         catalogProducts.occasions,
  media:             catalogProducts.media,
  parentId:          catalogProducts.parentId,
  variantAttributes: catalogProducts.variantAttributes,
  tags:              catalogProducts.tags,
  createdAt:         catalogProducts.createdAt,
} as const;

/** Active variants for the given parent product IDs, grouped by parentId. */
async function activeVariantsByParent(parentIds: string[]) {
  const rows = parentIds.length
    ? await db
        .select(publicProductColumns)
        .from(catalogProducts)
        .where(and(inArray(catalogProducts.parentId, parentIds), eq(catalogProducts.isActive, true)))
        .orderBy(asc(catalogProducts.createdAt), asc(catalogProducts.id))
    : [];
  const map = new Map<string, typeof rows>();
  for (const v of rows) {
    if (!v.parentId) continue;
    const arr = map.get(v.parentId) ?? [];
    arr.push(v);
    map.set(v.parentId, arr);
  }
  return map;
}

/**
 * One page of active, top-level products (newest first) with a next cursor —
 * each carrying its active variants. Optionally filtered by category.
 */
export async function getPublicProductsPage(
  { limit = 30, cursor = null, categoryId = null }:
  { limit?: number; cursor?: string | null; categoryId?: string | null },
) {
  const lim = Math.min(Math.max(limit, 1), 100);
  const cur = decodeCursor(cursor);

  const keyset = cur
    ? or(
        lt(catalogProducts.createdAt, new Date(cur.ms)),
        and(eq(catalogProducts.createdAt, new Date(cur.ms)), lt(catalogProducts.id, cur.id)),
      )
    : undefined;
  const where = and(
    isNull(catalogProducts.parentId),
    eq(catalogProducts.isActive, true),
    categoryId ? eq(catalogProducts.categoryId, categoryId) : undefined,
    keyset,
  );

  const rows = await db
    .select(publicProductColumns)
    .from(catalogProducts)
    .where(where)
    .orderBy(desc(catalogProducts.createdAt), desc(catalogProducts.id))
    .limit(lim + 1);

  const page = rows.slice(0, lim);
  const last = page[page.length - 1];
  const nextCursor = rows.length > lim && last ? encodeCursor(last.createdAt, last.id) : null;

  const variants = await activeVariantsByParent(page.map(p => p.id));
  const items = page.map(p => ({ ...p, variants: variants.get(p.id) ?? [] }));
  return { items, nextCursor };
}

/** A single active product (or variant) by ID, with its active variants attached. */
export async function getPublicProductById(id: string) {
  const [product] = await db
    .select(publicProductColumns)
    .from(catalogProducts)
    .where(and(eq(catalogProducts.id, id), eq(catalogProducts.isActive, true)))
    .limit(1);
  if (!product) return null;
  const variants = await activeVariantsByParent([product.id]);
  return { ...product, variants: variants.get(product.id) ?? [] };
}

/** Categories for the public storefront (no internal flags). */
export async function getPublicCategories() {
  return db
    .select({
      id:           categories.id,
      name:         categories.name,
      description:  categories.description,
      imageUrl:     categories.imageUrl,
      imageAssetId: categories.imageAssetId,
      sortOrder:    categories.sortOrder,
    })
    .from(categories)
    .where(eq(categories.hidden, false))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}
