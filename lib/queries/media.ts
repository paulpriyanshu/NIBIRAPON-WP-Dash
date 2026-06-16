import { getAllInventory, getAllCategories } from '@/lib/queries/inventory';
import { flowsColl } from '@/lib/flow-store';
import { db } from '@/db';
import { mediaAssets, type ProductMedia } from '@/db/schema';
import { desc } from 'drizzle-orm';

/** Where a media asset is used across the app. */
export interface MediaUsage { kind: 'product' | 'category' | 'flow'; label: string; href: string; }

/** A unique media asset (image/video) with all the places it's referenced. */
export interface MediaItem {
  key: string;
  type: 'image' | 'video';
  src: string;          // browser-renderable URL (R2 proxy or pasted URL)
  assetId?: string;
  url?: string;
  name?: string;        // friendly name (original filename, or derived from the key)
  bytes?: number;       // file size when known (else looked up on hover)
  description?: string;
  createdAt?: number;   // for ordering library uploads (newest first)
  usages: MediaUsage[];
}

function srcOf(assetId?: string, url?: string): string {
  return assetId ? `/api/inventory/media/${assetId}` : (url ?? '');
}

/** Derive a display name from an R2 key or URL (the last path segment). */
function nameOf(assetId?: string, url?: string): string {
  const s = (assetId || url || '').split('?')[0];
  const base = s.split('/').pop() || s;
  try { return decodeURIComponent(base); } catch { return base; }
}

/**
 * Every media asset known to the app, deduped by assetId/url, with the list of
 * products, categories and flow nodes that reference each. Powers the Media tab.
 */
export async function getAllMedia(): Promise<MediaItem[]> {
  const map = new Map<string, MediaItem>();

  const add = (
    m: { type: 'image' | 'video'; assetId?: string; url?: string; description?: string; createdAt?: number; name?: string; bytes?: number },
    usage?: MediaUsage,
  ) => {
    const key = m.assetId || m.url;
    if (!key) return;
    let item = map.get(key);
    if (!item) {
      item = {
        key, type: m.type, src: srcOf(m.assetId, m.url), assetId: m.assetId, url: m.url,
        name: m.name || nameOf(m.assetId, m.url), bytes: m.bytes,
        description: m.description || undefined, createdAt: m.createdAt, usages: [],
      };
      map.set(key, item);
    }
    if (!item.description && m.description) item.description = m.description;
    if (item.createdAt === undefined && m.createdAt !== undefined) item.createdAt = m.createdAt;
    if (item.bytes === undefined && m.bytes !== undefined && m.bytes !== null) item.bytes = m.bytes;
    if (m.name && (!item.name || item.name === nameOf(item.assetId, item.url))) item.name = m.name;
    if (usage) item.usages.push(usage);
  };

  // Products → each photo/video in their media array.
  try {
    const products = await getAllInventory();
    for (const p of products) {
      for (const md of ((p.media ?? []) as ProductMedia[])) {
        if (!md.assetId && !md.url) continue;
        add({ type: md.type, assetId: md.assetId, url: md.url, description: md.description },
            { kind: 'product', label: p.name, href: '/inventory' });
      }
    }
  } catch { /* ignore */ }

  // Categories → their single image.
  try {
    const cats = await getAllCategories();
    for (const c of cats) {
      if (!c.imageAssetId && !c.imageUrl) continue;
      add({ type: 'image', assetId: c.imageAssetId ?? undefined, url: c.imageUrl ?? undefined, description: c.description ?? undefined },
          { kind: 'category', label: c.name, href: '/inventory' });
    }
  } catch { /* ignore */ }

  // Flow message nodes → attached media.
  try {
    const coll = await flowsColl();
    const flows = await coll.find({}).toArray();
    for (const f of flows) {
      for (const n of ((f.nodes ?? []) as any[])) {
        const md = n?.data?.media;
        if (n?.type === 'textNode' && md && (md.assetId || md.url)) {
          add({ type: md.type === 'video' ? 'video' : 'image', assetId: md.assetId, url: md.url },
              { kind: 'flow', label: `${f.name} · ${n?.data?.name || 'Message'}`, href: '/flow' });
        }
      }
    }
  } catch { /* ignore */ }

  // Library uploads (Media tab) — so media not yet attached anywhere still shows.
  try {
    const rows = await db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt));
    for (const r of rows) {
      if (!r.assetId && !r.url) continue;
      add({
        type: r.type === 'video' ? 'video' : 'image',
        assetId: r.assetId ?? undefined,
        url: r.url ?? undefined,
        name: r.filename ?? undefined,
        bytes: r.bytes ?? undefined,
        description: r.description ?? undefined,
        createdAt: r.createdAt ? new Date(r.createdAt).getTime() : undefined,
      });
    }
  } catch { /* ignore */ }

  // Most-referenced first, then newest uploads.
  return [...map.values()].sort((a, b) => (b.usages.length - a.usages.length) || ((b.createdAt ?? 0) - (a.createdAt ?? 0)));
}
