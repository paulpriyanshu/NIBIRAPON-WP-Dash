import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObjectAtKey } from '@/lib/r2';
import { convertToWhatsApp } from '@/lib/video-convert';
import { db } from '@/db';
import { mediaAssets } from '@/db/schema';
import { eq } from 'drizzle-orm';

// ffmpeg can't run on Vercel, so conversion is only offered when the dashboard runs
// locally. The Media tab calls GET to decide whether to show the "Fix for Android"
// button, and POST to actually re-encode the stored video in place.
export const runtime = 'nodejs';
export const maxDuration = 300;

const isLocal = () => !process.env.VERCEL;

export async function GET() {
  return NextResponse.json({ available: isLocal() });
}

export async function POST(req: NextRequest) {
  if (!isLocal()) {
    return NextResponse.json(
      { error: 'Conversion runs only on your computer (ffmpeg isn’t available on the server). Open this dashboard on localhost to fix videos.' },
      { status: 501 },
    );
  }
  try {
    const { assetId } = await req.json();
    if (!assetId) return NextResponse.json({ error: 'assetId is required' }, { status: 400 });

    const bytes = await getObject(assetId);
    if (!bytes) return NextResponse.json({ error: 'Could not read the video from storage' }, { status: 404 });

    const out = await convertToWhatsApp(bytes);
    // Overwrite the SAME key so every reference (templates, flows, library) is fixed.
    await putObjectAtKey(assetId, out, 'video/mp4');
    await db.update(mediaAssets).set({ bytes: out.byteLength }).where(eq(mediaAssets.assetId, assetId)).catch(() => {});

    return NextResponse.json({ ok: true, bytes: out.byteLength });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'conversion failed' }, { status: 500 });
  }
}
