import { NextRequest, NextResponse } from 'next/server';
import { runsColl } from '@/lib/flow-store';

// Run stats for a flow (for the Active Flows tab).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const runs = await runsColl();
    const [active, completed, stopped] = await Promise.all([
      runs.countDocuments({ flowId: id, status: 'active' }),
      runs.countDocuments({ flowId: id, status: 'completed' }),
      runs.countDocuments({ flowId: id, status: 'stopped' }),
    ]);
    return NextResponse.json({ active, completed, stopped, total: active + completed + stopped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
