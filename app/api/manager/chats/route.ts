import { NextResponse } from 'next/server';
import { managerChatsColl } from '@/lib/manager-store';

// List chats (newest first) — id, title, updatedAt only.
export async function GET() {
  try {
    const coll = await managerChatsColl();
    const rows = await coll.find({}, { projection: { title: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 }).limit(100).toArray();
    return NextResponse.json(rows.map(r => ({ id: r._id.toString(), title: r.title, updatedAt: r.updatedAt })));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Create an empty chat.
export async function POST() {
  try {
    const coll = await managerChatsColl();
    const now = new Date();
    const res = await coll.insertOne({ title: 'New chat', messages: [], pendingActions: null, createdAt: now, updatedAt: now });
    return NextResponse.json({ id: res.insertedId.toString(), title: 'New chat', messages: [], pendingActions: null }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
