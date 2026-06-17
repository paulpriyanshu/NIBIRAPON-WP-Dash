import { db } from '@/db';
import { messages, conversations, catalogProducts, categories, type ProductMedia } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { sendTextMessage, sendListMessage } from '@/lib/whatsapp-api';
import { sendMediaResilient } from '@/lib/media-send';

const localId = (s: string) => `wamid.opt_${Date.now()}_${s}_${Math.random().toString(36).slice(2, 6)}`;

async function persist(opts: {
  conversationId: string; bizPhone: string; phone: string; msgId?: string;
  type: 'text' | 'image' | 'video' | 'interactive'; text: string; mediaUrl?: string | null;
}) {
  await db.insert(messages).values({
    id: opts.msgId || localId(opts.type),
    conversationId: opts.conversationId,
    fromNumber: opts.bizPhone,
    toNumber: opts.phone,
    type: opts.type as any,
    text: opts.text,
    mediaUrl: opts.mediaUrl ?? null,
    status: opts.msgId ? 'sent' : 'failed',
    isOutgoing: true,
    sentBy: 'agent',
    sentAt: new Date(),
  }).onConflictDoNothing();
}

/** Caption sent with a product's photos: title + product description only.
 *  The per-image descriptions are internal AI notes and are never sent. */
function productDetails(p: { name: string; description: string | null }): string {
  return [`*${p.name}*`, p.description?.trim() || '']
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Handle a tap on a dynamic custom-message option (`cmopt:product:<id>` /
 * `cmopt:category:<id>`): reply with the product's images + details, or the
 * category's products as a drill-down list. Returns true if it handled the tap.
 */
export async function handleCustomOptionPick(opts: {
  buttonId: string; toPhone: string; bizPhone: string; conversationId: string;
}): Promise<boolean> {
  const m = /^cmopt:(product|category):(.+)$/.exec(opts.buttonId || '');
  if (!m) return false;
  const [, kind, id] = m;
  const { toPhone, bizPhone, conversationId } = opts;

  try {
    if (kind === 'product') {
      const p = await db.select({
        name: catalogProducts.name, priceRange: catalogProducts.priceRange,
        fabric: catalogProducts.fabric, occasions: catalogProducts.occasions,
        description: catalogProducts.description, media: catalogProducts.media,
      }).from(catalogProducts).where(eq(catalogProducts.id, id)).limit(1).then(r => r[0]);
      if (!p) return false;

      const media = ((p.media ?? []) as ProductMedia[]).filter(md => md.assetId || md.url).slice(0, 5);
      const details = productDetails(p);

      if (media.length === 0) {
        const res = await sendTextMessage({ to: toPhone, text: details });
        await persist({ conversationId, bizPhone, phone: toPhone, msgId: res?.messages?.[0]?.id, type: 'text', text: details });
        return true;
      }
      // First media carries the details as caption; the rest follow as plain media.
      for (let i = 0; i < media.length; i++) {
        const md = media[i];
        try {
          const { msgId, displayUrl } = await sendMediaResilient(toPhone, md, i === 0 ? details : undefined);
          await persist({ conversationId, bizPhone, phone: toPhone, msgId, type: md.type, text: i === 0 ? details : `[${md.type}]`, mediaUrl: displayUrl });
        } catch (e) {
          console.error('[cmopt] product media send failed:', e instanceof Error ? e.message : e);
        }
      }
      return true;
    }

    // category → list its active top-level products as a drill-down
    const cat = await db.select({ name: categories.name }).from(categories).where(eq(categories.id, id)).limit(1).then(r => r[0]);
    const prods = await db.select({ id: catalogProducts.id, name: catalogProducts.name, priceRange: catalogProducts.priceRange })
      .from(catalogProducts)
      .where(and(eq(catalogProducts.categoryId, id), eq(catalogProducts.isActive, true), isNull(catalogProducts.parentId)))
      .limit(10);

    if (prods.length === 0) {
      const text = `No products in ${cat?.name ?? 'this category'} yet.`;
      const res = await sendTextMessage({ to: toPhone, text });
      await persist({ conversationId, bizPhone, phone: toPhone, msgId: res?.messages?.[0]?.id, type: 'text', text });
      return true;
    }

    const body = `${cat?.name ?? 'Products'} — tap one to see details 👇`;
    const res = await sendListMessage({
      to: toPhone, body, button: 'View products',
      sections: [{ title: cat?.name?.slice(0, 24), rows: prods.map(p => ({ id: `cmopt:product:${p.id}`, title: p.name.slice(0, 24), description: p.priceRange ?? undefined })) }],
    });
    await persist({ conversationId, bizPhone, phone: toPhone, msgId: res?.messages?.[0]?.id, type: 'interactive', text: body });
    return true;
  } catch (e) {
    console.error('[cmopt] handler failed:', e instanceof Error ? e.message : e);
    return false;
  }
}
