import OpenAI from 'openai';
import type { ManagerStoredMessage, PendingAction } from '@/lib/manager-store';
import {
  executeRead, executeWrite, summarizeWrite, touchedInventory,
  syncInventoryEmbeddings, WRITE_TOOL_NAMES, CARD_TOOL_NAMES, buildCards,
} from '@/lib/manager-tools';

import { MANAGER_MODEL as MODEL } from '@/lib/manager-model';
import type { StoredToolCall } from '@/lib/manager-store';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API });

/* ── System prompt ─────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `
You are the Manager — the AI business assistant for Nibirapon, a premium Indian saree brand by FemFashion.
You help the shop owner (admin) run the WhatsApp business: managing the product inventory, categories and
variants, building message flows, tuning the customer-facing sales agent, and reading analytics to advise on growth.

## How you work
- Be concise, warm and practical. Use the read tools to ground yourself in the real data before answering or acting.
- When the owner asks to SEE, SHOW or PREVIEW products/categories or their images, call display_products / display_categories.
  These render real image cards (the photos live in the database) directly in the chat — so never say you "can't show images";
  call the display tool instead. After it, add a short sentence (don't re-list every field the card already shows).
- You CANNOT see image pixels. When the owner attaches media, each item comes with a written description in an
  "[Attached media]" block, formatted as "- img:<id> — <description>" for photos and "- vid:<id> — <description>" for
  videos. Use those descriptions to decide which media belongs to which product/category, and pass the matching tokens
  VERBATIM (keep the img:/vid: prefix) in the tool's imageRefs field — the prefix tells the system to store it as a photo or video.
- A single message may describe MANY products, categories, variants and several images at once. Parse it fully and
  plan all the create_* calls needed, assigning each image to the right product by its description.

## Acting (IMPORTANT — confirm first)
- Any change that writes to the database (create_/update_ tools) is NOT applied immediately. When you call them,
  the system stages them and shows the owner a confirmation card; they approve or cancel. So: gather what you need
  with read tools, then call all the needed write tools in ONE turn. Do not ask "should I proceed?" in text —
  calling the write tools IS the proposal. Add a short sentence summarising what you're about to create.
- **Existing categories: do NOT call create_category.** If the owner names a category that already exists (e.g. "the existing Cotton Sarees category"), just set categoryName on each product/variant — the system links it automatically. Only call create_category for a genuinely NEW category. (Calling list_categories first tells you what already exists.)
- **"Variants of each other"** (the same item in different colours/sizes): pick ONE as the BASE — create it with create_product — and create the others as create_variant whose parentName is EXACTLY that base product's name. Do NOT make them variants of some old/unrelated product, and do NOT reference a parent that isn't in this batch or in list_products.
- Before referencing an EXISTING product as a variant parent, call list_products to confirm it exists and copy its exact name.
- If a create_variant fails with parent_not_found, it means the parent doesn't exist — create the base product first (create_product) in the same plan, then the variants under it; never give up and pile every image onto one product.
- **Bulk adds — group intelligently and emit EVERYTHING in ONE turn.** When the owner adds several products/images at once:
  1. Detect which products share a category and create ONE category per distinct group (create_category once per group), then put each product in it via categoryName. A single prompt may contain MULTIPLE categories (e.g. Tissue Sarees AND Cotton Sarees) — produce all of them.
  2. Detect variants: when items are really the SAME product differing only by colour / size / length / etc., create the base product once and add the rest as create_variant of it (with variantAttributes).
  3. **Never collapse several distinct products into one.** If the owner describes/uploads N different sarees, create N items (as products and/or variants) — do NOT create a single product and pile every image onto it.
  4. **Make ALL the create_ calls in the SAME assistant turn** (one create_category per group + every create_product + every create_variant). Do not do them one at a time across turns, and never write "I'll add the rest next" — actually call the tools now.
  5. **Image → item assignment.** Match each image to its item using the image's description and put the matching img:/vid: tokens in that item's imageRefs. If you are NOT confident which product/variant an image belongs to (e.g. several products under one category and the descriptions are similar), LEAVE that image OUT of every imageRefs — it will appear in the owner's "Unassigned images" mapper so THEY decide. Briefly say which images you left for them to place. Only auto-assign images you can match confidently.
  The owner sees an interactive grouping (Category → Products → Variants with images) and can re-map any image before approving.

## Persistence — keep going until the goal is met (work like an autonomous coding agent)
- Do NOT stop after a partial step. After the owner approves a batch, the system automatically lets you continue: re-check the result with read tools (e.g. list_products) against what the owner asked for, and if anything is still missing or wrong, make the remaining create_/update_ calls. Only finish (a plain summary with no tool calls) once the ENTIRE request is satisfied.
- Never end a turn by describing an action you intend to take ("Now I'll add the variant…") without calling its tool in that same turn. Either call the tool, or ask a genuine clarifying question, or give the final summary.
- For flows: WhatsApp requires an approved template to START a flow. Use list_templates first; make the first step
  a template when possible, then text/delay steps. Flows are saved as drafts for the owner to review and launch.
- For analytics questions, read get_analytics and give specific, numbers-backed suggestions. No confirmation needed.

## Formatting & interactivity
- Format replies in markdown: use **bold** for labels/names, bullet lists for multiple items, and short paragraphs.
  When listing products/categories/analytics, prefer a clean bulleted layout over long sentences.
- When useful, END your message with ONE line of 2–4 tappable follow-ups the owner is likely to want next,
  formatted EXACTLY as: ::suggestions:: First option | Second option | Third option
  Keep each under ~5 words and phrase them as things the owner would say (e.g. "Add another product", "Show me images",
  "Make it a variant"). Omit the line when there's no sensible next step.

## Defaults
- New products/categories default to being visible to the sales agent (inAgentContext = true).
`.trim();

/* ── Tool schemas ──────────────────────────────────────────────────────────── */

