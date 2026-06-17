import OpenAI from 'openai';
import { db } from '@/db';
import { agentSettings, catalogProducts, categories as categoriesTable, type ProductMedia } from '@/db/schema';
import { eq, and, isNotNull, asc } from 'drizzle-orm';
import { agentDraftsColl, templateMessagesColl, toObjectId } from '@/lib/template-store';
import type { TemplateMessageConfig } from '@/lib/templates';
import { customMessagesColl, serializeCustomMessage } from '@/lib/custom-message-store';
import { customMessageOptions, renderCustomPreview, type CustomMessage } from '@/lib/custom-messages';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API });

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentMessage { role: 'user' | 'assistant'; content: string; }
export interface AgentMediaOut { type: 'image' | 'video'; url?: string; assetId?: string; caption?: string; }
export interface AgentListOut {
  body: string; button: string; header?: string;
  sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
  // Category images sent before the tappable list so the customer sees visuals first.
  media?: AgentMediaOut[];
}

/** A product category exposed to the agent, with its image for visual browsing. */
interface AgentCategory {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageAssetId: string | null;
}
export interface AgentTemplateOut { name: string; language: string; config: TemplateMessageConfig; }

/** A template draft resolved against its saved template message, ready for the prompt + send. */
interface ResolvedTemplateDraft {
  id: string;
  name: string;
  triggerHint: string | null;
  templateName: string;
  language: string;
  config: TemplateMessageConfig;
  preview: string;
}
export interface AgentResult  { reply: string; media: AgentMediaOut[]; list?: AgentListOut; template?: AgentTemplateOut; customMessage?: CustomMessage; shouldRespond: boolean; }

type ProductRow = typeof catalogProducts.$inferSelect;

// ── Cosine similarity (used for catalog semantic search) ─────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Catalog semantic search ──────────────────────────────────────────────────
// Returns the products most relevant to the query, ranked by embedding similarity.
// Only products the admin has added to the agent's context are considered.

