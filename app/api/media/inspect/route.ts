import { NextRequest, NextResponse } from 'next/server';
import { getObjectRange, objectSize } from '@/lib/r2';
import { inspectMp4, type ByteReader, type VideoCheck } from '@/lib/mp4-inspect';

// WhatsApp/Android playback check for an ALREADY-uploaded library video. Reads
// only the byte ranges the parser needs (header walk + moov) from R2 — never the
// whole file — and runs the shared MP4 inspector. Used by the Media tab to flag
// existing videos that may not play (moov at end, non-H.264, non-AAC, high fps).
const OK: VideoCheck = { ok: true, warnings: [] };

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get('assetId');
    const url = searchParams.get('url');

    // Size first (also confirms the object exists).
    let size: number | null = null;
    if (assetId) {
      size = await objectSize(assetId);
    } else if (url) {
      const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
      const len = r?.headers.get('content-length');
      size = len ? Number(len) : null;
    }
    if (!size) return NextResponse.json(OK);

    // Ranged reader: R2 GetObject for assets, HTTP Range fetch for pasted URLs.
    const read: ByteReader = async (start, len) => {
      const end = Math.min(start + len, size!) - 1;
      let bytes: Uint8Array | null = null;
      if (assetId) {
        bytes = await getObjectRange(assetId, start, end - start + 1);
      } else if (url) {
        const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } }).catch(() => null);
        if (r && (r.status === 206 || r.status === 200)) bytes = new Uint8Array(await r.arrayBuffer());
      }
      if (!bytes) return new DataView(new ArrayBuffer(0));
      return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    };

    const check = await inspectMp4(read, size);
    if (size > 16 * 1024 * 1024) {
      check.warnings = [`${(size / 1048576).toFixed(1)} MB is over WhatsApp's 16 MB send limit.`, ...check.warnings];
      check.ok = false;
    }
    return NextResponse.json(check);
  } catch {
    return NextResponse.json(OK);
  }
}
