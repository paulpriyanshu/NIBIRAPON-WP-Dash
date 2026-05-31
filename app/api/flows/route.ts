import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

const DB   = 'nibiraponcollections';
const COLL = 'flows';

export async function GET() {
  try {
    const client = await clientPromise;
    const flows = await client
      .db(DB)
      .collection(COLL)
      .find({})
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json(
      flows.map(f => ({ ...f, _id: f._id.toString() })),
    );
  } catch (err: any) {
    console.error('[flows GET]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, nodes, edges } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const now = new Date();
    const client = await clientPromise;
    const result = await client
      .db(DB)
      .collection(COLL)
      .insertOne({
        name:       name.trim(),
        nodes:      nodes  ?? [],
        edges:      edges  ?? [],
        nodeCount:  (nodes ?? []).length,
        edgeCount:  (edges ?? []).length,
        createdAt:  now,
        updatedAt:  now,
      });

    return NextResponse.json({ id: result.insertedId.toString() }, { status: 201 });
  } catch (err: any) {
    console.error('[flows POST]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
