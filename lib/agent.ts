import OpenAI from 'openai';
import { db } from '@/db';
import { agentSettings, catalogProducts, agentDrafts, type ProductMedia } from '@/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API });

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentMessage { role: 'user' | 'assistant'; content: string; }
export interface AgentMediaOut { type: 'image' | 'video'; url?: string; assetId?: string; caption?: string; }
export interface AgentResult  { reply: string; media: AgentMediaOut[]; shouldRespond: boolean; }

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

async function getContextData(userMessage: string): Promise<{
  settingsPrompt: string;
  agentName: string;
  products: ProductRow[];
  catalogContext: string;
  draftsContext: string;
}> {
  const [settingsRow, drafts, products] = await Promise.all([
    db.select().from(agentSettings).limit(1).then(r => r[0]),
    db.select().from(agentDrafts).where(eq(agentDrafts.isActive, true)),
    getRelevantProducts(userMessage).catch(() => [] as ProductRow[]),
  ]);

  const agentName      = settingsRow?.agentName    ?? 'Riya';
  const settingsPrompt = settingsRow?.systemPrompt ?? '';

  let draftsContext = '';
  if (drafts.length > 0) {
    const list = drafts
      .map(d => `### ${d.name}${d.triggerHint ? ` (send ${d.triggerHint})` : ''}\n${d.content}`)
      .join('\n\n');
    draftsContext = `## Pre-written messages you can send verbatim:\n${list}`;
  }

  return {
    settingsPrompt,
    agentName,
    products,
    catalogContext: formatCatalogContext(products),
    draftsContext,
  };
}

// ── Base system prompt ───────────────────────────────────────────────────────

function buildSystemPrompt(agentName: string, catalogCtx: string, draftsCtx: string, extra: string): string {
  return `
You are ${agentName}, the friendly AI sales assistant for Nibirapon — a premium Indian saree brand by FemFashion.

## About Nibirapon & FemFashion
- Nibirapon is FemFashion's flagship label known for quality, elegance, and authenticity.
- We sell: Banarasi Silk, Kanjeevaram, Chanderi, Georgette, Linen, Cotton, Organza, Chiffon sarees.
- Price range: ₹1,500 (casual Cotton/Linen) → ₹50,000+ (Pure Silk Banarasi/Kanjivaram).
- Pan-India delivery; COD available on most orders.

## Rules
1. Reply in the SAME language the customer uses (Hindi / Hinglish / English).
2. Keep replies short and conversational (2-4 sentences unless detail is asked).
3. ONLY discuss sarees, Indian ethnic wear, fabrics, styling, care, and Nibirapon products.
4. For unrelated topics say: "I can only help with sarees and Nibirapon products 😊"
5. Never mention competitor brands.
6. If you don't know a specific price or product, say so honestly.
7. When a customer seems ready to buy, gently guide them toward choosing.
8. If a pre-written message in the DRAFTS section matches the situation, send it verbatim.

## Sending product photos
- ALWAYS write a short text reply in your message content.
- When the customer is interested in, asks about, or would benefit from seeing specific product(s) listed in the catalog below, ALSO call the \`send_product_media\` tool with those products' ids. Their photos/videos will be sent to the customer automatically.
- Only use ids that appear in the catalog section. Never invent ids. If no product is relevant, just reply with text and don't call the tool.

${catalogCtx ? catalogCtx + '\n' : ''}
${draftsCtx  ? draftsCtx  + '\n' : ''}
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
    for (const m of (p.media ?? []) as ProductMedia[]) {
      if (!m.url && !m.assetId) continue;
      out.push({
        type:    m.type,
        url:     m.url,
        assetId: m.assetId,
        // Caption explains the photo; fall back to the product name.
        caption: m.description || p.name,
      });
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

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runAgent(
  userMessage: string,
  history: AgentMessage[] = [],
): Promise<AgentResult> {
  if (!isMeaningful(userMessage)) return { reply: '', media: [], shouldRespond: false };

  const { settingsPrompt, agentName, products, catalogContext, draftsContext } =
    await getContextData(userMessage);

  const systemPrompt = buildSystemPrompt(agentName, catalogContext, draftsContext, settingsPrompt);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await openai.chat.completions.create({
      model:       'gpt-4o-mini',
      messages,
      max_tokens:  400,
      temperature: 0.7,
      tools:       [SEND_MEDIA_TOOL],
      tool_choice: 'auto',
    });

    const choice = response.choices[0]?.message;
    const reply  = choice?.content?.trim() ?? '';

    // Gather any product ids the model asked to show.
    const ids: string[] = [];
    for (const tc of choice?.tool_calls ?? []) {
      if (tc.type !== 'function' || tc.function.name !== 'send_product_media') continue;
      try {
        const args = JSON.parse(tc.function.arguments || '{}');
        if (Array.isArray(args.product_ids)) ids.push(...args.product_ids.map(String));
      } catch { /* ignore malformed args */ }
    }
    const media = collectMedia(products, ids);

    return { reply, media, shouldRespond: reply.length > 0 || media.length > 0 };
  } catch (err) {
    console.error('[agent] OpenAI error:', err instanceof Error ? err.message : err);
    return { reply: '', media: [], shouldRespond: false };
  }
}