async function getRelevantProducts(query: string, topN = 5): Promise<ProductRow[]> {
  const synced = await db
    .select()
    .from(catalogProducts)
    .where(and(
      eq(catalogProducts.inAgentContext, true),
      eq(catalogProducts.isActive, true),
      isNotNull(catalogProducts.embedding),
    ));

  if (synced.length === 0) return [];

  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const queryVec = embRes.data[0].embedding;

  return synced
    .filter(p => Array.isArray(p.embedding) && p.embedding.length > 0)
    .map(p => ({ p, score: cosineSimilarity(queryVec, p.embedding as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ p }) => p);
}

/** Fetch one active product by id — used to pin a product the customer tapped. */
async function getProductById(id: string): Promise<ProductRow | null> {
  const [p] = await db
    .select()
    .from(catalogProducts)
    .where(and(eq(catalogProducts.id, id), eq(catalogProducts.isActive, true)))
    .limit(1);
  return p ?? null;
}

/** Render the relevant products into a catalog block for the system prompt. */
function formatCatalogContext(products: ProductRow[]): string {
  if (products.length === 0) return '';
  const lines = products.map(p => {
    const media = (p.media ?? []) as ProductMedia[];
    const imgNote = media.length
      ? `\n  📷 Has ${media.length} photo/video(s): ${media.map(m => m.description || m.type).join('; ')}`
      : '';
    const parts = [
      `• [id: ${p.id}] ${p.name}`,
      p.category    && `(${p.category})`,
      p.priceRange  && `— ${p.priceRange}`,
      p.fabric      && `| Fabric: ${p.fabric}`,
      p.occasions   && `| For: ${p.occasions}`,
      p.description && `\n  ${p.description}`,
      p.customInfo  && `\n  📌 Extra info: ${p.customInfo}`,
      imgNote,
    ].filter(Boolean);
    return parts.join(' ');
  });
  return `## Relevant products from our catalog (use the id to send photos):\n${lines.join('\n')}`;
}

// ── Fetch agent settings + drafts ────────────────────────────────────────────

async function getContextData(userMessage: string, focusProductId?: string): Promise<{
  settingsPrompt: string;
  agentName: string;
  products: ProductRow[];
  categories: AgentCategory[];
  catalogContext: string;
  draftsContext: string;
  templateDraftsContext: string;
  templateDrafts: ResolvedTemplateDraft[];
  customMessages: CustomMessage[];
  customMessagesContext: string;
}> {
  const [settingsRow, draftDocs, products, categoryRows, customMsgDocs] = await Promise.all([
    db.select().from(agentSettings).limit(1).then(r => r[0]),
    agentDraftsColl().then(c => c.find({ isActive: true }).toArray()).catch(() => []),
    getRelevantProducts(userMessage).catch(() => [] as ProductRow[]),
    db.select({
        id:           categoriesTable.id,
        name:         categoriesTable.name,
        description:  categoriesTable.description,
        imageUrl:     categoriesTable.imageUrl,
        imageAssetId: categoriesTable.imageAssetId,
      })
      .from(categoriesTable)
      .where(eq(categoriesTable.inAgentContext, true))
      .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name))
      .catch(() => [] as AgentCategory[]),
    customMessagesColl().then(c => c.find({ isActive: true }).sort({ updatedAt: -1 }).toArray()).catch(() => []),
  ]);

  // Pin the product the customer is asking about (e.g. tapped from a list) so it's
  // always in context, even if semantic search didn't surface it.
  let pinnedProducts = products;
  if (focusProductId && !products.some(p => p.id === focusProductId)) {
    const focused = await getProductById(focusProductId);
    if (focused) pinnedProducts = [focused, ...products];
  }

  const customMessages: CustomMessage[] = (customMsgDocs as any[]).map(serializeCustomMessage);
  let customMessagesContext = '';
  if (customMessages.length > 0) {
    const list = customMessages.map(m => {
      const opts = customMessageOptions(m);
      const head = `- [custom message id: ${m.id}] "${m.name}" (${m.type})`;
      const preview = renderCustomPreview(m).split('\n').map(l => `    ${l}`).join('\n');
      const optLine = opts.length ? `\n    Options: ${opts.join(' | ')}` : '';
      return `${head}\n${preview}${optLine}`;
    }).join('\n');
    customMessagesContext = `## Custom messages you can send (call send_custom_message with the id). Use a list/buttons message to ASK the customer a question with options:\n${list}`;
  }

  const agentName      = settingsRow?.agentName    ?? 'Riya';
  const settingsPrompt = settingsRow?.systemPrompt ?? '';
  const categories: AgentCategory[] = categoryRows;

  const textDraftDocs = draftDocs.filter(d => d.kind !== 'template');
  const tmplDraftDocs = draftDocs.filter(d => d.kind === 'template' && d.templateMessageId);

  // Resolve each template draft against its saved template message (single source of truth).
  const objIds = tmplDraftDocs
    .map(d => toObjectId(d.templateMessageId!))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const msgsById = new Map<string, { templateName: string; language: string; config: TemplateMessageConfig; preview: string }>();
  if (objIds.length > 0) {
    const msgs = await (await templateMessagesColl()).find({ _id: { $in: objIds } }).toArray().catch(() => []);
    for (const m of msgs) {
      msgsById.set(m._id.toString(), {
        templateName: m.templateName,
        language: m.language || 'en',
        config: (m.config ?? {}) as TemplateMessageConfig,
        preview: m.preview ?? '',
      });
    }
  }

  const templateDrafts: ResolvedTemplateDraft[] = tmplDraftDocs
    .map(d => {
      const m = msgsById.get(d.templateMessageId!);
      if (!m) return null;
      return {
        id:           d._id.toString(),
        name:         d.name,
        triggerHint:  d.triggerHint ?? null,
        templateName: m.templateName,
        language:     m.language,
        config:       m.config,
        preview:      m.preview,
      };
    })
    .filter((x): x is ResolvedTemplateDraft => !!x);

  let draftsContext = '';
  if (textDraftDocs.length > 0) {
    const list = textDraftDocs
      .map(d => `### ${d.name}${d.triggerHint ? ` (send ${d.triggerHint})` : ''}\n${d.content ?? ''}`)
      .join('\n\n');
    draftsContext = `## Pre-written messages you can send verbatim:\n${list}`;
  }

  let templateDraftsContext = '';
  if (templateDrafts.length > 0) {
    const list = templateDrafts
      .map(d => {
        const head = `- [template draft id: ${d.id}] "${d.name}" — sends the "${d.templateName}" template. Send when: ${d.triggerHint || 'it fits the situation'}.`;
        const body = d.preview
          ? `\n  This template contains:\n${d.preview.split('\n').map(l => `    ${l}`).join('\n')}`
          : '';
        return head + body;
      })
      .join('\n');
    templateDraftsContext = `## Templates you can send (call send_template_draft with the id). You may also answer customer questions about what a template contains, using the contents shown below:\n${list}`;
  }

  return {
    settingsPrompt,
    agentName,
    products: pinnedProducts,
    categories,
    catalogContext: formatCatalogContext(pinnedProducts),
    draftsContext,
    templateDraftsContext,
    templateDrafts,
    customMessages,
    customMessagesContext,
  };
}

