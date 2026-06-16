import type { Template } from '@/types';
import type { MPMSection } from '@/lib/whatsapp-api';

/**
 * Canonical, fully-parameterized config for a saved template message.
 * Superset of `DraftTemplateConfig` (db/schema.ts) and `NodeParams` (lib/flow-engine.ts),
 * so it maps to the agent, flows, and broadcast with no translation.
 */
export interface TemplateMessageConfig {
  bodyParams?: string[];
  headerParam?: string;        // header TEXT {{1}}
  headerMediaUrl?: string;     // header IMAGE/VIDEO/DOCUMENT link (pasted public URL)
  headerMediaAssetId?: string; // R2 asset key — resolved to a fetchable URL at send time
  headerMediaType?: 'image' | 'video' | 'document';
  buttonParams?: string[];     // dynamic URL-button suffixes
  thumbnailProductRetailerId?: string;
  mpmSections?: { title: string; productIds: string }[]; // productIds: comma-separated
  isMPM?: boolean;
  isCatalog?: boolean;
}

/** A saved template message as returned by the API (`_id` serialized to `id`). */
export interface TemplateMessage {
  id: string;
  name: string;
  templateName: string;
  language: string;
  config: TemplateMessageConfig;
  preview: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Substitute {{1}}, {{2}}… in a template string with the given ordered params. */
function fillPlaceholders(text: string, params: string[]): string {
  return (text ?? '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
    const v = params[Number(n) - 1];
    return v != null && v !== '' ? v : `{{${n}}}`;
  });
}

/**
 * Render a saved template message into a human-readable preview: header, body
 * (with variables filled in), footer, buttons, and MPM section titles/products.
 * Used both for the composer's live preview and for the agent's prompt context,
 * so what the agent reads is exactly what gets shown/sent.
 */
export function renderTemplateMessage(template: Template, config: TemplateMessageConfig): string {
  const lines: string[] = [];
  const get = (type: string) => template.components.find(c => c.type === type);

  const header = get('HEADER');
  if (header) {
    if (header.format === 'TEXT' && header.text) {
      lines.push(fillPlaceholders(header.text, config.headerParam ? [config.headerParam] : []));
    } else if (header.format && header.format !== 'TEXT') {
      const url = config.headerMediaUrl ? ` (${config.headerMediaUrl})` : '';
      lines.push(`[${header.format.toLowerCase()} header${url}]`);
    }
  }

  const body = get('BODY');
  if (body?.text) lines.push(fillPlaceholders(body.text, config.bodyParams ?? []));

  const footer = get('FOOTER');
  if (footer?.text) lines.push(footer.text);

  const buttons = get('BUTTONS')?.buttons ?? [];
  if (buttons.length) lines.push(`Buttons: ${buttons.map(b => b.text).join(' | ')}`);

  const sections = (config.mpmSections ?? []).filter(s => s.title?.trim() || s.productIds?.trim());
  if (sections.length) {
    lines.push('Products:');
    for (const s of sections) {
      lines.push(`  • ${s.title?.trim() || 'Products'}: ${s.productIds?.trim() || '—'}`);
    }
  }

  return lines.filter(Boolean).join('\n');
}

/** Expand the comma-separated MPM section config into the WhatsApp API shape. */
export function expandMpmSections(
  mpmSections: { title: string; productIds: string }[] | undefined,
): MPMSection[] {
  return (mpmSections ?? [])
    .map(s => ({
      title: s.title?.trim() || 'Products',
      product_items: (s.productIds ?? '')
        .split(',')
        .map(id => ({ product_retailer_id: id.trim() }))
        .filter(x => x.product_retailer_id),
    }))
    .filter(s => s.product_items.length > 0);
}

/**
 * Convert a saved config into the arguments for the right WhatsApp send function.
 * Callers do: `payload.kind === 'mpm' ? sendMPMTemplateMessage(payload.args) : sendRichTemplateMessage(payload.args)`.
 */
export function configToSendPayload(
  to: string,
  templateName: string,
  language: string,
  config: TemplateMessageConfig,
):
  | { kind: 'mpm'; args: Parameters<typeof import('@/lib/whatsapp-api').sendMPMTemplateMessage>[0] }
  | { kind: 'rich'; args: Parameters<typeof import('@/lib/whatsapp-api').sendRichTemplateMessage>[0] } {
  const c = config || {};
  if (c.isMPM && c.thumbnailProductRetailerId && (c.mpmSections?.length ?? 0) > 0) {
    return {
      kind: 'mpm',
      args: {
        to,
        templateName,
        language,
        headerParam: c.headerParam || undefined,
        bodyParams: c.bodyParams ?? [],
        thumbnailProductRetailerId: c.thumbnailProductRetailerId,
        sections: expandMpmSections(c.mpmSections),
      },
    };
  }
  return {
    kind: 'rich',
    args: {
      to,
      templateName,
      language,
      bodyParams: c.bodyParams ?? [],
      headerParam: c.headerParam || undefined,
      headerMediaUrl: c.headerMediaUrl || undefined,
      headerMediaType: c.headerMediaType,
      buttonParams: c.buttonParams ?? [],
      isCatalogTemplate: !!c.isCatalog,
    },
  };
}
