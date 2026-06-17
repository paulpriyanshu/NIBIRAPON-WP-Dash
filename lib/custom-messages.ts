// Shared shapes + helpers for custom (in-session) interactive messages.
// These are NOT WhatsApp templates — they're option lists, reply-button prompts,
// plain text, or media+caption that can be sent inside an open 24h session
// (flows, the AI agent, and manual inbox sends).

export type CustomMessageType = 'text' | 'media' | 'buttons' | 'list';
// Where a list/buttons message's options come from. 'manual' = typed options;
// 'categories'/'products' = pulled live from inventory, and tapping one auto-
// replies with that item's image + details (categories drill down to products).
export type OptionSource = 'manual' | 'categories' | 'products';

export interface CustomMessageButton { title: string; }
export interface CustomMessageRow { title: string; description?: string; }
export interface CustomMessageSection { title?: string; rows: CustomMessageRow[]; }
export interface CustomMessageMedia { type: 'image' | 'video'; assetId?: string; url?: string; }

export interface CustomMessage {
  id: string;
  name: string;
  type: CustomMessageType;
  body?: string;                       // text / buttons / list body
  media?: CustomMessageMedia | null;   // media
  caption?: string;                    // media caption
  header?: string;                     // buttons / list
  footer?: string;                     // buttons / list
  buttons?: CustomMessageButton[];     // buttons (≤3)
  listButton?: string;                 // list opener label (≤20)
  sections?: CustomMessageSection[];   // list (≤10 rows total) — manual options
  optionSource?: OptionSource;         // list/buttons: where options come from
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** The selectable option titles a customer can tap — the single source used by
 *  flow branching and the agent prompt. Empty for text/media. */
export function customMessageOptions(m: Pick<CustomMessage, 'type' | 'buttons' | 'sections' | 'optionSource'>): string[] {
  // Dynamic (category/product) lists have no fixed options — they're data-driven,
  // and selections auto-reply with details rather than branching a flow.
  if (m.optionSource && m.optionSource !== 'manual') return [];
  if (m.type === 'buttons') return (m.buttons ?? []).map(b => b.title.trim()).filter(Boolean);
  if (m.type === 'list') return (m.sections ?? []).flatMap(s => s.rows.map(r => r.title.trim())).filter(Boolean);
  return [];
}

/** A short, human-readable preview of a custom message (editor preview + agent context). */
export function renderCustomPreview(m: CustomMessage): string {
  const lines: string[] = [];
  if (m.header) lines.push(m.header);
  if (m.type === 'media') {
    lines.push(`[${m.media?.type ?? 'image'}]${m.caption ? ` ${m.caption}` : ''}`);
  } else if (m.body) {
    lines.push(m.body);
  }
  if (m.footer) lines.push(m.footer);
  const opts = customMessageOptions(m);
  if (m.type === 'buttons' && opts.length) lines.push(`Buttons: ${opts.join(' | ')}`);
  if (m.type === 'list' && opts.length) lines.push(`Options: ${opts.join(' | ')}`);
  return lines.filter(Boolean).join('\n');
}

/** Normalize arbitrary input into a clean, storable CustomMessage payload. */
export function cleanCustomMessage(input: any): Omit<CustomMessage, 'id' | 'createdAt' | 'updatedAt'> {
  const type: CustomMessageType = ['text', 'media', 'buttons', 'list'].includes(input?.type) ? input.type : 'text';
  const out: Omit<CustomMessage, 'id' | 'createdAt' | 'updatedAt'> = {
    name: String(input?.name ?? '').trim() || 'Untitled message',
    type,
    isActive: input?.isActive === undefined ? true : !!input.isActive,
  };

  if (type === 'media') {
    const md = input?.media;
    out.media = md && (md.assetId || md.url) ? { type: md.type === 'video' ? 'video' : 'image', assetId: md.assetId || undefined, url: md.url || undefined } : null;
    out.caption = input?.caption ? String(input.caption) : undefined;
  } else {
    out.body = input?.body ? String(input.body) : '';
  }

  const source: OptionSource = ['manual', 'categories', 'products'].includes(input?.optionSource) ? input.optionSource : 'manual';

  if (type === 'buttons') {
    out.optionSource = source;
    out.header = input?.header ? String(input.header) : undefined;
    out.footer = input?.footer ? String(input.footer) : undefined;
    out.buttons = Array.isArray(input?.buttons)
      ? input.buttons.map((b: any) => ({ title: String(b?.title ?? '').trim().slice(0, 20) })).filter((b: CustomMessageButton) => b.title).slice(0, 3)
      : [];
  }

  if (type === 'list') {
    out.optionSource = source;
    out.header = input?.header ? String(input.header) : undefined;
    out.footer = input?.footer ? String(input.footer) : undefined;
    out.listButton = (input?.listButton ? String(input.listButton) : 'View options').slice(0, 20);
    let rowCount = 0;
    out.sections = Array.isArray(input?.sections)
      ? input.sections.map((s: any) => ({
          title: s?.title ? String(s.title).slice(0, 24) : undefined,
          rows: (Array.isArray(s?.rows) ? s.rows : [])
            .map((r: any) => ({ title: String(r?.title ?? '').trim().slice(0, 24), description: r?.description ? String(r.description).slice(0, 72) : undefined }))
            .filter((r: CustomMessageRow) => r.title)
            .filter(() => rowCount++ < 10),
        })).filter((s: CustomMessageSection) => s.rows.length)
      : [];
  }

  return out;
}
