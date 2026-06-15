import { db } from '@/db';
import {
  catalogProducts, categories, agentSettings, templates,
  type ProductMedia, type VariantAttribute,
} from '@/db/schema';
import { eq, ilike, or } from 'drizzle-orm';
import { cleanVariantAttributes, categoryNameById } from '@/lib/inventory-write';
import { getAllCategories, getAllInventory } from '@/lib/queries/inventory';
import { syncInventoryEmbeddings } from '@/lib/embeddings';
import { getAnalytics } from '@/lib/analytics';
import { flowsColl } from '@/lib/flow-store';
import { agentDraftsColl } from '@/lib/template-store';
import type { Template } from '@/types';
import type { DisplayCard, CardImage } from '@/lib/manager-store';

/* ── Image refs → product media ──────────────────────────────────────────────
   The agent passes media refs from the message manifest, prefixed with the type:
   "img:<assetId>" for photos, "vid:<assetId>" for videos. Turn them into stored
   product media (preserving the type so videos are saved as videos). */
function refsToMedia(imageRefs: unknown): ProductMedia[] {
  if (!Array.isArray(imageRefs)) return [];
  return imageRefs
    .map(r => String(r).trim())
    .filter(Boolean)
    .map(tok => {
      const type: 'image' | 'video' = /^vid:/i.test(tok) ? 'video' : 'image';
      const assetId = tok.replace(/^(vid|img):/i, '').trim();
      return { type, assetId };
    })
    .filter(m => m.assetId);
}

/* ── Result shape ────────────────────────────────────────────────────────────── */
export interface WriteResult { ok: boolean; summary: string; detail?: string; error?: string }

/* ══════════════════════════════════════════════════════════════════════════════
   READ tools — execute immediately, return a JSON string for the model.
   ══════════════════════════════════════════════════════════════════════════════ */

