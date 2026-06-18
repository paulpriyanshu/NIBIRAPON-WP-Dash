import { db } from '@/db';
import { categories, type ProductMedia, type VariantAttribute } from '@/db/schema';
import { eq } from 'drizzle-orm';

/** Keep only well-formed media items (image/video with a url or assetId). */
export function cleanMedia(media: unknown): ProductMedia[] {
  if (!Array.isArray(media)) return [];
  return media
    .filter((m): m is ProductMedia => !!m && (m.type === 'image' || m.type === 'video') && (!!m.url || !!m.assetId))
    .map(m => ({
      type:        m.type,
      url:         m.url        || undefined,
      assetId:     m.assetId    || undefined,
      mimeType:    m.mimeType   || undefined,
      description: m.description || undefined,
    }));
}

/** Normalize tags: trimmed, de-duped (case-insensitive), non-empty. */
export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const v = String(t ?? '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Keep only variant attributes with a non-empty label and value. */
export function cleanVariantAttributes(attrs: unknown): VariantAttribute[] {
  if (!Array.isArray(attrs)) return [];
  return attrs
    .filter((a): a is VariantAttribute => !!a && typeof a.label === 'string' && typeof a.value === 'string')
    .map(a => ({ label: a.label.trim(), value: a.value.trim() }))
    .filter(a => a.label && a.value);
}

/** Look up a category's name by id, for keeping the denormalized `category` text in sync. */
export async function categoryNameById(categoryId: string | null | undefined): Promise<string | null> {
  if (!categoryId) return null;
  const row = await db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1)
    .then(r => r[0]);
  return row?.name ?? null;
}
