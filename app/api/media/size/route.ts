import { NextRequest, NextResponse } from 'next/server';
import { objectSize } from '@/lib/r2';

// Byte size of a media item: HeadObject for a stored R2 asset, or a HEAD request
// for a pasted URL. Server-side so there are no client CORS issues. Used by the
// media grids/pickers to show file size on hover.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get('assetId');
    const url = searchParams.get('url');

    let bytes: number | null = null;
    if (assetId) {
      bytes = await objectSize(assetId);
    } else if (url) {
      const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
      const len = r?.headers.get('content-length');
      bytes = len ? Number(len) : null;
    }
    return NextResponse.json({ bytes });
  } catch {
    return NextResponse.json({ bytes: null });
  }
}