// ── Base system prompt ───────────────────────────────────────────────────────

function buildSystemPrompt(agentName: string, catalogCtx: string, draftsCtx: string, templateDraftsCtx: string, customMsgsCtx: string, extra: string, categories: AgentCategory[]): string {
  const categoryLine = categories.length
    ? categories.map(c => c.name + (c.imageUrl || c.imageAssetId ? ' 🖼️' : '')).join(', ')
    : '(none configured)';
  return `
You are ${agentName}, the friendly AI sales assistant for Nibirapon — a premium Indian saree brand by FemFashion.

## About Nibirapon & FemFashion
- Nibirapon is FemFashion's flagship label known for quality, elegance, and authenticity.
- We sell: Banarasi Silk, Kanjeevaram, Chanderi, Georgette, Linen, Cotton, Organza, Chiffon sarees.
- Price range: ₹1,500 (casual Cotton/Linen) → ₹50,000+ (Pure Silk Banarasi/Kanjivaram).
- Pan-India delivery; COD available on most orders.

## Rules
1. Reply in the SAME language the customer uses (Hindi / Hinglish / English).
2. Keep replies short, warm and conversational (2-4 sentences unless detail is asked). You are a real, friendly salesperson — NEVER just dump products, lists or photos with no words. Whenever something is sent to the customer (a photo, a list, product details), ALSO write a warm human sentence or two around it.
3. ALWAYS END YOUR REPLY WITH A FOLLOW-UP QUESTION that moves the chat forward — e.g. offer to show other options or colours, give a recommendation, ask their occasion/budget, or nudge toward placing the order. Never end on a flat statement; always invite the next step.
4. ALWAYS use the recent conversation above for context. The customer usually answers your previous question with a short message — e.g. "UPI", "COD", "card", a name, a phone number, a pincode, or an address like "New Delhi B3 17". These are part of the ongoing order conversation — accept and act on them. NEVER treat them as off-topic.
5. Stay focused on sarees, ethnic wear, and helping the customer buy. Only when the customer CLEARLY switches to an unrelated topic (weather, politics, coding, etc.) reply: "I can only help with sarees and Nibirapon products 😊". When unsure, assume it IS related and keep helping — do not refuse.
6. Never mention competitor brands.
7. When the customer asks ANYTHING about a product (look, colour, fabric, drape, border, blouse, fit, styling), ANSWER IT using that product's title, description and its 📷 photo descriptions in the catalog below. Those photo descriptions tell you what each picture shows — treat them as your own eyes. NEVER paste a photo description to the customer; they are internal notes only. If a detail truly isn't in the info you have, say so honestly.
8. When the customer wants to buy, guide them step by step: confirm which saree, then ask for the delivery address and payment method one at a time, and once you have them, share the payment details / next step.
9. Never ignore or reject a delivery address or payment method the customer gives you.
10. If a pre-written message in the DRAFTS section matches the situation (e.g. payment / UPI QR, shipping, returns), send it verbatim.

## Sending product photos
- ALWAYS write a warm, conversational text reply in your message content — describe the product in your own words and end with a follow-up question. Never send photos silently.
- When the customer is interested in, asks about, or would benefit from seeing specific product(s) listed in the catalog below, ALSO call the \`send_product_media\` tool with those products' ids. Their photos/videos are sent automatically, captioned with the product title + description — so you don't repeat the title/description verbatim; instead add a friendly human touch and a question.
- Only use ids that appear in the catalog section. Never invent ids. If no product is relevant, just reply with text and don't call the tool.

## Sending a category list
- When the customer wants to browse, asks "what do you have", asks to see categories, or is unsure what they want, call the \`send_category_list\` tool. The categories that have an image (marked 🖼️ below) are sent as photos first, then a tappable WhatsApp list so they can pick one. When they tap a category, its products are shown automatically as another tappable list — you don't need to do anything.
- Lean on these category visuals when helping a customer browse — they make your messages richer.
- Available categories: ${categoryLine}.

## Sending a product list
- When you want to offer a few specific products for the customer to choose between (e.g. they asked for "red silk sarees" and several fit), call the \`send_product_list\` tool with those products' ids. The customer gets a tappable list; when they tap a product, its photos, name and full details are sent automatically.
- Prefer \`send_product_list\` (a tappable picker) when offering several products to choose from; use \`send_product_media\` when you just want to show one or two products' photos directly. Only use ids from the catalog section.

## Sending a saved template
- When the situation matches a template's "Send when" note below, call \`send_template_draft\` with that template draft's id. The full template is sent to the customer. Still write a short text reply too. Only use ids listed below.

## Sending a custom message
- When a saved custom message below fits — especially an options list or buttons to ask the customer to choose (e.g. a category, a size, yes/no) — call \`send_custom_message\` with its id. Still write a short text reply too. Only use ids listed below; never invent them.

${catalogCtx ? catalogCtx + '\n' : ''}
${draftsCtx  ? draftsCtx  + '\n' : ''}
${templateDraftsCtx ? templateDraftsCtx + '\n' : ''}
${customMsgsCtx ? customMsgsCtx + '\n' : ''}
${extra      ? '## Additional instructions from admin:\n' + extra : ''}
`.trim();
}

