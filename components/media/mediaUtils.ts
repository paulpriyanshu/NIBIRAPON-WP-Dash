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

/* ── Client-side video compatibility check (no ffmpeg) ────────────────────────── */
import { inspectMp4, type VideoCheck } from '@/lib/mp4-inspect';
export type { VideoCheck } from '@/lib/mp4-inspect';

/** Inspect a just-picked video File for WhatsApp-on-Android playback issues. */
export async function inspectVideo(file: File): Promise<VideoCheck> {
  const isMp4 = /mp4|quicktime|m4v/i.test(file.type) || /\.(mp4|mov|m4v)$/i.test(file.name);
  if (!isMp4) {
    return { ok: false, warnings: ['Not an MP4 — WhatsApp prefers MP4 (H.264 + AAC); this may not play on some phones.'] };
  }
  const read = async (start: number, len: number) =>
    new DataView(await file.slice(start, start + len).arrayBuffer());
  return inspectMp4(read, file.size);
}

/** Inspect an already-uploaded library video via the server (ranged R2 read), cached. */
const checkCache = new Map<string, VideoCheck>();
export async function fetchVideoCheck(item: { assetId?: string; url?: string }): Promise<VideoCheck | null> {
  const key = item.assetId || item.url;
  if (!key) return null;
  if (checkCache.has(key)) return checkCache.get(key)!;
  try {
    const q = item.assetId ? `assetId=${encodeURIComponent(item.assetId)}` : `url=${encodeURIComponent(item.url!)}`;
    const res = await fetch(`/api/media/inspect?${q}`);
    const data: VideoCheck = await res.json();
    checkCache.set(key, data);
    return data;
  } catch {
    return null;
  }
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