const READ_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  { type: 'function', function: { name: 'list_categories', description: 'List all product categories.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'list_products', description: 'List products (optionally filter by a query over name/category/fabric).', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: [] } } },
  { type: 'function', function: { name: 'get_analytics', description: 'Get business analytics for a time range.', parameters: { type: 'object', properties: { range: { type: 'string', enum: ['7d', '30d', '90d'] } }, required: [] } } },
  { type: 'function', function: { name: 'get_agent_settings', description: "Get the customer-facing sales agent's name and system prompt.", parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'list_flows', description: 'List existing WhatsApp flows.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'list_templates', description: 'List APPROVED WhatsApp message templates (for building flows).', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: {
    name: 'display_products',
    description: "Show the owner rich product cards WITH their real images (pulled from the database) inline in the chat. Use this whenever they ask to see/show/preview products or images. Pass the product ids (from list_products); omit to show all.",
    parameters: { type: 'object', properties: { productIds: { type: 'array', items: { type: 'string' } } }, required: [] } } },
  { type: 'function', function: {
    name: 'display_categories',
    description: 'Show the owner category cards with their images inline in the chat. Pass category ids/names; omit to show all.',
    parameters: { type: 'object', properties: { categoryIds: { type: 'array', items: { type: 'string' } } }, required: [] } } },
];

const imageRefs = { type: 'array', items: { type: 'string' }, description: 'image "img:<id>" tokens from the attached-images block that belong to this item' } as const;

const WRITE_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  { type: 'function', function: {
    name: 'create_category', description: 'Create a product category.',
    parameters: { type: 'object', properties: {
      name: { type: 'string' }, description: { type: 'string' }, imageRefs,
      inAgentContext: { type: 'boolean' },
    }, required: ['name'] } } },
  { type: 'function', function: {
    name: 'create_product', description: 'Create a product. Reference its category by name.',
    parameters: { type: 'object', properties: {
      name: { type: 'string' }, description: { type: 'string' }, priceRange: { type: 'string' },
      categoryName: { type: 'string' }, fabric: { type: 'string' }, occasions: { type: 'string' },
      customInfo: { type: 'string', description: 'extra notes only the sales agent should know' },
      imageRefs, inAgentContext: { type: 'boolean' },
    }, required: ['name'] } } },
  { type: 'function', function: {
    name: 'create_variant', description: 'Create a variant of an existing product (reference the parent by name). Describe how it differs via variantAttributes.',
    parameters: { type: 'object', properties: {
      parentName: { type: 'string' }, name: { type: 'string' }, priceRange: { type: 'string' },
      variantAttributes: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } },
      description: { type: 'string' }, fabric: { type: 'string' }, occasions: { type: 'string' }, customInfo: { type: 'string' },
      imageRefs,
    }, required: ['parentName', 'name', 'variantAttributes'] } } },
  { type: 'function', function: {
    name: 'update_product', description: 'Update an existing product (find by productId or name).',
    parameters: { type: 'object', properties: {
      productId: { type: 'string' }, name: { type: 'string', description: 'current name to find it by' },
      newName: { type: 'string' }, description: { type: 'string' }, priceRange: { type: 'string' },
      categoryName: { type: 'string' }, fabric: { type: 'string' }, occasions: { type: 'string' },
      customInfo: { type: 'string' }, imageRefs, inAgentContext: { type: 'boolean' },
    }, required: [] } } },
  { type: 'function', function: {
    name: 'update_category', description: 'Update an existing category (find by name or categoryId).',
    parameters: { type: 'object', properties: {
      categoryId: { type: 'string' }, name: { type: 'string', description: 'current name to find it by' },
      newName: { type: 'string' }, description: { type: 'string' }, imageRefs, inAgentContext: { type: 'boolean' },
    }, required: [] } } },
  { type: 'function', function: {
    name: 'create_flow', description: 'Create a WhatsApp flow draft from an ordered list of steps.',
    parameters: { type: 'object', properties: {
      name: { type: 'string' },
      steps: { type: 'array', items: { type: 'object', properties: {
        kind: { type: 'string', enum: ['template', 'text', 'delay'] },
        templateName: { type: 'string', description: 'for kind=template' },
        name: { type: 'string', description: 'for kind=text: short label' },
        content: { type: 'string', description: 'for kind=text: the message body' },
        seconds: { type: 'number', description: 'for kind=delay: wait time before the next step' },
      }, required: ['kind'] } },
    }, required: ['name', 'steps'] } } },
  { type: 'function', function: {
    name: 'update_agent_settings', description: "Update the customer-facing sales agent's name and/or system prompt.",
    parameters: { type: 'object', properties: { agentName: { type: 'string' }, systemPrompt: { type: 'string' } }, required: [] } } },
  { type: 'function', function: {
    name: 'create_agent_draft', description: 'Add a pre-written message the sales agent can send verbatim.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' }, triggerHint: { type: 'string', description: 'when the agent should send it' } }, required: ['name', 'content'] } } },
];

