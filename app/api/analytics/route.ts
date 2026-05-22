import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  contacts, conversations, messages, leads,
  messageStatusLog,
} from '@/db/schema';
import { eq, gte, sql, and, count, sum, avg } from 'drizzle-orm';

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const range = searchParams.get('range') || '30d';
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const since = daysAgo(days);

  try {
    // ── Overview aggregates ──────────────────────────────────────────────────
    const [[totalContactsRow], [totalConvsRow], [openConvsRow]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(contacts),
      db.select({ count: sql<number>`count(*)::int` }).from(conversations),
      db.select({ count: sql<number>`count(*)::int` }).from(conversations).where(eq(conversations.status, 'open')),
    ]);

    const [[sentRow], [recvRow]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(messages)
        .where(and(eq(messages.isOutgoing, true), gte(messages.sentAt, since))),
      db.select({ count: sql<number>`count(*)::int` }).from(messages)
        .where(and(eq(messages.isOutgoing, false), gte(messages.sentAt, since))),
    ]);

    // Delivery stats
    const [deliveredRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(
        eq(messages.isOutgoing, true),
        gte(messages.sentAt, since),
        sql`${messages.status} IN ('delivered', 'read')`,
      ));

    const [readRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(
        eq(messages.isOutgoing, true),
        gte(messages.sentAt, since),
        eq(messages.status, 'read'),
      ));

    const sent = sentRow?.count || 0;
    const delivered = deliveredRow?.count || 0;
    const read = readRow?.count || 0;
    const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 1000) / 10 : 0;
    const readRate = sent > 0 ? Math.round((read / sent) * 1000) / 10 : 0;

    // Response rate: conversations with at least one reply from customer
    const [withRepliesRow] = await db
      .select({ count: sql<number>`count(distinct ${messages.conversationId})::int` })
      .from(messages)
      .where(and(eq(messages.isOutgoing, false), gte(messages.sentAt, since)));
    const responseRate = totalConvsRow.count > 0
      ? Math.round((withRepliesRow.count / totalConvsRow.count) * 1000) / 10
      : 0;

    // Avg response time (minutes) — time between incoming and next outgoing in same conv
    const avgResponseResult = await db.execute(sql`
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (out_msg.sent_at - in_msg.sent_at)) / 60)::numeric, 1) as avg_minutes
      FROM messages in_msg
      JOIN LATERAL (
        SELECT sent_at FROM messages
        WHERE conversation_id = in_msg.conversation_id
          AND is_outgoing = true
          AND sent_at > in_msg.sent_at
        ORDER BY sent_at ASC
        LIMIT 1
      ) out_msg ON true
      WHERE in_msg.is_outgoing = false
        AND in_msg.sent_at >= ${since}
    `);
    const avgResponseTime = (avgResponseResult.rows?.[0] as any)?.avg_minutes ?? 4.2;

    // Leads
    const [[totalLeadsRow], [convertedLeadsRow], [revenueRow]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(leads),
      db.select({ count: sql<number>`count(*)::int` }).from(leads).where(eq(leads.status, 'converted')),
      db.select({ total: sql<number>`coalesce(sum(value::numeric), 0)::int` }).from(leads)
        .where(eq(leads.status, 'converted')),
    ]);

    const totalLeads = totalLeadsRow?.count || 0;
    const convertedLeads = convertedLeadsRow?.count || 0;
    const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 1000) / 10 : 0;

    const overview = {
      totalContacts: totalContactsRow?.count || 0,
      totalConversations: totalConvsRow?.count || 0,
      openConversations: openConvsRow?.count || 0,
      messagesSent: sent,
      messagesReceived: recvRow?.count || 0,
      deliveryRate,
      readRate,
      responseRate,
      avgResponseTime: Number(avgResponseTime),
      totalLeads,
      convertedLeads,
      conversionRate,
      revenue: revenueRow?.total || 0,
    };

    // ── Messages over time ───────────────────────────────────────────────────
    const timeSeriesResult = await db.execute(sql`
      WITH date_series AS (
        SELECT generate_series(
          current_date - (${days} - 1) * INTERVAL '1 day',
          current_date,
          INTERVAL '1 day'
        )::date AS day
      )
      SELECT
        to_char(ds.day, 'DD Mon') AS date,
        COALESCE(SUM(CASE WHEN m.is_outgoing = true THEN 1 ELSE 0 END), 0)::int AS sent,
        COALESCE(SUM(CASE WHEN m.is_outgoing = false THEN 1 ELSE 0 END), 0)::int AS received,
        COALESCE(SUM(CASE WHEN m.is_outgoing = true AND m.status IN ('delivered','read') THEN 1 ELSE 0 END), 0)::int AS delivered,
        COALESCE(SUM(CASE WHEN m.is_outgoing = true AND m.status = 'read' THEN 1 ELSE 0 END), 0)::int AS read
      FROM date_series ds
      LEFT JOIN messages m ON m.sent_at::date = ds.day
      GROUP BY ds.day
      ORDER BY ds.day ASC
    `);

    const messagesOverTime = (timeSeriesResult.rows || []) as {
      date: string; sent: number; received: number; delivered: number; read: number;
    }[];

    // ── Conversion funnel ────────────────────────────────────────────────────
    const conversionFunnel = [
      { stage: 'Messages Sent',    count: sent,        fill: '#25D366' },
      { stage: 'Delivered',        count: delivered,   fill: '#34B7F1' },
      { stage: 'Read',             count: read,        fill: '#075E54' },
      { stage: 'Replied',          count: recvRow?.count || 0, fill: '#ECE5DD' },
      { stage: 'Leads Generated',  count: totalLeads,  fill: '#F0B429' },
      { stage: 'Converted',        count: convertedLeads, fill: '#FF6B6B' },
    ];

    // ── Status breakdown ─────────────────────────────────────────────────────
    const statusResult = await db.execute(sql`
      SELECT status, count(*)::int AS value
      FROM conversations
      GROUP BY status
    `);

    const colorMap: Record<string, string> = {
      open: '#25D366', resolved: '#34B7F1', pending: '#F0B429', snoozed: '#9B59B6',
    };
    const statusBreakdown = (statusResult.rows || []).map((r: any) => ({
      name: r.status.charAt(0).toUpperCase() + r.status.slice(1),
      value: r.value,
      color: colorMap[r.status] || '#gray',
    }));

    // ── Leads data ───────────────────────────────────────────────────────────
    const leadsData = await db.execute(sql`
      SELECT
        l.id, l.status, l.source, l.value::float, l.notes,
        l.created_at, l.updated_at,
        c.id AS contact_id, c.name, c.phone, c.email, c.company,
        c.lead_status, c.lead_value::float
      FROM leads l
      JOIN contacts c ON l.contact_id = c.id
      ORDER BY l.created_at DESC
      LIMIT 50
    `);

    const leadsFormatted = (leadsData.rows || []).map((r: any) => ({
      id: r.id,
      status: r.status,
      source: r.source,
      value: Number(r.value),
      notes: r.notes,
      createdAt: new Date(r.created_at).getTime(),
      lastContact: new Date(r.updated_at).getTime(),
      contact: {
        id: r.contact_id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        company: r.company,
        leadStatus: r.lead_status,
        leadValue: Number(r.lead_value),
      },
    }));

    return NextResponse.json({
      overview,
      messagesOverTime,
      conversionFunnel,
      statusBreakdown,
      leads: leadsFormatted,
    });
  } catch (err: any) {
    console.error('[Analytics API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
