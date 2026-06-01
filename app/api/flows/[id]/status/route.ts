import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { flowsColl } from '@/lib/flow-store';
import { findRootNodes, type Flow } from '@/lib/flow-engine';

// Launch (go live) or pause a flow.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { status, rootNodeId } = await req.json() as { status: 'live' | 'draft'; rootNodeId?: string };

    if (status !== 'live' && status !== 'draft') {
      return NextResponse.json({ error: 'status must be "live" or "draft"' }, { status: 400 });
    }

    const flows = await flowsColl();
    const flow = await flows.findOne({ _id: new ObjectId(id) });
    if (!flow) return NextResponse.json({ error: 'Flow not found' }, { status: 404 });

    if (status === 'live') {
      const roots = findRootNodes(flow as unknown as Flow);
      if (roots.length === 0) {
        return NextResponse.json({ error: 'Flow has no starting template (a template node with no incoming arrow).' }, { status: 400 });
      }
      const chosenRoot = rootNodeId && roots.includes(rootNodeId) ? rootNodeId : (roots.length === 1 ? roots[0] : null);
      if (!chosenRoot) {
        return NextResponse.json({ error: 'Multiple starting templates — pick one as the root.', roots }, { status: 409 });
      }
      await flows.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'live', rootNodeId: chosenRoot, activatedAt: new Date(), updatedAt: new Date() } },
      );
      return NextResponse.json({ ok: true, status: 'live', rootNodeId: chosenRoot });
    }

    await flows.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'draft', updatedAt: new Date() } },
    );
    return NextResponse.json({ ok: true, status: 'draft' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
