import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { messages, templates } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [msg] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, id))
    .limit(1)

  if (!msg) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // If it's a template message, fetch the full template so the modal can show header image/video
  let templateComponents: any[] = []
  if (msg.templateName) {
    const [tpl] = await db
      .select({ components: templates.components })
      .from(templates)
      .where(eq(templates.name, msg.templateName))
      .limit(1)
    templateComponents = (tpl?.components as any[]) || []
  }

  return NextResponse.json({
    id:                 msg.id,
    type:               msg.type,
    text:               msg.text,
    isOutgoing:         msg.isOutgoing,
    mediaUrl:           msg.mediaUrl,
    mediaMimeType:      msg.mediaMimeType,
    mediaFilename:      msg.mediaFilename,
    mediaCaption:       msg.mediaCaption,
    templateName:       msg.templateName,
    templateData:       msg.templateData,
    templateComponents,
    sentAt:             msg.sentAt,
  })
}
