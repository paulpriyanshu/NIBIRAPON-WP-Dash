import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { contacts, conversations, messages, messageStatusLog, leads } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { sendRichTemplateMessage, sendMPMTemplateMessage, MPMSection } from '@/lib/whatsapp-api';

export async function POST(req: NextRequest) {
  try {
    const {
      to,
      templateName,
      language = 'en',
      bodyParams = [] as string[],
      headerParam = '',
      headerMediaUrl = '',
      headerMediaType = 'image',
      buttonParams = [] as string[],
      isCatalogTemplate = false,
      isMPMTemplate = false,
      mpmSections = [] as MPMSection[],
      thumbnailProductRetailerId = '',
    } = await req.json();

    if (!to || !templateName) {
      return NextResponse.json({ error: 'to and templateName are required' }, { status: 400 });
    }

    const phone = String(to).replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');
    if (phone.length < 10) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const bizPhone = process.env.WHATSAPP_PHONE_NUMBER_ID || '680420725151873';

    let waRes: any;
    if (isMPMTemplate) {
      if (mpmSections.length === 0 || !thumbnailProductRetailerId) {
        return NextResponse.json({ error: 'MPM template requires at least one section with products and a thumbnail product retailer ID' }, { status: 400 });
      }
      waRes = await sendMPMTemplateMessage({
        to: phone,
        templateName,
        language,
        headerParam: headerParam || undefined,
        bodyParams,
        thumbnailProductRetailerId,
        sections: mpmSections,
      });
    } else {
      waRes = await sendRichTemplateMessage({
        to: phone,
        templateName,
        language,
        bodyParams,
        headerParam:    headerParam    || undefined,
        headerMediaUrl: headerMediaUrl || undefined,
        headerMediaType: headerMediaType as any,
        buttonParams,
        isCatalogTemplate,
      });
    }

    const waMessageId = waRes?.messages?.[0]?.id;
    if (!waMessageId) {
      return NextResponse.json({ error: 'WhatsApp did not return a message ID' }, { status: 502 });
    }

    const now = new Date();

    // Upsert contact
    const [existing] = await db.select({ id: contacts.id })
      .from(contacts).where(eq(contacts.phone, phone)).limit(1);

    let contactId = existing?.id;
    if (!contactId) {
      const [c] = await db.insert(contacts).values({
        name: phone,
        phone,
        leadStatus: 'contacted',
      }).returning({ id: contacts.id });
      contactId = c.id;

      await db.insert(leads).values({
        contactId,
        status: 'contacted',
        source: 'Template Send',
        value: '0',
      });
    } else {
      await db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, contactId));
    }

    // Upsert conversation
    const [existingConv] = await db.select({ id: conversations.id })
      .from(conversations).where(eq(conversations.contactId, contactId)).limit(1);

    let conversationId = existingConv?.id;
    if (!conversationId) {
      const [conv] = await db.insert(conversations).values({
        contactId,
        status: 'open',
        unreadCount: 0,
      }).returning({ id: conversations.id });
      conversationId = conv.id;
    } else {
      await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversationId));
    }

    const previewText = bodyParams.length > 0
      ? (bodyParams as string[]).reduce((t: string, v: string, i: number) => t.replace(`{{${i + 1}}}`, v), `[Template: ${templateName}]`)
      : `[Template: ${templateName}]`;

    await db.insert(messages).values({
      id: waMessageId,
      conversationId,
      fromNumber: bizPhone,
      toNumber: phone,
      type: 'template',
      text: previewText,
      templateName,
      templateData: { bodyParams, headerParam } as any,
      status: 'sent',
      isOutgoing: true,
      sentAt: now,
    }).onConflictDoNothing();

    await db.insert(messageStatusLog).values({
      messageId: waMessageId,
      status: 'sent',
      loggedAt: now,
    });

    await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversationId));

    return NextResponse.json({ success: true, messageId: waMessageId, conversationId });
  } catch (err: any) {
    console.error('[send-template]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
