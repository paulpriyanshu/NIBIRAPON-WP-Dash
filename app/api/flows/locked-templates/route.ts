import { NextResponse } from 'next/server';
import { getLockedTemplates } from '@/lib/flow-store';

// Templates used by live flows — locked from independent broadcast.
export async function GET() {
  try {
    return NextResponse.json(await getLockedTemplates());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