const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

/* ── Stored ↔ OpenAI message conversion ────────────────────────────────────── */

function toOpenAI(messages: ManagerStoredMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const m of messages) {
    if (m.role === 'user') {
      let content = m.content ?? '';
      if (m.images?.length) {
        content += '\n\n[Attached media]\n' + m.images
          .map(i => `- ${i.type === 'video' ? 'vid' : 'img'}:${i.assetId} — ${i.description || '(no description)'}`)
          .join('\n');
      }
      out.push({ role: 'user', content });
    } else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: m.content ?? '',
        ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}),
      } as OpenAI.Chat.ChatCompletionMessageParam);
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.tool_call_id!, content: m.content ?? '' });
    }
  }
  return out;
}

const now = () => new Date();

/** A token streamed back to the client as the assistant types. */
export type OnDelta = (text: string) => void;

/**
 * Stream one model completion: forwards content tokens via onDelta and
 * reconstructs any tool calls from the streamed deltas.
 */
async function streamCompletion(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  toolChoice: 'auto' | 'none',
  onDelta?: OnDelta,
): Promise<{ content: string; toolCalls: StoredToolCall[] }> {
  const stream = await openai.chat.completions.create({
    model: MODEL, temperature: 0.4, max_tokens: 1200,
    messages, tools: ALL_TOOLS, tool_choice: toolChoice, stream: true,
  });

  let content = '';
  const acc: Record<number, { id: string; name: string; args: string }> = {};
  for await (const chunk of stream) {
    const d = chunk.choices[0]?.delta;
    if (!d) continue;
    if (d.content) { content += d.content; onDelta?.(d.content); }
    for (const call of d.tool_calls ?? []) {
      const i = call.index ?? 0;
      acc[i] ??= { id: '', name: '', args: '' };
      if (call.id) acc[i].id = call.id;
      if (call.function?.name) acc[i].name += call.function.name;
      if (call.function?.arguments) acc[i].args += call.function.arguments;
    }
  }

  const toolCalls = Object.values(acc)
    .filter(t => t.name)
    .map(t => ({ id: t.id, type: 'function' as const, function: { name: t.name, arguments: t.args } }));
  return { content: content.trim(), toolCalls };
}

