import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { mediaAssets } from '@/db/schema';
import { getAllMedia } from '@/lib/queries/media';

export async function GET() {
  try {
    return NextResponse.json(await getAllMedia());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Record uploaded library media (R2 asset or pasted URL) so it shows in the tab.
export async function POST(req: NextRequest) {
  try {
    const { assetId, url, type, description, filename, bytes } = await req.json();
    if (!assetId && !url) {
      return NextResponse.json({ error: 'assetId or url is required' }, { status: 400 });
    }
    const [row] = await db.insert(mediaAssets).values({
      assetId:     assetId || null,
      url:         url || null,
      type:        type === 'video' ? 'video' : 'image',
      filename:    filename || null,
      bytes:       Number.isFinite(bytes) ? bytes : null,
      description: description || null,
    }).returning({ id: mediaAssets.id });
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
