import { NextRequest, NextResponse } from 'next/server';
import { createUpload, r2Configured } from '@/lib/inventory-media';

// Returns a presigned PUT URL so the browser uploads the file directly to R2.
export async function POST(req: NextRequest) {
  try {
    if (!r2Configured()) {
      return NextResponse.json({ error: 'R2 storage is not configured (set R2_* env vars)' }, { status: 500 });
    }

    const { mimeType } = await req.json();
    if (typeof mimeType !== 'string' || (!mimeType.startsWith('image/') && !mimeType.startsWith('video/'))) {
      return NextResponse.json({ error: 'Only image or video files are allowed' }, { status: 400 });
    }

    const { assetId, uploadUrl } = await createUpload(mimeType);
    return NextResponse.json({ assetId, uploadUrl, type: mimeType.startsWith('video/') ? 'video' : 'image' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create upload';
    console.error('[inventory/upload]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