/* ── Main turn: run reads until done, or stage writes for confirmation ──────── */

export async function runChatTurn(history: ManagerStoredMessage[], onDelta?: OnDelta): Promise<{ appended: ManagerStoredMessage[]; pending: PendingAction[] }> {
  const appended: ManagerStoredMessage[] = [];
  const working = [...history];

  for (let iter = 0; iter < 6; iter++) {
    const { content: text, toolCalls } = await streamCompletion(toOpenAI(working), 'auto', onDelta);

    // No tool calls → final assistant message.
    if (toolCalls.length === 0) {
      const msg: ManagerStoredMessage = { role: 'assistant', content: text, createdAt: now() };
      appended.push(msg); working.push(msg);
      return { appended, pending: [] };
    }

    // Record the assistant turn (with its tool calls).
    const assistantMsg: ManagerStoredMessage = {
      role: 'assistant', content: text || null, hidden: !text,
      tool_calls: toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } })),
      createdAt: now(),
    };
    appended.push(assistantMsg); working.push(assistantMsg);

    const reads = toolCalls.filter(tc => !WRITE_TOOL_NAMES.has(tc.function.name));
    const writes = toolCalls.filter(tc => WRITE_TOOL_NAMES.has(tc.function.name));

    // Execute read tools immediately and feed results back. Display tools also
    // attach rich cards (rendered in the UI from the tool result message).
    for (const tc of reads) {
      const args = (() => { try { return JSON.parse(tc.function.arguments || '{}'); } catch { return {}; } })();
      const toolMsg: ManagerStoredMessage = { role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: '', hidden: true, createdAt: now() };
      try {
        if (CARD_TOOL_NAMES.has(tc.function.name)) {
          const { content, cards } = await buildCards(tc.function.name, args);
          toolMsg.content = content;
          if (cards.length) toolMsg.cards = cards;
        } else {
          toolMsg.content = await executeRead(tc.function.name, args);
        }
      } catch (e) {
        toolMsg.content = JSON.stringify({ error: e instanceof Error ? e.message : 'read failed' });
      }
      appended.push(toolMsg); working.push(toolMsg);
    }

    // Any write tools → stage as pending and stop (await owner approval).
    if (writes.length > 0) {
      const pending: PendingAction[] = writes.map(tc => {
        let args: Record<string, any> = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }
        return { toolCallId: tc.id, name: tc.function.name, args, summary: summarizeWrite(tc.function.name, args) };
      });
      return { appended, pending };
    }
    // else: only reads this turn → loop again so the model can use the results.
  }

  // Safety valve: too many tool iterations.
  const msg: ManagerStoredMessage = { role: 'assistant', content: 'I ran into a loop gathering data — could you rephrase what you need?', createdAt: now() };
  appended.push(msg);
  return { appended, pending: [] };
}

