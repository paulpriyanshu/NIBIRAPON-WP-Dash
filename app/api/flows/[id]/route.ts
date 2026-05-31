import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import getMongoClient from '@/lib/mongodb';

const DB   = 'nibiraponcollections';
const COLL = 'flows';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { name, nodes, edges } = await req.json();

    const client = await getMongoClient();
    await client
      .db(DB)
      .collection(COLL)
      .updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            name:      name?.trim(),
            nodes:     nodes ?? [],
            edges:     edges ?? [],
            nodeCount: (nodes ?? []).length,
            edgeCount: (edges ?? []).length,
            updatedAt: new Date(),
          },
        },
      );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[flows PATCH]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const client = await getMongoClient();
    await client
      .db(DB)
      .collection(COLL)
      .deleteOne({ _id: new ObjectId(id) });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[flows DELETE]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
