import OpenAI from 'openai';
import { db } from '@/db';
import { agentSettings, catalogProducts, agentDrafts } from '@/db/schema';
import { eq, isNotNull } from 'drizzle-orm';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API });

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentMessage { role: 'user' | 'assistant'; content: string; }
export interface AgentResult  { reply: string; shouldRespond: boolean; }

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

async function searchCatalog(query: string, topN = 4): Promise<string> {
  // Fetch all synced products (those with an embedding)
  const synced = await db
    .select()
    .from(catalogProducts)
    .where(
      // Only return active products that have been synced
      isNotNull(catalogProducts.embedding)
    );

  if (synced.length === 0) return '';

  // Embed the user query
  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const queryVec = embRes.data[0].embedding;

  // Rank by cosine similarity
  const scored = synced
    .filter(p => Array.isArray(p.embedding) && p.embedding.length > 0)
    .map(p => ({
      p,
      score: cosineSimilarity(queryVec, p.embedding as number[]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  if (scored.length === 0) return '';

  const lines = scored.map(({ p }) => {
    const parts = [
      `• ${p.name}`,
      p.category    && `(${p.category})`,
      p.priceRange  && `— ${p.priceRange}`,
      p.fabric      && `| Fabric: ${p.fabric}`,
      p.occasions   && `| For: ${p.occasions}`,
      p.description && `\n  ${p.description}`,
    ].filter(Boolean);
    return parts.join(' ');
  });

  return `## Relevant products from our catalog:\n${lines.join('\n')}`;
}

// ── Fetch agent settings + drafts ────────────────────────────────────────────

async function getContextData(userMessage: string): Promise<{
  settingsPrompt: string;
  agentName: string;
  catalogContext: string;
  draftsContext: string;
}> {
  const [settingsRow, drafts, catalogCtx] = await Promise.all([
    db.select().from(agentSettings).limit(1).then(r => r[0]),
    db.select().from(agentDrafts).where(eq(agentDrafts.isActive, true)),
    searchCatalog(userMessage).catch(() => ''),
  ]);

  const agentName     = settingsRow?.agentName    ?? 'Riya';
  const settingsPrompt = settingsRow?.systemPrompt ?? '';

  let draftsContext = '';
  if (drafts.length > 0) {
    const list = drafts
      .map(d => `### ${d.name}${d.triggerHint ? ` (send ${d.triggerHint})` : ''}\n${d.content}`)
      .join('\n\n');
    draftsContext = `## Pre-written messages you can send verbatim:\n${list}`;
  }

  return { settingsPrompt, agentName, catalogContext: catalogCtx, draftsContext };
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

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runAgent(
  userMessage: string,
  history: AgentMessage[] = [],
): Promise<AgentResult> {
  if (!isMeaningful(userMessage)) return { reply: '', shouldRespond: false };

  const { settingsPrompt, agentName, catalogContext, draftsContext } =
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
    });

    const reply = response.choices[0]?.message?.content?.trim() ?? '';
    return { reply, shouldRespond: reply.length > 0 };
  } catch (err: any) {
    console.error('[agent] OpenAI error:', err.message);
    return { reply: '', shouldRespond: false };
  }
}
