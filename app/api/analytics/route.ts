import { NextRequest, NextResponse } from 'next/server';
import { getAnalytics } from '@/lib/analytics';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '30d';
    return NextResponse.json(await getAnalytics(range));
  } catch (err: any) {
    console.error('[Analytics API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
