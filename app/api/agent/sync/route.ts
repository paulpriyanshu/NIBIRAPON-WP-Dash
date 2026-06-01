import { NextResponse } from 'next/server';
import { db } from '@/db';
import { catalogProducts } from '@/db/schema';
import { isNull, or, eq } from 'drizzle-orm';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API });

/** Build a plain text representation of a product for embedding. */
function productToText(p: typeof catalogProducts.$inferSelect): string {
  const parts = [
    p.name,
    p.category   && `Category: ${p.category}`,
    p.fabric     && `Fabric: ${p.fabric}`,
    p.occasions  && `Occasions: ${p.occasions}`,
    p.priceRange && `Price: ${p.priceRange}`,
    p.description,
    p.customInfo && `Additional info: ${p.customInfo}`,
  ].filter(Boolean);
  return parts.join('. ');
}

export async function POST() {
  try {
    // Fetch all active products that don't have an embedding yet
    const unsynced = await db
      .select()
      .from(catalogProducts)
      .where(or(isNull(catalogProducts.embedding), eq(catalogProducts.isActive, true)));

    if (unsynced.length === 0) {
      return NextResponse.json({ synced: 0, message: 'All products already synced' });
    }

    let synced = 0;
    const now = new Date();

    // Process in batches of 20 (OpenAI limit is 2048 inputs per call)
    for (let i = 0; i < unsynced.length; i += 20) {
      const batch = unsynced.slice(i, i + 20);
      const texts = batch.map(productToText);

      const embRes = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });

      for (let j = 0; j < batch.length; j++) {
        const embedding = embRes.data[j].embedding;
        await db
          .update(catalogProducts)
          .set({ embedding, syncedAt: now, updatedAt: now })
          .where(eq(catalogProducts.id, batch[j].id));
        synced++;
      }
    }

    return NextResponse.json({ synced, total: unsynced.length });
  } catch (err: any) {
    console.error('[sync]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
