import { NextResponse } from 'next/server';
import { syncInventoryEmbeddings } from '@/lib/embeddings';

export async function POST() {
  try {
    const { synced, total } = await syncInventoryEmbeddings();
    if (synced === 0) {
      return NextResponse.json({ synced: 0, message: 'All products already synced' });
    }
    return NextResponse.json({ synced, total });
  } catch (err: any) {
    console.error('[sync]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
