import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { agentSettings } from '@/db/schema';

// Upsert using a fixed well-known ID so there is always exactly one row.
const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export async function GET() {
  try {
    const [row] = await db.select().from(agentSettings).limit(1);
    if (!row) {
      return NextResponse.json({ agentName: 'Riya', systemPrompt: '' });
    }
    return NextResponse.json(row);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { agentName, systemPrompt } = await req.json();
    const now = new Date();

    await db
      .insert(agentSettings)
      .values({ id: SETTINGS_ID, agentName: agentName ?? 'Riya', systemPrompt: systemPrompt ?? '', updatedAt: now })
      .onConflictDoUpdate({
        target: agentSettings.id,
        set: {
          ...(agentName    !== undefined && { agentName }),
          ...(systemPrompt !== undefined && { systemPrompt }),
          updatedAt: now,
        },
      });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