// ── Meaningful message check ─────────────────────────────────────────────────

function isMeaningful(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  if (/^[.,!?…\-_*#@\s]+$/.test(t)) return false;
  return true;
}

// ── Collect media for the product ids the model chose ────────────────────────

function collectMedia(products: ProductRow[], ids: string[]): AgentMediaOut[] {
  const byId = new Map(products.map(p => [p.id, p]));
  const out: AgentMediaOut[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) continue;
    // Caption = product title + product description. The per-image `description`
    // is INTERNAL context for the agent (so it knows what each photo shows without
    // running vision) and must never be sent to the customer. Only the first photo
    // of a product carries the caption; the rest follow uncaptioned to avoid repeats.
    const productCaption = [p.name && `*${p.name}*`, p.description?.trim()]
      .filter(Boolean)
      .join('\n\n');
    let first = true;
    for (const m of (p.media ?? []) as ProductMedia[]) {
      if (!m.url && !m.assetId) continue;
      out.push({
        type:    m.type,
        url:     m.url,
        assetId: m.assetId,
        caption: first ? (productCaption || undefined) : undefined,
      });
      first = false;
    }
  }
  return out;
}

// ── Tool definition ──────────────────────────────────────────────────────────

const SEND_MEDIA_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'send_product_media',
    description: "Send the photos and videos of the given products to the customer over WhatsApp, alongside your text reply. Use the product ids from the catalog section.",
    parameters: {
      type: 'object',
      properties: {
        product_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Catalog product ids whose photos/videos should be sent.',
        },
      },
      required: ['product_ids'],
    },
  },
};

