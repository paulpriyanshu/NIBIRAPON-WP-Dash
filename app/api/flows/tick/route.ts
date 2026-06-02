import { NextRequest, NextResponse } from 'next/server';
import { runDueSteps } from '@/lib/flow-store';

// Fires scheduled delay steps. Call on a schedule (Vercel Cron or an external
// cron every minute). If CRON_SECRET is set, requests must present it.
export const dynamic = 'force-dynamic';

async function tick(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    const key  = new URL(req.url).searchParams.get('secret');
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  }
  try {
    const { fired } = await runDueSteps();
    return NextResponse.json({ ok: true, fired });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    console.error('[flow-tick]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = tick;   // Vercel Cron uses GET
export const POST = tick;  // external crons may POST
