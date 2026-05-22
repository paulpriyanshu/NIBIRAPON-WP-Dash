import { NextRequest, NextResponse } from 'next/server';

const GRAPH_BASE = 'https://graph.facebook.com/v25.0';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const { mediaId } = await params;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return new NextResponse('No token', { status: 500 });

  // Step 1: resolve mediaId → temporary CDN URL
  const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) return new NextResponse('Media not found', { status: 404 });
  const { url } = await metaRes.json();
  if (!url) return new NextResponse('No URL in response', { status: 404 });

  // Step 2: download the actual bytes (requires auth header — can't do this in browser)
  const mediaRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!mediaRes.ok) return new NextResponse('Download failed', { status: 502 });

  const buffer = await mediaRes.arrayBuffer();
  const contentType = mediaRes.headers.get('content-type') || 'application/octet-stream';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