export async function executeRead(name: string, args: Record<string, any>): Promise<string> {
  switch (name) {
    case 'list_categories': {
      const rows = await getAllCategories();
      return JSON.stringify(rows.map(c => ({
        id: c.id, name: c.name, description: c.description,
        hasImage: !!(c.imageAssetId || c.imageUrl), inAgentContext: c.inAgentContext,
      })));
    }
    case 'list_products': {
      const q = (args.query as string | undefined)?.trim();
      const rows = await getAllInventory();
      const filtered = q
        ? rows.filter(p => `${p.name} ${p.category ?? ''} ${p.fabric ?? ''}`.toLowerCase().includes(q.toLowerCase()))
        : rows;
      return JSON.stringify(filtered.slice(0, 60).map(p => ({
        id: p.id, name: p.name, category: p.category, priceRange: p.priceRange,
        parentId: p.parentId, variantAttributes: p.variantAttributes,
        mediaCount: (p.media ?? []).length, inAgentContext: p.inAgentContext,
      })));
    }
    case 'get_analytics': {
      const range = (args.range as string) || '30d';
      const a = await getAnalytics(range);
      // Trim to the signal the model needs for insights (skip per-row leads/contacts dumps).
      return JSON.stringify({ range, overview: a.overview, messagesOverTime: a.messagesOverTime, statusBreakdown: a.statusBreakdown });
    }
    case 'get_agent_settings': {
      const row = await db.select().from(agentSettings).limit(1).then(r => r[0]);
      return JSON.stringify({ agentName: row?.agentName ?? 'Riya', systemPrompt: row?.systemPrompt ?? '' });
    }
    case 'list_flows': {
      const coll = await flowsColl();
      const rows = await coll.find({}).sort({ updatedAt: -1 }).limit(40).toArray();
      return JSON.stringify(rows.map(f => ({ id: f._id.toString(), name: f.name, status: f.status ?? 'draft', nodeCount: (f.nodes ?? []).length })));
    }
    case 'list_templates': {
      const rows = await db.select().from(templates).where(eq(templates.status, 'APPROVED')).limit(60);
      return JSON.stringify(rows.map(t => {
        const comps = (t.components ?? []) as Template['components'];
        const body = comps.find(c => c.type === 'BODY')?.text ?? '';
        const buttons = comps.find(c => c.type === 'BUTTONS')?.buttons ?? [];
        return { name: t.name, language: t.language, category: t.category, body, quickReplies: buttons.filter(b => b.type === 'QUICK_REPLY').map(b => b.text) };
      }));
    }
    default:
      return JSON.stringify({ error: `Unknown read tool: ${name}` });
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   DISPLAY tools — fetch real data (incl. media URLs from the DB) and render it
   as rich, interactive cards in the chat. The model never invents image URLs.
   ══════════════════════════════════════════════════════════════════════════════ */

export const CARD_TOOL_NAMES = new Set(['display_products', 'display_categories']);

/** Turn stored product media into served URLs + type (R2 proxy or pasted URL). */
function mediaToCardImages(media: ProductMedia[] | undefined | null): CardImage[] {
  return (media ?? [])
    .map(m => ({ url: m.assetId ? `/api/inventory/media/${m.assetId}` : (m.url ?? ''), description: m.description, type: m.type }))
    .filter(i => i.url);
}

/** Build product/category cards for a display tool call. */
export async function buildCards(name: string, args: Record<string, any>): Promise<{ content: string; cards: DisplayCard[] }> {
  const wanted: string[] = Array.isArray(args.productIds) ? args.productIds.map(String)
    : Array.isArray(args.categoryIds) ? args.categoryIds.map(String)
    : Array.isArray(args.ids) ? args.ids.map(String) : [];

  if (name === 'display_categories') {
    const all = await getAllCategories();
    const pick = wanted.length ? all.filter(c => wanted.includes(c.id) || wanted.some(w => w.toLowerCase() === c.name.toLowerCase())) : all;
    const cards: DisplayCard[] = pick.map(c => ({
      kind: 'category', id: c.id, title: c.name, subtitle: 'Category',
      description: c.description,
      images: c.imageAssetId ? [{ url: `/api/inventory/media/${c.imageAssetId}` }] : (c.imageUrl ? [{ url: c.imageUrl }] : []),
    }));
    return { content: JSON.stringify({ shown: cards.length }), cards };
  }

  // display_products (default)
  const all = await getAllInventory();
  const pick = wanted.length
    ? all.filter(p => wanted.includes(p.id) || wanted.some(w => w.toLowerCase() === p.name.toLowerCase()))
    : all.slice(0, 12);
  const cards: DisplayCard[] = pick.map(p => ({
    kind: 'product', id: p.id, title: p.name,
    subtitle: p.category ?? undefined,
    price: p.priceRange,
    description: p.description,
    attributes: (p.variantAttributes ?? []) as VariantAttribute[],
    images: mediaToCardImages(p.media as ProductMedia[]),
  }));
  return { content: JSON.stringify({ shown: cards.length, withImages: cards.filter(c => c.images.length).length }), cards };
}

/* ══════════════════════════════════════════════════════════════════════════════
   WRITE tools — staged then executed on approval.
   ══════════════════════════════════════════════════════════════════════════════ */

/** Human-readable one-liner for a staged write action (shown in the proposal card). */
export function summarizeWrite(name: string, args: Record<string, any>): string {
  switch (name) {
    case 'create_category':
      return `Create category “${args.name}”${refsToMedia(args.imageRefs).length ? ' (with image)' : ''}`;
    case 'create_product': {
      const imgs = refsToMedia(args.imageRefs).length;
      return `Add product “${args.name}”${args.categoryName ? ` in ${args.categoryName}` : ''}${args.priceRange ? ` — ${args.priceRange}` : ''}${imgs ? ` · ${imgs} image${imgs !== 1 ? 's' : ''}` : ''}`;
    }
    case 'create_variant': {
      const attrs = Array.isArray(args.variantAttributes) ? args.variantAttributes.map((a: any) => `${a.label}: ${a.value}`).join(', ') : '';
      return `Add variant “${args.name}” of “${args.parentName}”${attrs ? ` (${attrs})` : ''}`;
    }
    case 'update_product':
      return `Update product “${args.name ?? args.productId}”`;
    case 'update_category':
      return `Update category “${args.name ?? args.categoryId}”`;
    case 'create_flow':
      return `Create flow draft “${args.name}” (${Array.isArray(args.steps) ? args.steps.length : 0} steps)`;
    case 'update_agent_settings':
      return `Update sales-agent settings${args.agentName ? ` (name: ${args.agentName})` : ''}`;
    case 'create_agent_draft':
      return `Add pre-written message “${args.name}”`;
    default:
      return `${name}(${JSON.stringify(args).slice(0, 80)})`;
  }
}

export const WRITE_TOOL_NAMES = new Set([
  'create_category', 'create_product', 'create_variant', 'update_product',
  'update_category', 'create_flow', 'update_agent_settings', 'create_agent_draft',
]);

/** Resolve a category by name (case-insensitive), returning its id, or null. */
async function categoryIdByName(name: string | undefined): Promise<string | null> {
  if (!name?.trim()) return null;
  const row = await db.select({ id: categories.id }).from(categories)
    .where(ilike(categories.name, name.trim())).limit(1).then(r => r[0]);
  return row?.id ?? null;
}

/** Resolve a product by id or (case-insensitive) name. */
async function findProduct(idOrName: string | undefined): Promise<{ id: string; name: string } | null> {
  if (!idOrName?.trim()) return null;
  const row = await db.select({ id: catalogProducts.id, name: catalogProducts.name })
    .from(catalogProducts)
    .where(or(eq(catalogProducts.id, idOrName), ilike(catalogProducts.name, idOrName.trim())))
    .limit(1).then(r => r[0]);
  return row ?? null;
}

/** Build a runnable linear flow (template/text/delay) from the agent's steps. */
async function buildFlowDoc(name: string, steps: any[]): Promise<{ doc: any; note: string }> {
  // Pre-load any referenced approved templates.
  const wantNames = steps.filter(s => s?.kind === 'template' && s.templateName).map(s => String(s.templateName));
  const tmplRows = wantNames.length
    ? await db.select().from(templates).where(eq(templates.status, 'APPROVED'))
    : [];
  const tmplByName = new Map(tmplRows.map(t => [t.name.toLowerCase(), t]));

  const nodes: any[] = [];
  const edges: any[] = [];
  let y = 40;
  const X = 280;
  let idx = 0;
  const nextId = (p: string) => `${p}_${idx++}_${Date.now().toString(36)}`;

  let prevSendId: string | null = null;
  let pendingDelay = 0;        // seconds to apply before the next send node
  let missingTemplate = false;
  let firstSendId: string | null = null;
  let firstSendIsTemplate = false;

  const addEdge = (source: string, target: string) =>
    edges.push({ id: `e_${source}_${target}`, source, target });

  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;

    if (step.kind === 'delay') {
      pendingDelay = Math.max(0, Number(step.seconds) || 0);
      continue;
    }

    // Build the send node (template or text).
    let sendNode: any;
    if (step.kind === 'template') {
      const t = tmplByName.get(String(step.templateName ?? '').toLowerCase());
      if (!t) { missingTemplate = true; continue; }
      const template: Template = {
        id: t.id, name: t.name, language: t.language, status: t.status as Template['status'],
        category: t.category as Template['category'], components: (t.components ?? []) as Template['components'],
      };
      sendNode = { id: nextId('tmpl'), type: 'templateNode', position: { x: X, y }, data: { template } };
    } else {
      // default: text node
      sendNode = { id: nextId('text'), type: 'textNode', position: { x: X, y }, data: { name: step.name || 'Message', content: step.content || '' } };
    }

    if (!firstSendId) { firstSendId = sendNode.id; firstSendIsTemplate = sendNode.type === 'templateNode'; }

    // Wire the previous send node to this one, through a delay node so it
    // auto-advances (the engine advances on delay or a template's buttons only).
    if (prevSendId) {
      const delayNode = { id: nextId('delay'), type: 'delayNode', position: { x: X + 220, y: y - 70 }, data: { seconds: pendingDelay } };
      nodes.push(delayNode);
      addEdge(prevSendId, delayNode.id);
      addEdge(delayNode.id, sendNode.id);
    }
    pendingDelay = 0;

    nodes.push(sendNode);
    prevSendId = sendNode.id;
    y += 160;
  }

  const now = new Date();
  const doc = {
    name: name.trim(),
    nodes, edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    status: 'draft' as const,
    rootNodeId: firstSendId,
    createdAt: now,
    updatedAt: now,
  };

  let note = '';
  if (missingTemplate) note += ' Some referenced templates were not found and were skipped.';
  if (firstSendId && !firstSendIsTemplate) note += ' Note: the flow starts with a text message — WhatsApp requires an approved template to start a flow, so add a template as the first step before going live.';
  return { doc, note: note.trim() };
}

/** Execute one staged write action. */
export async function executeWrite(name: string, args: Record<string, any>): Promise<WriteResult> {
  try {
    switch (name) {
      case 'create_category': {
        const media = refsToMedia(args.imageRefs);
        const name = String(args.name).trim();
        // Idempotent: if the category already exists, reuse it (optionally enrich
        // its image/description) instead of failing on the unique-name constraint.
        const existing = await db.select({ id: categories.id }).from(categories)
          .where(ilike(categories.name, name)).limit(1).then(r => r[0]);
        if (existing) {
          await db.update(categories).set({
            ...(args.description ? { description: args.description } : {}),
            ...(media[0]?.assetId ? { imageAssetId: media[0].assetId } : {}),
            ...(args.imageUrl ? { imageUrl: args.imageUrl } : {}),
            updatedAt: new Date(),
          }).where(eq(categories.id, existing.id));
          return { ok: true, summary: `Used existing category “${name}”`, detail: existing.id };
        }
        const [row] = await db.insert(categories).values({
          name,
          description: args.description || null,
          imageAssetId: media[0]?.assetId ?? null,
          imageUrl: args.imageUrl || null,
          inAgentContext: args.inAgentContext === undefined ? true : !!args.inAgentContext,
        }).returning({ id: categories.id });
        return { ok: true, summary: `Created category “${name}”`, detail: row.id };
      }

      case 'create_product': {
        const categoryId = (await categoryIdByName(args.categoryName)) ?? (args.categoryId || null);
        const categoryName = await categoryNameById(categoryId);
        const [row] = await db.insert(catalogProducts).values({
          name: String(args.name).trim(),
          description: args.description || null,
          priceRange: args.priceRange || null,
          category: categoryName,
          categoryId: categoryId || null,
          fabric: args.fabric || null,
          occasions: args.occasions || null,
          customInfo: args.customInfo || null,
          media: refsToMedia(args.imageRefs),
          inAgentContext: args.inAgentContext === undefined ? true : !!args.inAgentContext,
        }).returning({ id: catalogProducts.id });
        return { ok: true, summary: `Added product “${args.name}”`, detail: row.id };
      }

      case 'create_variant': {
        // Prefer an explicit parentId (resolved within the same apply batch) over the name.
        const parent = await findProduct(args.parentId || args.parentName);
        if (!parent) return { ok: false, summary: `Could not find parent product “${args.parentName ?? args.parentId}”`, error: 'parent_not_found' };
        const [row] = await db.insert(catalogProducts).values({
          name: String(args.name).trim(),
          description: args.description || null,
          priceRange: args.priceRange || null,
          fabric: args.fabric || null,
          occasions: args.occasions || null,
          customInfo: args.customInfo || null,
          media: refsToMedia(args.imageRefs),
          parentId: parent.id,
          variantAttributes: cleanVariantAttributes(args.variantAttributes),
          inAgentContext: args.inAgentContext === undefined ? true : !!args.inAgentContext,
        }).returning({ id: catalogProducts.id });
        return { ok: true, summary: `Added variant “${args.name}” of “${parent.name}”`, detail: row.id };
      }

      case 'update_product': {
        const prod = await findProduct(args.productId || args.name);
        if (!prod) return { ok: false, summary: `Could not find product “${args.productId ?? args.name}”`, error: 'not_found' };
        const categoryId = args.categoryName !== undefined ? await categoryIdByName(args.categoryName) : undefined;
        const categoryName = categoryId !== undefined ? await categoryNameById(categoryId) : undefined;
        const media = args.imageRefs !== undefined ? refsToMedia(args.imageRefs) : undefined;
        await db.update(catalogProducts).set({
          ...(args.newName !== undefined && { name: args.newName }),
          ...(args.description !== undefined && { description: args.description }),
          ...(args.priceRange !== undefined && { priceRange: args.priceRange }),
          ...(args.fabric !== undefined && { fabric: args.fabric }),
          ...(args.occasions !== undefined && { occasions: args.occasions }),
          ...(args.customInfo !== undefined && { customInfo: args.customInfo }),
          ...(categoryId !== undefined && { categoryId, category: categoryName }),
          ...(media !== undefined && { media }),
          ...(args.inAgentContext !== undefined && { inAgentContext: !!args.inAgentContext }),
          embedding: null, syncedAt: null, updatedAt: new Date(),
        }).where(eq(catalogProducts.id, prod.id));
        return { ok: true, summary: `Updated product “${prod.name}”`, detail: prod.id };
      }

      case 'update_category': {
        const catId = (await categoryIdByName(args.name)) ?? args.categoryId;
        if (!catId) return { ok: false, summary: `Could not find category “${args.name ?? args.categoryId}”`, error: 'not_found' };
        const media = args.imageRefs !== undefined ? refsToMedia(args.imageRefs) : undefined;
        await db.update(categories).set({
          ...(args.newName !== undefined && { name: args.newName }),
          ...(args.description !== undefined && { description: args.description }),
          ...(media !== undefined && { imageAssetId: media[0]?.assetId ?? null }),
          ...(args.inAgentContext !== undefined && { inAgentContext: !!args.inAgentContext }),
          updatedAt: new Date(),
        }).where(eq(categories.id, catId));
        return { ok: true, summary: `Updated category`, detail: catId };
      }

      case 'create_flow': {
        const { doc, note } = await buildFlowDoc(String(args.name || 'New flow'), Array.isArray(args.steps) ? args.steps : []);
        const coll = await flowsColl();
        const res = await coll.insertOne(doc);
        return { ok: true, summary: `Created flow draft “${doc.name}”.${note ? ' ' + note : ''}`, detail: res.insertedId.toString() };
      }

      case 'update_agent_settings': {
        const existing = await db.select({ id: agentSettings.id }).from(agentSettings).limit(1).then(r => r[0]);
        if (existing) {
          await db.update(agentSettings).set({
            ...(args.agentName !== undefined && { agentName: args.agentName }),
            ...(args.systemPrompt !== undefined && { systemPrompt: args.systemPrompt }),
            updatedAt: new Date(),
          }).where(eq(agentSettings.id, existing.id));
        } else {
          await db.insert(agentSettings).values({
            agentName: args.agentName || 'Riya',
            systemPrompt: args.systemPrompt || '',
          });
        }
        return { ok: true, summary: 'Updated sales-agent settings' };
      }

      case 'create_agent_draft': {
        const coll = await agentDraftsColl();
        const now = new Date();
        const res = await coll.insertOne({
          kind: 'text', name: String(args.name).trim(),
          content: args.content || '', triggerHint: args.triggerHint || null,
          isActive: true, createdAt: now, updatedAt: now,
        });
        return { ok: true, summary: `Added pre-written message “${args.name}”`, detail: res.insertedId.toString() };
      }

      default:
        return { ok: false, summary: `Unknown action ${name}`, error: 'unknown_tool' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed';
    return { ok: false, summary: `Failed: ${summarizeWrite(name, args)}`, error: msg };
  }
}

/** Whether any of the executed actions touched products (→ re-embed for the sales agent). */
export function touchedInventory(names: string[]): boolean {
  return names.some(n => n === 'create_product' || n === 'create_variant' || n === 'update_product');
}

export { syncInventoryEmbeddings };
