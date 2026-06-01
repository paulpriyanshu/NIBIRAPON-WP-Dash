import { NextRequest, NextResponse } from 'next/server';
import { getSendUrl } from '@/lib/inventory-media';

// Permanent, app-side URL for a stored R2 asset. Redirects to the actual
// object (public URL or a fresh presigned URL). Used by dashboard previews and
// for rendering agent-sent media in the inbox. Catch-all so keys with "/" work.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assetId: string[] }> },
) {
  const { assetId } = await params;
  const key = (assetId || []).join('/');
  if (!key) return new NextResponse('Not found', { status: 404 });

  try {
    const url = await getSendUrl(key);
    return NextResponse.redirect(url, 302);
  } catch {
    return new NextResponse('Media unavailable', { status: 502 });
  }
}
