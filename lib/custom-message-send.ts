import { sendTextMessage, sendInteractiveMessage, sendListMessage } from '@/lib/whatsapp-api';
import { sendMediaResilient } from '@/lib/media-send';
import { getSendUrl } from '@/lib/inventory-media';
import { customMessageOptions, type CustomMessage, type CustomMessageMedia } from '@/lib/custom-messages';
import { getAllCategories, getAllInventory } from '@/lib/queries/inventory';

/** Resolve a custom-message media item to a header WhatsApp can fetch (image/video). */
async function mediaHeader(m: CustomMessageMedia | null | undefined): Promise<{ type: 'image' | 'video'; link: string } | undefined> {
  if (!m || (!m.assetId && !m.url)) return undefined;
  const link = m.assetId ? await getSendUrl(m.assetId) : m.url;
  return link ? { type: m.type, link } : undefined;
}

/** Build option rows from live inventory for a dynamic (category/product) list/buttons.
 *  Each row id is `cmopt:<kind>:<id>` so a tap is intercepted to reply with details. */
/** Keep only the chosen ids, in the chosen order. Empty/undefined ⇒ keep all. */
function pickByIds<T extends { id: string }>(items: T[], ids?: string[]): T[] {
  if (!ids?.length) return items;
  const order = new Map(ids.map((id, i) => [id, i]));
  return items.filter(i => order.has(i.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

async function dynamicRows(source: 'categories' | 'products', limit: number, ids?: string[]): Promise<{ id: string; title: string; description?: string }[]> {
  if (source === 'categories') {
    const cats = pickByIds(await getAllCategories(), ids);
    return cats.slice(0, limit).map(c => ({ id: `cmopt:category:${c.id}`, title: c.name.slice(0, 24), description: c.description ?? undefined }));
  }
  const products = pickByIds((await getAllInventory()).filter(p => !p.parentId && p.isActive), ids);
  return products.slice(0, limit).map(p => ({ id: `cmopt:product:${p.id}`, title: p.name.slice(0, 24), description: p.priceRange ?? undefined }));
}

export interface CustomSendResult {
  msgId?: string;
  /** How it persists in the inbox: text/media use those types; buttons/list → 'interactive'. */
  recordType: 'text' | 'image' | 'video' | 'interactive';
  text: string;                 // inbox preview text
  mediaUrl?: string | null;     // for media records
  optionTitles: string[];       // selectable options (for flow branching)
}

/**
 * Send a saved custom (in-session) message — text, media, reply-buttons, or an
 * option list. Used identically by flows, the AI agent, and inbox manual sends.
 */
export async function sendCustomMessage(to: string, m: CustomMessage): Promise<CustomSendResult> {
  const options = customMessageOptions(m);

  switch (m.type) {
    case 'media': {
      if (!m.media || (!m.media.assetId && !m.media.url)) throw new Error('custom media message has no media');
      const { msgId, displayUrl } = await sendMediaResilient(to, m.media, m.caption);
      return { msgId, recordType: m.media.type, text: m.caption || `[${m.media.type}]`, mediaUrl: displayUrl, optionTitles: [] };
    }

    case 'buttons': {
      const dynamic = m.optionSource && m.optionSource !== 'manual';
      const buttons = dynamic
        ? (await dynamicRows(m.optionSource as 'categories' | 'products', 3, m.optionIds)).map(r => ({ id: r.id, title: r.title }))
        : (m.buttons ?? []).slice(0, 3).map((b, i) => ({ id: `opt_${i}`, title: b.title.slice(0, 20) }));
      if (!buttons.length) throw new Error('buttons message has no options');
      // WhatsApp requires a non-empty body — fall back to header/name if blank.
      const bodyText = m.body?.trim() || m.header?.trim() || m.name;
      // Optional media (image/video) header above the body + buttons.
      const header = await mediaHeader(m.media);
      const res = await sendInteractiveMessage({
        to, bodyText, buttons, header,
        headerText: header ? undefined : (m.header?.trim() || undefined),
        footerText: m.footer?.trim() || undefined,
      });
      return { msgId: res?.messages?.[0]?.id, recordType: 'interactive', text: bodyText, optionTitles: options };
    }

    case 'list': {
      const dynamic = m.optionSource && m.optionSource !== 'manual';

      const sections = dynamic
        ? [{ title: m.optionSource === 'categories' ? 'Categories' : 'Products', rows: await dynamicRows(m.optionSource as 'categories' | 'products', 10, m.optionIds) }]
        : (m.sections ?? []).map(s => ({
            title: s.title,
            rows: s.rows.map((r, i) => ({ id: `row_${i}_${r.title}`.slice(0, 200), title: r.title, description: r.description })),
          }));
      const usable = sections.filter(s => s.rows.length);
      if (!usable.length) throw new Error('list message has no options');
      // WhatsApp requires a non-empty body — fall back to header/name if blank.
      const body = m.body?.trim() || m.header?.trim() || m.name;
      const res = await sendListMessage({
        to, body, button: m.listButton || 'View options',
        sections: usable, header: m.header, footer: m.footer,
      });
      return { msgId: res?.messages?.[0]?.id, recordType: 'interactive', text: body, optionTitles: options };
    }

    case 'text':
    default: {
      const text = (m.body || '').trim();
      if (!text) throw new Error('text message is empty');
      const res = await sendTextMessage({ to, text });
      return { msgId: res?.messages?.[0]?.id, recordType: 'text', text, optionTitles: [] };
    }
  }
}
