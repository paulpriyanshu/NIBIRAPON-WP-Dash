import { NextResponse } from 'next/server';
import { getAllMedia } from '@/lib/queries/media';

export async function GET() {
  try {
    return NextResponse.json(await getAllMedia());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
