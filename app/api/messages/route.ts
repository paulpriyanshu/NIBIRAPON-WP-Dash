import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  messages, conversations, messageReactions, messageStatusLog, templates,
} from '@/db/schema';
import { eq, asc, inArray, sql, desc } from 'drizzle-orm';
import { sendTextMessage, sendTemplateMessage, sendRichTemplateMessage, sendMPMTemplateMessage, sendMediaMessage, markMessageRead } from '@/lib/whatsapp-api';

// ─── GET: Fetch messages for a conversation ────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');
  const page           = parseInt(searchParams.get('page') || '1', 10);
  const afterMs        = searchParams.get('after'); // Unix ms — for polling only new messages
  const pageSize       = 50;

  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
  }

  try {
    let rows;
    let hasMore = false;

    if (afterMs) {
      // ── Poll mode: only messages newer than `after` ──────────────────────
      const afterDate = new Date(parseInt(afterMs, 10));
      rows = await db
        .select()
        .from(messages)
        .where(
          sql`${messages.conversationId} = ${conversationId} AND ${messages.sentAt} > ${afterDate}`
        )
        .orderBy(asc(messages.sentAt));
    } else {
      // ── Pagination mode: latest page ──────────────────────────────────────
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.conversationId, conversationId));

      const offset = Math.max(0, count - page * pageSize);
      rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.sentAt))
        .limit(pageSize)
        .offset(offset);

      hasMore = offset > 0;

      // Reset unread count when user opens conversation (page 1 only)
      if (page === 1) {
        await db
          .update(conversations)
          .set({ unreadCount: 0 })
          .where(eq(conversations.id, conversationId));
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ messages: [], hasMore: false, total: 0 });
    }

    const msgIds = rows.map((m) => m.id);

    // ── Reactions ─────────────────────────────────────────────────────────────
    const rawReactions = await db
      .select()
      .from(messageReactions)
      .where(inArray(messageReactions.messageId, msgIds));

    const reactionsByMsg: Record<string, { emoji: string; from: string }[]> = {};
    for (const r of rawReactions) {
      if (!reactionsByMsg[r.messageId]) reactionsByMsg[r.messageId] = [];
      reactionsByMsg[r.messageId].push({ emoji: r.emoji, from: r.fromNumber });
    }

    // ── Reply-to preview: fetch original messages referenced by replyToId ────
    const replyToIds = [...new Set(rows.map((m) => m.replyToId).filter(Boolean))] as string[];
    const replyToMap: Record<string, { text: string | null; type: string; isOutgoing: boolean; mediaUrl: string | null; templateName: string | null; templateData: Record<string, any> | null }> = {};

    if (replyToIds.length > 0) {
      const replyRows = await db
        .select({
          id:           messages.id,
          text:         messages.text,
          type:         messages.type,
          isOutgoing:   messages.isOutgoing,
          mediaUrl:     messages.mediaUrl,
          templateName: messages.templateName,
          templateData: messages.templateData,
        })
        .from(messages)
        .where(inArray(messages.id, replyToIds));

      // For template messages, fetch their actual body text from the templates table
      const tplNames = [...new Set(replyRows.filter((r) => r.templateName).map((r) => r.templateName as string))];
      const tplBodyMap: Record<string, string> = {};
      if (tplNames.length > 0) {
        const tplRows = await db
          .select({ name: templates.name, components: templates.components })
          .from(templates)
          .where(inArray(templates.name, tplNames));
        for (const t of tplRows) {
          const body = (t.components as any[])?.find((c: any) => c.type === 'BODY');
          if (body?.text) tplBodyMap[t.name] = body.text;
        }
      }

      for (const r of replyRows) {
        const resolvedText = r.templateName && tplBodyMap[r.templateName]
          ? tplBodyMap[r.templateName]
          : r.text;
        replyToMap[r.id] = {
          text:         resolvedText,
          type:         r.type,
          isOutgoing:   r.isOutgoing,
          mediaUrl:     r.mediaUrl,
          templateName: r.templateName,
          templateData: r.templateData as Record<string, any> | null,
        };
      }
    }

    // ── Mark latest incoming message as read when user opens the conversation ──
    if (!afterMs && page === 1) {
      const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
      if (accessToken && accessToken !== 'your_access_token_here') {
        const latestIncoming = [...rows]
          .filter((m) => !m.isOutgoing)
          .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0];
        if (latestIncoming) {
          markMessageRead(latestIncoming.id).catch(() => {});
        }
      }
    }

    // ── Shape response ────────────────────────────────────────────────────────
    const shaped = rows.map((m) => ({
      id:              m.id,
      conversationId:  m.conversationId,
      from:            m.fromNumber,
      to:              m.toNumber,
      type:            m.type,
      text:            m.text,
      timestamp:       m.sentAt.getTime(),
      status:          m.status,
      isOutgoing:      m.isOutgoing,
      isDeleted:       m.isDeleted,
      isStarred:       m.isStarred,
      templateName:    m.templateName,
      templateData:    m.templateData as Record<string, string> | undefined,
      reactions:       reactionsByMsg[m.id] || [],
      media:           (m.mediaUrl || m.mediaId)
        ? {
            url:      m.mediaUrl || (m.mediaId ? `/api/media/${m.mediaId}` : null),
            mimeType: m.mediaMimeType,
            filename: m.mediaFilename,
            caption:  m.mediaCaption,
          }
        : undefined,
      replyTo: m.replyToId && replyToMap[m.replyToId]
        ? {
            id:           m.replyToId,
            text:         replyToMap[m.replyToId].text,
            type:         replyToMap[m.replyToId].type,
            isOutgoing:   replyToMap[m.replyToId].isOutgoing,
            mediaUrl:     replyToMap[m.replyToId].mediaUrl,
            templateName: replyToMap[m.replyToId].templateName,
            templateData: replyToMap[m.replyToId].templateData,
          }
        : undefined,
    }));

    return NextResponse.json({ messages: shaped, hasMore, total: rows.length });
  } catch (err: any) {
    console.error('[Messages GET] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST: Send a message ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      conversationId, to, text, type = 'text', templateName, mediaId, filename, mimeType, replyToId,
      bodyParams = [] as string[],
      headerParam = '',
      headerMediaUrl = '',
      headerMediaType = 'image',
      isMPMTemplate = false,
      mpmSections = [],
      thumbnailProductRetailerId = '',
    } = body;

    const isMedia = ['image', 'document', 'audio', 'video'].includes(type);
    if (!conversationId || !to || (!text && !mediaId)) {
      return NextResponse.json({ error: 'conversationId, to, and text or mediaId are required' }, { status: 400 });
    }

    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    let waMessageId: string | null = null;

    if (accessToken && accessToken !== 'your_access_token_here' && phoneNumberId) {
      try {
        let waRes;
        if (isMedia && mediaId) {
          waRes = await sendMediaMessage({ to, type: type as any, mediaId, filename });
        } else if (type === 'template' && templateName) {
          if (isMPMTemplate && mpmSections.length > 0 && thumbnailProductRetailerId) {
            // Full MPM catalog send
            waRes = await sendMPMTemplateMessage({
              to, templateName, language: 'en',
              bodyParams,
              headerParam: headerParam || undefined,
              thumbnailProductRetailerId,
              sections: mpmSections,
            });
          } else if (bodyParams.length > 0 || headerParam || headerMediaUrl) {
            // Template with variable substitutions
            waRes = await sendRichTemplateMessage({
              to, templateName, language: 'en',
              bodyParams,
              headerParam: headerParam || undefined,
              headerMediaUrl: headerMediaUrl || undefined,
              headerMediaType: headerMediaType as any,
              isCatalogTemplate: false,
            });
          } else {
            // Plain template with no parameters — use original simple send
            waRes = await sendTemplateMessage({ to, templateName });
          }
        } else {
          waRes = await sendTextMessage({ to, text, contextMessageId: replyToId || undefined });
        }
        waMessageId = waRes?.messages?.[0]?.id || null;
      } catch (apiErr: any) {
        console.error('[send] WhatsApp API error:', apiErr.message);
      }
    }

    const messageId = waMessageId || `wamid.local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const bizPhone  = process.env.WHATSAPP_PHONE_NUMBER_ID || '680420725151873';
    const now       = new Date();

    const [inserted] = await db.insert(messages).values({
      id:             messageId,
      conversationId,
      fromNumber:     bizPhone,
      toNumber:       to,
      type:           type as any,
      text:           text || null,
      templateName:   templateName || null,
      templateData:   type === 'template' ? { bodyParams, headerParam } : null,
      replyToId:      replyToId || null,
      mediaId:        mediaId || null,
      mediaMimeType:  mimeType || null,
      mediaFilename:  filename || null,
      status:         waMessageId ? 'sent' : 'failed',
      isOutgoing:     true,
      sentAt:         now,
    }).returning();

    await db.insert(messageStatusLog).values({ messageId: inserted.id, status: inserted.status, loggedAt: now });
    await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversationId));

    return NextResponse.json({
      id:             inserted.id,
      conversationId: inserted.conversationId,
      from:           inserted.fromNumber,
      to:             inserted.toNumber,
      type:           inserted.type,
      text:           inserted.text,
      timestamp:      inserted.sentAt.getTime(),
      status:         inserted.status,
      isOutgoing:     true,
      templateName:   inserted.templateName,
      media:          inserted.mediaId
        ? {
            url:      `/api/media/${inserted.mediaId}`,
            mimeType: inserted.mediaMimeType,
            filename: inserted.mediaFilename,
            caption:  null,
          }
        : undefined,
    });
  } catch (err: any) {
    console.error('[Messages POST] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── PATCH: Star / delete / react ────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const { id, action, emoji, from } = await req.json();
    if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });

    if (action === 'star') {
      const [msg] = await db.select({ isStarred: messages.isStarred }).from(messages).where(eq(messages.id, id));
      await db.update(messages).set({ isStarred: !msg?.isStarred }).where(eq(messages.id, id));
    } else if (action === 'delete') {
      await db.update(messages).set({ isDeleted: true }).where(eq(messages.id, id));
    } else if (action === 'react' && emoji && from) {
      await db
        .insert(messageReactions)
        .values({ messageId: id, fromNumber: from, emoji })
        .onConflictDoUpdate({ target: [messageReactions.messageId, messageReactions.fromNumber], set: { emoji } });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
