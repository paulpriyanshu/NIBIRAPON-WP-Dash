import { db } from '@/db';
import { catalogProducts, type ProductMedia } from '@/db/schema';
import { and, isNull, eq } from 'drizzle-orm';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API });

/** Build a plain text representation of a product for embedding. */
export function productToText(p: typeof catalogProducts.$inferSelect): string {
  const mediaDescs = ((p.media ?? []) as ProductMedia[])
    .map(m => m.description)
    .filter(Boolean);
  const tags = (p.tags ?? []) as string[];
  const parts = [
    p.name,
    p.category   && `Category: ${p.category}`,
    p.fabric     && `Fabric: ${p.fabric}`,
    tags.length  && `Tags: ${tags.join(', ')}`,
    p.occasions  && `Occasions: ${p.occasions}`,
    p.priceRange && `Price: ${p.priceRange}`,
    p.description,
    p.customInfo && `Additional info: ${p.customInfo}`,
    mediaDescs.length && `Photos: ${mediaDescs.join('; ')}`,
  ].filter(Boolean);
  return parts.join('. ');
}

/**
 * Embed every agent-context product that has no current embedding. PATCH clears
 * `embedding` on edit, so this also re-embeds changed products. Used by the
 * /api/agent/sync route and by the manager agent after it creates products.
 */
export async function syncInventoryEmbeddings(): Promise<{ synced: number; total: number }> {
  const unsynced = await db
    .select()
    .from(catalogProducts)
    .where(and(
      eq(catalogProducts.inAgentContext, true),
      eq(catalogProducts.isActive, true),
      isNull(catalogProducts.embedding),
    ));

  if (unsynced.length === 0) return { synced: 0, total: 0 };

  let synced = 0;
  const now = new Date();

  // Process in batches of 20 (OpenAI accepts up to 2048 inputs per call).
  for (let i = 0; i < unsynced.length; i += 20) {
    const batch = unsynced.slice(i, i + 20);
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch.map(productToText),
    });
    for (let j = 0; j < batch.length; j++) {
      await db
        .update(catalogProducts)
        .set({ embedding: embRes.data[j].embedding, syncedAt: now, updatedAt: now })
        .where(eq(catalogProducts.id, batch[j].id));
      synced++;
    }
  }

  return { synced, total: unsynced.length };
}
