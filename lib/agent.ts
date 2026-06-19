import OpenAI from 'openai';
import { db } from '@/db';
import { agentSettings, catalogProducts, categories as categoriesTable, type ProductMedia } from '@/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { agentDraftsColl, templateMessagesColl, toObjectId, getTemplateAgentMetaMap } from '@/lib/template-store';
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
  description: string | null;
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
  const products = await db
    .select()
    .from(catalogProducts)
    .where(and(
      eq(catalogProducts.inAgentContext, true),
      eq(catalogProducts.isActive, true),
    ));

  if (products.length === 0) return [];

  // Embed the query (best-effort — tag matching still works if this fails).
  let queryVec: number[] | null = null;
  try {
    const embRes = await openai.embeddings.create({ model: 'text-embedding-3-small', input: query });
    queryVec = embRes.data[0].embedding;
  } catch { queryVec = null; }

  const q = query.toLowerCase();
  const scored = products.map(p => {
    const emb = Array.isArray(p.embedding) ? (p.embedding as number[]) : null;
    let score = queryVec && emb && emb.length ? cosineSimilarity(queryVec, emb) : 0;
    // Boost products whose tag appears in the query (e.g. "silk" → every silk-tagged
    // product), so a broad request returns a mix across categories.
    const tags = (p.tags ?? []) as string[];
    if (tags.some(t => t && q.includes(t.toLowerCase()))) score += 0.25;
    return { p, score };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topN).map(s => s.p);
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

/** Hero/"push" products the owner wants the agent to actively recommend. Always
 *  pinned into context so Riya can weave them in. */
async function getFeaturedProducts(limit = 5): Promise<ProductRow[]> {
  return db
    .select()
    .from(catalogProducts)
    .where(and(
      eq(catalogProducts.featured, true),
      eq(catalogProducts.inAgentContext, true),
      eq(catalogProducts.isActive, true),
    ))
    .limit(limit);
}

/** Active, top-level products in a category — used to pin them when a category is picked. */
async function getCategoryProducts(categoryId: string, limit = 10): Promise<ProductRow[]> {
  return db
    .select()
    .from(catalogProducts)
    .where(and(
      eq(catalogProducts.categoryId, categoryId),
      eq(catalogProducts.isActive, true),
      isNull(catalogProducts.parentId),
    ))
    .limit(limit);
}

/** A category's display name by id. */
async function getCategoryName(categoryId: string): Promise<string | null> {
  const [c] = await db
    .select({ name: categoriesTable.name })
    .from(categoriesTable)
    .where(eq(categoriesTable.id, categoryId))
    .limit(1);
  return c?.name ?? null;
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
      p.featured    && `⭐ PUSH — the owner wants you to actively recommend this`,
      p.category    && `(${p.category})`,
      p.priceRange  && `— ${p.priceRange}`,
      p.fabric      && `| Fabric: ${p.fabric}`,
      ((p.tags ?? []) as string[]).length && `| Tags: ${((p.tags ?? []) as string[]).join(', ')}`,
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

async function getContextData(userMessage: string, focusProductId?: string, focusCategoryId?: string): Promise<{
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
      .where(and(eq(categoriesTable.inAgentContext, true), eq(categoriesTable.hidden, false)))
      .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name))
      .catch(() => [] as AgentCategory[]),
    customMessagesColl().then(c => c.find({ isActive: true }).sort({ updatedAt: -1 }).toArray()).catch(() => []),
  ]);

  // Pin the product/category the customer is asking about (e.g. tapped from a list)
  // so it's always in context, even if semantic search didn't surface it.
  let pinnedProducts = products;
  if (focusProductId && !products.some(p => p.id === focusProductId)) {
    const focused = await getProductById(focusProductId);
    if (focused) pinnedProducts = [focused, ...products];
  }
  if (focusCategoryId) {
    const catProducts = await getCategoryProducts(focusCategoryId);
    const have = new Set(pinnedProducts.map(p => p.id));
    const add = catProducts.filter(p => !have.has(p.id));
    if (add.length) pinnedProducts = [...add, ...pinnedProducts];
  }

  // Always pin the owner's hero/"push" products so Riya can recommend them.
  const featured = await getFeaturedProducts().catch(() => [] as ProductRow[]);
  if (featured.length) {
    const have = new Set(pinnedProducts.map(p => p.id));
    const add = featured.filter(p => !have.has(p.id));
    if (add.length) pinnedProducts = [...add, ...pinnedProducts];
  }

  const customMessages: CustomMessage[] = (customMsgDocs as any[]).map(serializeCustomMessage);
  let customMessagesContext = '';
  if (customMessages.length > 0) {
    const list = customMessages.map(m => {
      const opts = customMessageOptions(m);
      const head = `- [custom message id: ${m.id}] "${m.name}" (${m.type})`;
      const about = m.agentDescription ? `\n    What it's for: ${m.agentDescription}` : '';
      const when  = m.triggerHint      ? `\n    Send when: ${m.triggerHint}`       : '';
      const preview = renderCustomPreview(m).split('\n').map(l => `    ${l}`).join('\n');
      const optLine = opts.length ? `\n    Options: ${opts.join(' | ')}` : '';
      return `${head}${about}${when}\n${preview}${optLine}`;
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
  const msgsById = new Map<string, { templateName: string; language: string; config: TemplateMessageConfig; preview: string; agentDescription?: string; whenToSend?: string }>();
  if (objIds.length > 0) {
    const msgs = await (await templateMessagesColl()).find({ _id: { $in: objIds } }).toArray().catch(() => []);
    for (const m of msgs) {
      msgsById.set(m._id.toString(), {
        templateName: m.templateName,
        language: m.language || 'en',
        config: (m.config ?? {}) as TemplateMessageConfig,
        preview: m.preview ?? '',
        agentDescription: m.agentDescription,
        whenToSend: m.whenToSend,
      });
    }
  }

  // Agent instructions attached to the raw WhatsApp template (by templateName) —
  // the lowest-precedence fallback, inherited by every message built from it.
  const tmplMetaMap = await getTemplateAgentMetaMap().catch(() => new Map());

  const templateDrafts: ResolvedTemplateDraft[] = tmplDraftDocs
    .map(d => {
      const m = msgsById.get(d.templateMessageId!);
      if (!m) return null;
      // Precedence: draft note → saved-message note → raw-template instruction.
      const meta = tmplMetaMap.get(m.templateName);
      return {
        id:           d._id.toString(),
        name:         d.name,
        triggerHint:  d.triggerHint ?? m.whenToSend ?? meta?.whenToSend ?? null,
        description:  d.description ?? m.agentDescription ?? meta?.agentDescription ?? null,
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
        const head = `- [template draft id: ${d.id}] "${d.name}" — sends the "${d.templateName}" template.`;
        const about = d.description ? `\n  What it's for: ${d.description}` : '';
        const when  = `\n  Send when: ${d.triggerHint || 'it fits the situation'}.`;
        const body = d.preview
          ? `\n  This template contains:\n${d.preview.split('\n').map(l => `    ${l}`).join('\n')}`
          : '';
        return head + about + when + body;
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
You are ${agentName}, the warm and friendly AI sales assistant for Nibirapon — a premium Indian saree brand by FemFashion. Think of yourself as a real, caring saree consultant who genuinely loves helping customers find their perfect drape.

## Greeting the customer (first message / "hi" / "hey" / "hello" / "namaste")
- When the customer greets you or opens the chat, ALWAYS reply with a warm, personal welcome — NEVER the off-topic refusal line.
- Introduce yourself by name, sound genuinely happy they're here, and gently invite them to explore. Add a friendly emoji or two (🌸, ✨, 🥻, 😊) — keep it natural, not over-the-top.
- Vary your wording each time so it never sounds robotic. Example tone (do NOT copy verbatim):
  "Hi! I'm ${agentName} from Nibirapon 🌸 So lovely to have you here! I'd be delighted to help you find a gorgeous saree. Are you shopping for a special occasion, or just browsing our latest collection? ✨"
- End the greeting with a warm, open follow-up question that invites them in (occasion, budget, favourite fabric, or an offer to show the new arrivals).

## Sales playbook — sell like a real, proactive saleswoman
You are not a passive FAQ bot. You actively guide the customer toward a purchase, the way a caring shop assistant would. Follow this flow, adapting naturally:
1. **Discover preference FIRST.** Before dumping products, find out what they want — occasion, category, colour, fabric or budget. Prefer a saved custom message that asks this (an option list / buttons — see "Custom messages" below, matched by its "What it's for" / "Send when"); otherwise call \`send_category_list\`. Ask, don't assume.
2. **Show the right thing for their pick.** When they choose/ask for a category, send the marketing template made for it (prefer a saved template draft — match by its "What it's for" / "Send when", NOT by the template name, which often doesn't describe the content). Only fall back to \`send_product_list\` when nothing saved fits.
3. **Recommend the hero products.** Products marked "⭐ PUSH" in the catalog are the ones the owner most wants to sell — weave them in naturally as your personal favourite / a bestseller when relevant. Recommend confidently, but stay honest and relevant to what they asked — never force an unrelated item.
4. **Always drive the lead forward.** After you send products, a list or a template, DON'T go silent or end flat. Add a warm, human follow-up that keeps them engaged and moves toward the order — e.g. share which colour or piece is your personal favourite and why, ask which one they're drawn to, ask their occasion/size, or nudge gently toward placing the order. Every reply ends with a question or a clear next step.
5. **Keep the conversation alive.** When the customer replies or taps something, treat it as a buying signal and continue — acknowledge warmly, then advance (suggest a pairing, offer a better option, answer and re-engage). Don't stall after they respond.

### Don't spam (important)
- It's good to send a couple of messages together (e.g. product photos THEN a warm recommendation + question) — that feels human. But never bombard: send one coherent, purposeful set per turn, not a stream of messages.
- Read the room. If the customer seems hesitant, says "just looking", "not now", or goes quiet, ease off — one gentle, low-pressure line, not repeated pushes. Never repeat the same nudge or re-send the same product. Be warm and helpful, never pushy or annoying.

## About Nibirapon & FemFashion
- Nibirapon is FemFashion's flagship label known for quality, elegance, and authenticity.
- We sell: Banarasi Silk, Kanjeevaram, Chanderi, Georgette, Linen, Cotton, Organza, Chiffon sarees.
- Price range: ₹1,500 (casual Cotton/Linen) → ₹50,000+ (Pure Silk Banarasi/Kanjivaram).
- Pan-India delivery; COD is not allowed on orders only pre-paid
.

## Rules
1. Reply in the SAME language the customer uses (Hindi / Hinglish / English).
2. Keep replies short, warm and conversational (2-4 sentences unless detail is asked). You are a real, friendly salesperson — NEVER just dump products, lists or photos with no words. Whenever something is sent to the customer (a photo, a list, product details), ALSO write a warm human sentence or two around it.
3. ALWAYS END YOUR REPLY WITH A FOLLOW-UP QUESTION that moves the chat forward — e.g. offer to show other options or colours, give a recommendation, ask their occasion/budget, or nudge toward placing the order. Never end on a flat statement; always invite the next step.
4. ALWAYS use the recent conversation above for context. The customer usually answers your previous question with a short message — e.g. "UPI", "COD", "card", a name, a phone number, a pincode, or an address like "New Delhi B3 17". These are part of the ongoing order conversation — accept and act on them. NEVER treat them as off-topic.
5. Stay focused on sarees, ethnic wear, and helping the customer buy. Greetings, pleasantries and small talk ("hey", "hi", "how are you", "thanks") are ALWAYS welcome — respond warmly, never with the refusal line. Only when the customer CLEARLY switches to a genuinely unrelated topic (weather, politics, coding, etc.) reply warmly while redirecting: "I'd love to help you with our beautiful sarees instead 😊 — what occasion are you shopping for?". When unsure, assume it IS related and keep helping — do not refuse.
si6. Never mention competitor brands.
7. When the customer asks ANYTHING about a product (look, colour, fabric, drape, border, blouse, fit, styling), ANSWER IT using that product's title, description and its 📷 photo descriptions in the catalog below. Those photo descriptions tell you what each picture shows — treat them as your own eyes. NEVER paste a photo description to the customer; they are internal notes only. If a detail truly isn't in the info you have, say so honestly.
8. When the customer wants to buy, guide them step by step: confirm which saree, then ask for the delivery address and payment method one at a time, and once you have them, share the payment details / next step.
9. Never ignore or reject a delivery address or payment method the customer gives you.
10. If a pre-written message in the DRAFTS section matches the situation (e.g. payment / UPI QR, shipping, returns), send it verbatim.

## Sending product photos
- ALWAYS write a warm, conversational text reply in your message content — describe the product in your own words and end with a follow-up question. Never send photos silently.
- When the customer is interested in, asks about, or would benefit from seeing specific product(s) listed in the catalog below, ALSO call the \`send_product_media\` tool with those products' ids. Their photos/videos are sent automatically, captioned with the product title + description — so you don't repeat the title/description verbatim; instead add a friendly human touch and a question.
- Only use ids that appear in the catalog section. Never invent ids. If no product is relevant, just reply with text and don't call the tool.
- When the customer asks for a BROAD type rather than one item (e.g. "silk", "cotton", "something festive"), the catalog below already holds a MIX of matching products (by their Tags). Offer a few of them — ideally as a \`send_product_list\` picker, or send 2-3 with \`send_product_media\` — spanning different options, not just one.

## PREFER YOUR SAVED CONTENT (important)
- Before building your own list or writing your own options message, ALWAYS look at the "Templates" and "Custom messages" sections below. If a saved template draft or custom message fits the situation, SEND THAT (call \`send_template_draft\` / \`send_custom_message\`) instead of composing your own. These are hand-crafted by the team and look better.
- Match by the template's "What it's for" / "Send when" notes and the custom message's purpose. Especially: when the customer picks/asks for a CATEGORY, prefer the marketing template made for that category's products. Only fall back to \`send_product_list\` (your own list) when no saved template or custom message fits that category.
- Only invent your own list/message when nothing pre-made fits or you genuinely need options that don't exist yet.

## Sending a category list
- When the customer wants to browse, asks "what do you have", asks to see categories, or is unsure what they want, call the \`send_category_list\` tool. The categories that have an image (marked 🖼️ below) are sent as photos first, then a tappable WhatsApp list so they can pick one. When they tap a category, you'll be asked to present that category — first try a matching saved marketing template / custom message, otherwise send its product list.
- Lean on these category visuals when helping a customer browse — they make your messages richer.
- Available categories: ${categoryLine}.

## Sending a product list
- When you want to offer a few specific products for the customer to choose between (e.g. they asked for "red silk sarees" and several fit) AND no saved template/custom message fits, call the \`send_product_list\` tool with those products' ids. The customer gets a tappable list; when they tap a product, its photos, name and full details are sent automatically.
- Prefer \`send_product_list\` (a tappable picker) when offering several products to choose from; use \`send_product_media\` when you just want to show one or two products' photos directly. Only use ids from the catalog section.

## Sending a saved template
- When the situation matches a template's "What it's for" / "Send when" notes below, call \`send_template_draft\` with that template draft's id. The full template is sent to the customer. Still write a short warm text reply too. Only use ids listed below.

## Sending a custom message
- When a saved custom message below fits — especially an options list or buttons to ask the customer to choose (e.g. a category, a size, yes/no) — call \`send_custom_message\` with its id. Still write a short warm text reply too. Only use ids listed below; never invent them.

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
  opts: { focusProductId?: string; focusCategoryId?: string } = {},
): Promise<AgentResult> {
  const { focusProductId, focusCategoryId } = opts;
  if (!focusProductId && !focusCategoryId && !isMeaningful(userMessage)) return { reply: '', media: [], shouldRespond: false };

  const { settingsPrompt, agentName, products, categories, catalogContext, draftsContext, templateDraftsContext, templateDrafts, customMessages, customMessagesContext } =
    await getContextData(userMessage, focusProductId, focusCategoryId);

  // A product / category tap arrives with no typed text — turn it into an instruction
  // so the AI responds conversationally (and prefers pre-made content where it fits).
  let effectiveMessage = userMessage;
  if (focusProductId && !userMessage?.trim()) {
    const fp = products.find(p => p.id === focusProductId);
    const nm = fp?.name ?? 'this product';
    effectiveMessage = `The customer just tapped to see "${nm}". Send its photos and tell them about it warmly and naturally, then ask a friendly follow-up question (offer to show other options, give a recommendation, or help them place the order).`;
  } else if (focusCategoryId && !userMessage?.trim()) {
    const catName = await getCategoryName(focusCategoryId);
    effectiveMessage = `The customer chose the "${catName ?? 'selected'}" category. FIRST check the Templates and Custom messages sections: if a marketing template or custom message is meant for this category, SEND THAT (prefer it over making your own). Otherwise show this category's products with send_product_list. Always add a warm intro line and end with a follow-up question.`;
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
    let list  = listProductIds.length
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

    // Category tap fallback: if the AI sent no template/custom message/list/media,
    // still show that category's products so the customer isn't left empty-handed.
    if (focusCategoryId && !list && !template && !customMessage && media.length === 0) {
      const catIds = products.filter(p => p.categoryId === focusCategoryId).map(p => p.id);
      list = buildProductList(products, catIds);
    }

    return { reply, media, list, template, customMessage, shouldRespond: reply.length > 0 || media.length > 0 || !!list || !!template || !!customMessage };
  } catch (err) {
    console.error('[agent] OpenAI error:', err instanceof Error ? err.message : err);
    return { reply: '', media: [], shouldRespond: false };
  }
}
