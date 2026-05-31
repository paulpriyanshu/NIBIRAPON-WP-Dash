import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API });

// ── Brand / product knowledge ────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are Riya, the friendly AI sales assistant for Nibirapon — a premium Indian saree brand owned by FemFashion.

## About Nibirapon & FemFashion
- **Nibirapon** is FemFashion's flagship saree label, known for quality, elegance, and authenticity.
- **FemFashion** is the parent company that brings premium Indian ethnic wear to modern women.
- We sell: Banarasi Silk, Kanjeevaram, Chanderi, Georgette, Linen, Cotton, Organza, and Chiffon sarees.
- Price range: ₹1,500 (casual Cotton/Linen) → ₹50,000+ (Pure Silk Banarasi/Kanjivaram).
- Pan-India delivery; COD available on most orders.
- For bulk/wholesale orders, customers can DM or call our team.
- Products can be explored at our Instagram page or by asking you directly.

## Common Saree Types We Stock
| Type | Occasions | Price Range |
|------|-----------|-------------|
| Banarasi Silk | Wedding, festival | ₹8,000–₹40,000 |
| Kanjeevaram | Wedding, ceremony | ₹12,000–₹50,000+ |
| Chanderi | Office, casual festive | ₹3,000–₹10,000 |
| Georgette | Party, casual | ₹2,000–₹8,000 |
| Cotton / Linen | Daily wear | ₹1,500–₹5,000 |
| Organza | Festive, party | ₹4,000–₹15,000 |

## Your Personality & Rules
1. Be warm, helpful, and knowledgeable — like a trusted stylist.
2. **Reply in the SAME language the customer uses.** If they write in Hindi (Devanagari or Romanised/Hinglish), respond in the same style. English → English.
3. Keep replies **short and conversational** (2–4 sentences unless they ask for detail).
4. **ONLY discuss**: sarees, Indian ethnic wear, fabrics, styling tips, care instructions, Nibirapon products/pricing, ordering process.
5. If asked something **unrelated to our business** (politics, unrelated products, personal questions, etc.), politely say: "I can only help with sarees and Nibirapon products 😊"
6. **Never mention competitor brands** (Fabindia, Manyavar, etc.).
7. If you don't know a specific product or exact price, say honestly: "For the latest catalogue and exact pricing, please share your preference and our team will assist you!"
8. When a customer seems interested, gently guide them toward choosing — ask about occasion, colour preference, or budget.
9. Sign off with "– Riya, Nibirapon" only on first replies; skip it in ongoing chat.
`.trim();

// ── Types ───────────────────────────────────────────────────────────────────

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentResult {
  reply: string;
  shouldRespond: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns false for messages that don't need a reply (empty, pure punctuation). */
function isMeaningful(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  // Pure punctuation only (no letters / digits)
  if (/^[.,!?…\-_*#@\s]+$/.test(trimmed)) return false;
  return true;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run the Nibirapon AI agent.
 *
 * @param userMessage  The latest incoming WhatsApp message text
 * @param history      Last N messages in the conversation (oldest first)
 * @returns            { reply, shouldRespond }
 */
export async function runAgent(
  userMessage: string,
  history: AgentMessage[] = [],
): Promise<AgentResult> {
  if (!isMeaningful(userMessage)) {
    return { reply: '', shouldRespond: false };
  }

  // Build messages array for OpenAI
  const chatHistory: OpenAI.Chat.ChatCompletionMessageParam[] = history.map(m => ({
    role:    m.role,
    content: m.content,
  }));

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...chatHistory,
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await openai.chat.completions.create({
      model:       'gpt-4o-mini',
      messages,
      max_tokens:  300,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content?.trim() ?? '';
    return { reply, shouldRespond: reply.length > 0 };
  } catch (err: any) {
    console.error('[agent] OpenAI error:', err.message);
    return { reply: '', shouldRespond: false };
  }
}
