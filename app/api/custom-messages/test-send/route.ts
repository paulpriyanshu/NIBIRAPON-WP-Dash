import { NextRequest, NextResponse } from 'next/server';
import { getCustomMessage } from '@/lib/custom-message-store';
import { sendCustomMessage } from '@/lib/custom-message-send';

/** Canonical phone: bare 10-digit Indian number → prepend 91 (matches the webhook). */
function canonicalPhone(raw: string): string {
  const s = (raw || '').replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(s)) return `91${s}`;
  return s;
}

// Send a custom message to an arbitrary number to test it (no conversation needed).
export async function POST(req: NextRequest) {
  try {
    const { id, phone } = await req.json();
    if (!id || !phone) return NextResponse.json({ error: 'id and phone are required' }, { status: 400 });

    const to = canonicalPhone(String(phone));
    if (to.length < 10) return NextResponse.json({ error: 'enter a valid phone number' }, { status: 400 });

    const m = await getCustomMessage(id);
    if (!m) return NextResponse.json({ error: 'custom message not found' }, { status: 404 });

    const r = await sendCustomMessage(to, m);
    if (!r.msgId) return NextResponse.json({ error: 'WhatsApp did not accept the message (the recipient may not have an open 24h session — interactive messages can only be sent inside one).' }, { status: 502 });
    return NextResponse.json({ ok: true, id: r.msgId });
  } catch (err: any) {
    console.error('[custom-messages/test-send]', err);
    return NextResponse.json({ error: err.message || 'send failed' }, { status: 500 });
  }
}