/* ── Apply (or cancel) staged write actions ─────────────────────────────────── */

export async function applyPending(
  history: ManagerStoredMessage[],
  pending: PendingAction[],
  approve: boolean,
  onDelta?: OnDelta,
  // Owner edits from the interactive plan: per-action image reassignment (raw asset ids).
  imageAssignments?: Record<string, string[]>,
  // Owner field edits from the plan (name/price/attributes/category…), merged over the action args.
  actionEdits?: Record<string, Record<string, any>>,
): Promise<{ appended: ManagerStoredMessage[]; pending: PendingAction[] }> {
  const appended: ManagerStoredMessage[] = [];
  const executedNames: string[] = [];

  // Execute in dependency order: categories → products → variants, so a base
  // product exists before its variants reference it (stable within each group).
  const rank: Record<string, number> = { create_category: 0, update_category: 1, create_product: 2, update_product: 3, create_variant: 4 };
  const ordered = approve ? [...pending].sort((a, b) => (rank[a.name] ?? 9) - (rank[b.name] ?? 9)) : pending;

  // Products created in THIS batch, so variants can resolve their parent by name
  // even if the base was just created (and even if the owner renamed it).
  const createdByName = new Map<string, string>();

  for (const action of ordered) {
    let content: string;
    if (!approve) {
      content = 'The owner cancelled this action; it was not applied.';
    } else {
      // Merge the owner's plan edits (fields) and image reassignment over the staged args.
      let args: Record<string, any> = { ...action.args };
      if (actionEdits && actionEdits[action.toolCallId]) args = { ...args, ...actionEdits[action.toolCallId] };
      if (imageAssignments && imageAssignments[action.toolCallId] !== undefined) args.imageRefs = imageAssignments[action.toolCallId];

      // Resolve a variant's parent against products created earlier in this batch.
      if (action.name === 'create_variant') {
        const pn = String(args.parentName ?? '').trim().toLowerCase();
        if (pn && createdByName.has(pn)) args.parentId = createdByName.get(pn);
      }

      const result = await executeWrite(action.name, args);
      executedNames.push(action.name);
      if (result.ok && result.detail && action.name === 'create_product') {
        createdByName.set(String(args.name ?? '').trim().toLowerCase(), result.detail);
      }
      content = JSON.stringify(result);
    }
    appended.push({ role: 'tool', tool_call_id: action.toolCallId, name: action.name, content, hidden: true, createdAt: now() });
  }

  // Re-embed inventory if products changed, so the sales agent can find them.
  if (approve && touchedInventory(executedNames)) {
    await syncInventoryEmbeddings().catch(() => {});
  }

  if (!approve) {
    // Cancelled: brief acknowledgement, don't keep working.
    try {
      const { content } = await streamCompletion(toOpenAI([...history, ...appended]), 'none', onDelta);
      appended.push({ role: 'assistant', content: content || 'Okay, I cancelled that.', createdAt: now() });
    } catch {
      appended.push({ role: 'assistant', content: 'Okay, I cancelled that.', createdAt: now() });
    }
    return { appended, pending: [] };
  }

  // Approved → re-enter the agent loop so it can VERIFY the result against the
  // request and keep working (create remaining items, fix gaps, or finish with a
  // summary). This is what makes the manager persist until the goal is done
  // instead of narrating "I'll do X next" and stopping.
  const cont = await runChatTurn([...history, ...appended], onDelta);
  return { appended: [...appended, ...cont.appended], pending: cont.pending };
}
