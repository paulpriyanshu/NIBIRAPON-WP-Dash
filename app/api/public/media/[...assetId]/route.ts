import { NextRequest, NextResponse } from 'next/server';
import { getSendUrl } from '@/lib/inventory-media';
import { corsHeaders, preflight } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return preflight();
}

// Public, stable URL for a stored R2 asset — redirects to the actual object
// (public URL or a fresh presigned URL). Lets the storefront render product and
// category images without authentication. Catch-all so keys containing "/" work.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assetId: string[] }> },
) {
  const { assetId } = await params;
  const key = (assetId || []).join('/');
  if (!key) return new NextResponse('Not found', { status: 404, headers: corsHeaders() });

  try {
    const url = await getSendUrl(key);
    return NextResponse.redirect(url, 302);
  } catch {
    return new NextResponse('Media unavailable', { status: 502, headers: corsHeaders() });
  }
}
