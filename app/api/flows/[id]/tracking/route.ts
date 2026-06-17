import { NextRequest, NextResponse } from 'next/server';
import { getFlowTracking } from '@/lib/flow-store';

// Tracking analytics for a flow: launch / delivery / engagement counts and a
// per-node funnel of how far each run travelled. Powers the Tracking panel.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return NextResponse.json(await getFlowTracking(id));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
