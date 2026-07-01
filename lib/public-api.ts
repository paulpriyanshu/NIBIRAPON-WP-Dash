import { NextRequest, NextResponse } from 'next/server';
import type { ProductMedia } from '@/db/schema';

// Read-only public catalog API (consumed by the storefront website). Lives under
// /api/public, which the middleware leaves unauthenticated. Two optional env knobs:
//   PUBLIC_API_ORIGIN  – CORS allow-origin (defaults to "*" for any site)
//   PUBLIC_API_KEY     – when set, every request must send a matching x-api-key
const ALLOW_ORIGIN = process.env.PUBLIC_API_ORIGIN || '*';
const API_KEY      = process.env.PUBLIC_API_KEY || '';

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    'Access-Control-Max-Age':       '86400',
  };
}

/** Standard CORS preflight response. */
export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/** JSON response with CORS headers attached. */
export function publicJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: corsHeaders() });
}

/**
 * When PUBLIC_API_KEY is configured, require a matching `x-api-key` header (or
 * `?key=`). Returns an error response to short-circuit, or null to continue.
 * With no key configured the API is fully open (read-only public catalog data).
 */
export function checkApiKey(req: NextRequest): NextResponse | null {
  if (!API_KEY) return null;
  const provided = req.headers.get('x-api-key') || new URL(req.url).searchParams.get('key');
  if (provided !== API_KEY) return publicJson({ error: 'Invalid or missing API key' }, 401);
  return null;
}

/** Absolute, browser-fetchable URL for a media item — R2 assets go through the
 *  public media proxy; pasted URLs are returned as-is. */
export function publicMediaUrl(origin: string, m: { assetId?: string | null; url?: string | null }): string {
  if (m.assetId) return `${origin}/api/public/media/${m.assetId}`;
  return m.url ?? '';
}

/** Public-facing shape of a product's media array (no internal asset keys). */
export function shapeMedia(origin: string, media: ProductMedia[] | null | undefined) {
  return (media ?? [])
    .filter(m => m.assetId || m.url)
    .map(m => ({ type: m.type, url: publicMediaUrl(origin, m), description: m.description ?? null }));
}