const SEND_LIST_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'send_category_list',
    description: "Send the customer a tappable WhatsApp list of product categories so they can pick one. When they tap a category, its products are shown automatically. Use when they want to browse or aren't sure what they want.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
};

const SEND_PRODUCT_LIST_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'send_product_list',
    description: "Send the customer a tappable WhatsApp list of specific products so they can pick one. When they tap a product, its photos, name and full details are sent automatically. Use when you want to offer a few relevant products to choose from. Use product ids from the catalog section.",
    parameters: {
      type: 'object',
      properties: {
        product_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Catalog product ids to offer as a tappable list.',
        },
      },
      required: ['product_ids'],
    },
  },
};

const SEND_TEMPLATE_DRAFT_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'send_template_draft',
    description: "Send a saved WhatsApp template (a 'template draft') to the customer. Use only when the situation matches the template's 'Send when' note.",
    parameters: {
      type: 'object',
      properties: { draft_id: { type: 'string', description: 'The template draft id from the list.' } },
      required: ['draft_id'],
    },
  },
};

const SEND_CUSTOM_MESSAGE_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'send_custom_message',
    description: "Send a saved custom message (option list, reply buttons, text, or media) to the customer — e.g. to ask them to pick from options. Use only ids from the custom messages list.",
    parameters: {
      type: 'object',
      properties: { custom_message_id: { type: 'string', description: 'The custom message id from the list.' } },
      required: ['custom_message_id'],
    },
  },
};

/** Build a WhatsApp list from the inventory categories, with their images.
 *  Row ids use the `cmopt:category:<id>` scheme so a tap drills deterministically
 *  into that category's products (handled by handleCustomOptionPick — no LLM call). */
function buildCategoryList(categories: AgentCategory[]): AgentListOut | undefined {
  const rows = categories.slice(0, 10).map(c => ({
    id: `cmopt:category:${c.id}`,
    title: c.name.slice(0, 24),
    description: c.description?.slice(0, 72) || undefined,
  }));
  if (rows.length === 0) return undefined;
  // Category images are sent as photos before the list (caption = category name).
  const media: AgentMediaOut[] = categories
    .filter(c => c.imageUrl || c.imageAssetId)
    .slice(0, 10)
    .map(c => ({
      type: 'image' as const,
      url: c.imageUrl ?? undefined,
      assetId: c.imageAssetId ?? undefined,
      caption: c.name,
    }));
  return {
    body: 'Which category would you like to explore? Tap one below 👇',
    button: 'View categories',
    sections: [{ title: 'Our collections', rows }],
    media: media.length ? media : undefined,
  };
}

/** Build a tappable WhatsApp list of specific products. Row ids use the
 *  `cmopt:product:<id>` scheme, so tapping a product sends its images + name +
 *  full details (handled by handleCustomOptionPick — no LLM call). */
