import { NextRequest, NextResponse } from 'next/server';
import { customMessagesColl, serializeCustomMessage } from '@/lib/custom-message-store';
import { cleanCustomMessage } from '@/lib/custom-messages';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await (await customMessagesColl()).find({}).sort({ updatedAt: -1 }).toArray();
    return NextResponse.json(rows.map(serializeCustomMessage));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const clean = cleanCustomMessage(await req.json());
    const now = new Date();
    const res = await (await customMessagesColl()).insertOne({ ...clean, createdAt: now, updatedAt: now } as any);
    return NextResponse.json({ id: res.insertedId.toString() }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
