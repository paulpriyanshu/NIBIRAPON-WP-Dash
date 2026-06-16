'use client';

/** Human-readable byte size, e.g. 1536 → "1.5 KB". */
export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

// Cache so we only ask the server once per asset.
const sizeCache = new Map<string, number | null>();

/** Look up a media item's byte size (server HeadObject / HEAD), cached. */
export async function fetchMediaSize(item: { assetId?: string; url?: string }): Promise<number | null> {
  const key = item.assetId || item.url;
  if (!key) return null;
  if (sizeCache.has(key)) return sizeCache.get(key)!;
  try {
    const q = item.assetId ? `assetId=${encodeURIComponent(item.assetId)}` : `url=${encodeURIComponent(item.url!)}`;
    const res = await fetch(`/api/media/size?${q}`);
    const data = await res.json();
    const bytes = typeof data.bytes === 'number' ? data.bytes : null;
    sizeCache.set(key, bytes);
    return bytes;
  } catch {
    sizeCache.set(key, null);
    return null;
  }
}