function buildProductList(products: ProductRow[], ids: string[]): AgentListOut | undefined {
  const byId = new Map(products.map(p => [p.id, p]));
  const rows = ids
    .map(id => byId.get(id))
    .filter((p): p is ProductRow => !!p)
    .slice(0, 10)
    .map(p => ({
      id: `cmopt:product:${p.id}`,
      title: p.name.slice(0, 24),
      description: p.priceRange ?? undefined,
    }));
  if (rows.length === 0) return undefined;
  return {
    body: 'Here are some options — tap one to see its photos and details 👇',
    button: 'View products',
    sections: [{ title: 'Products', rows }],
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runAgent(
  userMessage: string,
  history: AgentMessage[] = [],
  opts: { focusProductId?: string } = {},
): Promise<AgentResult> {
  const { focusProductId } = opts;
  if (!focusProductId && !isMeaningful(userMessage)) return { reply: '', media: [], shouldRespond: false };

  const { settingsPrompt, agentName, products, categories, catalogContext, draftsContext, templateDraftsContext, templateDrafts, customMessages, customMessagesContext } =
    await getContextData(userMessage, focusProductId);

  // A product tap arrives with no typed text — turn it into an instruction so the
  // AI presents the product conversationally (warm description + a follow-up question).
  let effectiveMessage = userMessage;
  if (focusProductId) {
    const fp = products.find(p => p.id === focusProductId);
    const nm = fp?.name ?? 'this product';
    if (!userMessage?.trim()) {
      effectiveMessage = `The customer just tapped to see "${nm}". Send its photos and tell them about it warmly and naturally, then ask a friendly follow-up question (offer to show other options, give a recommendation, or help them place the order).`;
    }
  }

  const systemPrompt = buildSystemPrompt(agentName, catalogContext, draftsContext, templateDraftsContext, customMessagesContext, settingsPrompt, categories);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: effectiveMessage },
  ];

  try {
    const response = await openai.chat.completions.create({
      model:       'gpt-4o-mini',
      messages,
      max_tokens:  400,
      temperature: 0.85,
      tools:       [SEND_MEDIA_TOOL, SEND_LIST_TOOL, SEND_PRODUCT_LIST_TOOL, SEND_TEMPLATE_DRAFT_TOOL, SEND_CUSTOM_MESSAGE_TOOL],
      tool_choice: 'auto',
    });

    const choice = response.choices[0]?.message;
    const reply  = choice?.content?.trim() ?? '';

    // Gather product ids, a list request, a template draft, and a custom message to send.
    const ids: string[] = [];
    const listProductIds: string[] = [];
    let wantsList = false;
    let draftId: string | undefined;
    let customId: string | undefined;
    for (const tc of choice?.tool_calls ?? []) {
      if (tc.type !== 'function') continue;
      if (tc.function.name === 'send_category_list') { wantsList = true; continue; }
      if (tc.function.name === 'send_product_list') {
        try {
          const args = JSON.parse(tc.function.arguments || '{}');
          if (Array.isArray(args.product_ids)) listProductIds.push(...args.product_ids.map(String));
        } catch { /* ignore malformed args */ }
        continue;
      }
      if (tc.function.name === 'send_template_draft') {
        try { draftId = String(JSON.parse(tc.function.arguments || '{}').draft_id || ''); } catch { /* ignore */ }
        continue;
      }
      if (tc.function.name === 'send_custom_message') {
        try { customId = String(JSON.parse(tc.function.arguments || '{}').custom_message_id || ''); } catch { /* ignore */ }
        continue;
      }
      if (tc.function.name !== 'send_product_media') continue;
      try {
        const args = JSON.parse(tc.function.arguments || '{}');
        if (Array.isArray(args.product_ids)) ids.push(...args.product_ids.map(String));
      } catch { /* ignore malformed args */ }
    }
    // Always include the tapped product's photos, even if the model forgot the tool.
    if (focusProductId && !ids.includes(focusProductId)) ids.unshift(focusProductId);
    const media = collectMedia(products, ids);
    // A specific product list wins over a category list when the model asks for both.
    const list  = listProductIds.length
      ? buildProductList(products, listProductIds)
      : (wantsList ? buildCategoryList(categories) : undefined);

    let template: AgentTemplateOut | undefined;
    if (draftId) {
      const d = templateDrafts.find(x => x.id === draftId);
      if (d) {
        template = { name: d.templateName, language: d.language, config: d.config };
      }
    }

    const customMessage = customId ? customMessages.find(x => x.id === customId) : undefined;

    return { reply, media, list, template, customMessage, shouldRespond: reply.length > 0 || media.length > 0 || !!list || !!template || !!customMessage };
  } catch (err) {
    console.error('[agent] OpenAI error:', err instanceof Error ? err.message : err);
    return { reply: '', media: [], shouldRespond: false };
  }
}
