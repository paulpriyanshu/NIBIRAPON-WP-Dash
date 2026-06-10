import { unstable_cache } from 'next/cache';
import { db } from '@/db';
import { templates } from '@/db/schema';
import { getMessageTemplates } from '@/lib/whatsapp-api';
import { desc } from 'drizzle-orm';

export interface ShapedTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: unknown;
}

/** Sync templates from the WhatsApp API into the DB (best effort), then read them back. */
async function syncAndReadTemplates(): Promise<ShapedTemplate[]> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.WHATSAPP_WABA_ID;

  if (accessToken && wabaId && accessToken !== 'your_access_token_here') {
    try {
      const waData = await getMessageTemplates();
      const waTemplates = waData.data || [];
      for (const t of waTemplates) {
        await db
          .insert(templates)
          .values({
            id: t.id || `wa_${t.name}`,
            name: t.name,
            language: t.language || 'en',
            status: t.status as never,
            category: t.category as never,
            components: t.components || [],
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: templates.id,
            set: { status: t.status as never, components: t.components || [], syncedAt: new Date() },
          });
      }
    } catch (apiErr) {
      console.error('[Templates] WhatsApp API sync failed, serving DB cache:', apiErr);
    }
  }

  const rows = await db.select().from(templates).orderBy(desc(templates.syncedAt));
  return rows.map((t) => ({
    id: t.id, name: t.name, language: t.language,
    status: t.status, category: t.category, components: t.components,
  }));
}

/**
 * Cached template catalog. The WhatsApp API sync + upserts run at most once per
 * `revalidate` window (or immediately after `revalidateTag('templates')`), instead
 * of on every request — the catalog rarely changes.
 */
export const getCachedTemplates = unstable_cache(
  syncAndReadTemplates,
  ['wa-templates'],
  { tags: ['templates'], revalidate: 300 },
);
