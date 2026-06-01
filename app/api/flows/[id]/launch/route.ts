import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { db } from '@/db';
import { contacts, conversations, leads } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { flowsColl, startRun, canonicalPhone } from '@/lib/flow-store';
import { PHONE_NUMBER_ID } from '@/lib/whatsapp-api';
import { findRootNodes, type Flow } from '@/lib/flow-engine';

export const maxDuration = 300;

/** Find or create a contact + open conversation for a phone. */
async function ensureConversation(phone: string): Promise<{ contactId: string; conversationId: string }> {
  let [contact] = await db.select().from(contacts).where(eq(contacts.phone, phone)).limit(1);
  if (!contact) {
    [contact] = await db.insert(contacts).values({
      name: phone, phone, leadStatus: 'new', leadValue: '0',
    }).returning();
    await db.insert(leads).values({ contactId: contact.id, status: 'new', source: 'Flow', value: '0' }).catch(() => {});
  }
  let [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.contactId, contact.id), eq(conversations.status, 'open')))
    .limit(1);
  if (!conv) {
    [conv] = await db.insert(conversations).values({
      contactId: contact.id, status: 'open', agentEnabled: true,
    }).returning();
  }
  return { contactId: contact.id, conversationId: conv.id };
}

// Broadcast the flow's root template to recipients and start a run for each.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { recipients = [] } = await req.json() as { recipients: string[] };

    const flows = await flowsColl();
    const flowDoc = await flows.findOne({ _id: new ObjectId(id) });
    if (!flowDoc) return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
    if (flowDoc.status !== 'live') {
      return NextResponse.json({ error: 'Launch the flow (go live) before broadcasting its root template.' }, { status: 400 });
    }

    const flow = flowDoc as unknown as Flow & { _id: string; rootNodeId?: string };
    const roots = findRootNodes(flow);
    const rootNodeId = flow.rootNodeId && roots.includes(flow.rootNodeId) ? flow.rootNodeId : roots[0];
    if (!rootNodeId) return NextResponse.json({ error: 'Flow has no starting template' }, { status: 400 });

    const phones = [...new Set(
      (recipients as string[]).map(canonicalPhone).filter(p => p.length >= 10),
    )];
    if (phones.length === 0) return NextResponse.json({ error: 'No valid recipients' }, { status: 400 });

    const bizPhone = PHONE_NUMBER_ID;
    let started = 0;
    const failures: { phone: string; error: string }[] = [];

    for (const phone of phones) {
      try {
        const { contactId, conversationId } = await ensureConversation(phone);
        const r = await startRun({
          flow: { ...flow, _id: id },
          rootNodeId,
          phone,
          contactId,
          conversationId,
          bizPhone,
        });
        if (r.ok) started++;
        else failures.push({ phone, error: r.error ?? 'failed' });
      } catch (e) {
        failures.push({ phone, error: e instanceof Error ? e.message : 'failed' });
      }
    }

    return NextResponse.json({ started, total: phones.length, failures });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
