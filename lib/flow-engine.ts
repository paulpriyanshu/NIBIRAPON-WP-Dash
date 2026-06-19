import type { Template } from '@/types';

/* ── Flow graph shapes (as stored by the Flow Builder) ───────────────────────── */

export interface FlowNode { id: string; type?: string; data?: Record<string, unknown>; }
export interface FlowEdge { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; }
export interface NodeParams {
  bodyParams: string[];
  headerParam?: string;        // header TEXT {{1}}
  headerMediaUrl?: string;     // header IMAGE/VIDEO/DOCUMENT link (pasted public URL)
  headerMediaAssetId?: string; // R2 asset key when the media was uploaded/picked from the library
  // Multi-product / catalog templates
  thumbnailProductRetailerId?: string;
  mpmSections?: { title: string; productIds: string }[];  // productIds: comma-separated
}

export interface Flow {
  _id?: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  status?: 'draft' | 'live';
  rootNodeId?: string | null;
  // Per-node send config (body variables + header media), filled at launch.
  templateParams?: Record<string, NodeParams>;
}

export interface FlowButton { index: number; text: string; }

export interface CompiledFlow {
  nodesById: Record<string, FlowNode>;
  // Each node's outgoing edges, classified by how they fire:
  //  - buttons:    tap text → next node (via a Button Router / multi-path). Waits for a tap.
  //  - immediates: direct sendable children, sent right away (fan-out) when the node is reached.
  //  - delays:     via a Delay node, scheduled to fire after N seconds.
  // A single node can have any mix (e.g. an immediate follow-up AND a button router).
  transitions: Record<string, {
    buttons: Record<string, string>;
    immediates: string[];
    delays: { seconds: number; nextId: string }[];
  }>;
}

/* ── Node helpers ────────────────────────────────────────────────────────────── */

export function getTemplate(node: FlowNode | undefined): Template | undefined {
  if (!node || node.type !== 'templateNode') return undefined;
  return (node.data as { template?: Template } | undefined)?.template;
}

/** Quick-reply buttons of a template node — the only ones that can branch a flow. */
export function quickReplyButtons(node: FlowNode | undefined): FlowButton[] {
  const t = getTemplate(node);
  const btns = t?.components.find(c => c.type === 'BUTTONS')?.buttons ?? [];
  return btns
    .map((b, index) => ({ b, index }))
    .filter(({ b }) => b.type === 'QUICK_REPLY')
    .map(({ b, index }) => ({ index, text: b.text }));
}

export function templateSendInfo(node: FlowNode | undefined): { name: string; language: string } | null {
  const t = getTemplate(node);
  if (!t?.name) return null;
  return { name: t.name, language: t.language || 'en' };
}

/** The custom text a textNode sends, if any. */
export function textNodeContent(node: FlowNode | undefined): string | null {
  if (!node || node.type !== 'textNode') return null;
  const c = (node.data as { content?: string } | undefined)?.content;
  return typeof c === 'string' ? c : null;
}

/** A photo/video a textNode (message node) sends — uploaded asset or a public URL. */
export interface FlowMedia { type: 'image' | 'video'; assetId?: string; url?: string; caption?: string; mimeType?: string; bytes?: number; }
function isValidMedia(m: FlowMedia | undefined | null): m is FlowMedia {
  return !!m && (m.type === 'image' || m.type === 'video') && (!!m.assetId || !!m.url);
}
export function textNodeMedia(node: FlowNode | undefined): FlowMedia | null {
  if (!node || node.type !== 'textNode') return null;
  const m = (node.data as { media?: FlowMedia } | undefined)?.media;
  return isValidMedia(m) ? m : null;
}
/** All photos/videos a textNode sends, in order. Reads the new `mediaList` array,
 *  falling back to the legacy single `media` field. Sent serially by the runtime. */
export function textNodeMediaList(node: FlowNode | undefined): FlowMedia[] {
  if (!node || node.type !== 'textNode') return [];
  const data = node.data as { mediaList?: FlowMedia[]; media?: FlowMedia } | undefined;
  const list = Array.isArray(data?.mediaList) ? data!.mediaList : (data?.media ? [data.media] : []);
  return list.filter(isValidMedia);
}

/** A short label for a textNode (its name), for logs/inbox. */
export function textNodeLabel(node: FlowNode | undefined): string {
  const name = (node?.data as { name?: string } | undefined)?.name;
  return name?.trim() || 'Message';
}

/** A custom (in-session) message node references a saved custom message by id and
 *  caches its options so the flow can branch on them without a DB read. */
export function customNodeMessageId(node: FlowNode | undefined): string | null {
  if (!node || node.type !== 'customNode') return null;
  const id = (node.data as { customMessageId?: string } | undefined)?.customMessageId;
  return typeof id === 'string' && id ? id : null;
}

/** A template node's fallback custom-message id — sent when the template itself
 *  can't be delivered (e.g. a marketing/utility template outside the 24h window). */
export function templateFallbackCustomId(node: FlowNode | undefined): string | null {
  if (!node || node.type !== 'templateNode') return null;
  const id = (node.data as { fallbackCustomMessageId?: string } | undefined)?.fallbackCustomMessageId;
  return typeof id === 'string' && id ? id : null;
}

/** The tappable reply options a node offers — quick replies (templateNode) or the
 *  cached options of a customNode. Drives flow branching, uniformly. */
export function nodeReplyOptions(node: FlowNode | undefined): FlowButton[] {
  if (node?.type === 'templateNode') return quickReplyButtons(node);
  if (node?.type === 'customNode') {
    const opts = (node.data as { options?: string[] } | undefined)?.options ?? [];
    return opts.map((text, index) => ({ index, text }));
  }
  return [];
}

/** Whether a node sends something when the flow reaches it (template, text, or custom). */
export function isSendableNode(node: FlowNode | undefined): boolean {
  return node?.type === 'templateNode' || node?.type === 'textNode' || node?.type === 'customNode';
}

/** Whether a template is a multi-product (MPM) or catalog template. */
export function templateKindFlags(t: Template): { isMPM: boolean; isCatalog: boolean } {
  const buttons = t.components.find(c => c.type === 'BUTTONS')?.buttons ?? [];
  const isMPM     = buttons.some(b => String(b.type).toUpperCase() === 'MPM');
  const isCatalog = buttons.some(b => String(b.type).toUpperCase() === 'CATALOG');
  return { isMPM, isCatalog };
}

function countPlaceholders(text: string): number {
  return new Set([...(text ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => m[1])).size;
}

/** What a template node needs filled in before it can be sent. */
export interface TemplateParamSpec {
  nodeId: string;
  templateName: string;
  bodyParams: number;          // distinct {{n}} in the BODY
  headerTextParams: number;    // distinct {{n}} in a TEXT header
  needsHeaderMedia: boolean;   // header is IMAGE/VIDEO/DOCUMENT
  headerFormat?: string;
  isMPM: boolean;              // multi-product template (needs product IDs + thumbnail)
  isCatalog: boolean;          // catalog template (needs thumbnail)
}

/** Param spec computed directly from a Template (no flow node). */
export function specFromTemplate(t: Template): Omit<TemplateParamSpec, 'nodeId'> {
  const body = t.components.find(c => c.type === 'BODY')?.text ?? '';
  const header = t.components.find(c => c.type === 'HEADER');
  const needsHeaderMedia = !!header?.format && header.format !== 'TEXT';
  const headerTextParams = header?.format === 'TEXT' ? countPlaceholders(header.text ?? '') : 0;
  const { isMPM, isCatalog } = templateKindFlags(t);
  return {
    templateName: t.name,
    bodyParams: countPlaceholders(body),
    headerTextParams, needsHeaderMedia, headerFormat: header?.format,
    isMPM, isCatalog,
  };
}

export function templateParamSpec(node: FlowNode): TemplateParamSpec | null {
  const t = getTemplate(node);
  if (!t?.name) return null;
  return { nodeId: node.id, ...specFromTemplate(t) };
}

/** Does this template require any input before launch? */
export function specNeedsConfig(s: TemplateParamSpec): boolean {
  return s.bodyParams > 0 || s.headerTextParams > 0 || s.needsHeaderMedia || s.isMPM || s.isCatalog;
}

/** Param specs for every template node in the flow. */
export function flowParamSpecs(flow: Flow): TemplateParamSpec[] {
  return (flow.nodes ?? [])
    .filter(n => n.type === 'templateNode')
    .map(templateParamSpec)
    .filter((s): s is TemplateParamSpec => !!s);
}

/** Distinct WhatsApp template names referenced anywhere in the flow. */
export function templatesInFlow(flow: Flow): string[] {
  const names = new Set<string>();
  for (const n of flow.nodes ?? []) {
    const t = getTemplate(n);
    if (t?.name) names.add(t.name);
  }
  return [...names];
}

/* ── Compilation ─────────────────────────────────────────────────────────────── */

/**
 * Build a runtime transition table from the visual graph, walking
 * template → Button Router (binaryDecisionNode) → btn-i edge → next template.
 * Only quick-reply buttons become transitions.
 */
export function compileFlow(flow: Flow): CompiledFlow {
  const nodesById: Record<string, FlowNode> = {};
  for (const n of flow.nodes ?? []) nodesById[n.id] = n;
  const edges = flow.edges ?? [];

  const SENDABLE = (t?: string) => t === 'templateNode' || t === 'textNode' || t === 'customNode';

  // Follow pass-through nodes until we reach a sendable node (template/text/custom).
  const resolveToTemplate = (nodeId: string, seen = new Set<string>()): string | null => {
    if (seen.has(nodeId)) return null;
    seen.add(nodeId);
    const n = nodesById[nodeId];
    if (!n) return null;
    if (SENDABLE(n.type)) return nodeId;
    if (n.type === 'conditionNode') {
      const out = edges.find(e => e.source === nodeId);
      return out ? resolveToTemplate(out.target, seen) : null;
    }
    return null;
  };

  const transitions: CompiledFlow['transitions'] = {};

  // Template/custom nodes branch on their reply options; text nodes flow straight on.
  for (const node of flow.nodes ?? []) {
    if (!SENDABLE(node.type)) continue;
    const buttons = nodeReplyOptions(node);
    const entry: CompiledFlow['transitions'][string] = { buttons: {}, immediates: [], delays: [] };

    for (const oe of edges.filter(e => e.source === node.id)) {
      const target = nodesById[oe.target];
      if (!target) continue;

      if (target.type === 'delayNode') {
        // node → Delay → next sendable: send the target after N seconds.
        const seconds = Math.max(0, Number(target.data?.seconds) || 0);
        const out = edges.find(e => e.source === target.id);
        const dest = out ? resolveToTemplate(out.target) : null;
        if (dest) entry.delays.push({ seconds, nextId: dest });
      } else if (target.type === 'binaryDecisionNode') {
        // Button router fed by this node — map each option's btn-i edge.
        for (const b of buttons) {
          const be = edges.find(e => e.source === target.id && e.sourceHandle === `btn-${b.index}`);
          const dest = be ? resolveToTemplate(be.target) : null;
          if (dest) entry.buttons[b.text] = dest;
        }
      } else if (target.type === 'multiConditionNode') {
        // Manual multi-path — match a branch label to an option text (best effort).
        const branches = (target.data?.branches as { id: string; label: string }[] | undefined) ?? [];
        for (const br of branches) {
          const be = edges.find(e => e.source === target.id && e.sourceHandle === br.id);
          const dest = be ? resolveToTemplate(be.target) : null;
          if (dest) entry.buttons[br.label] = dest;
        }
      } else if (SENDABLE(target.type)) {
        // Direct edge to a sendable node → sent immediately (fan-out).
        entry.immediates.push(target.id);
      } else if (target.type === 'conditionNode') {
        const dest = resolveToTemplate(target.id);
        if (dest) entry.immediates.push(dest);
      }
    }
    transitions[node.id] = entry;
  }

  return { nodesById, transitions };
}

/** Template nodes with no incoming edge — candidate entry points. */
export function findRootNodes(flow: Flow): string[] {
  const targets = new Set((flow.edges ?? []).map(e => e.target));
  return (flow.nodes ?? [])
    .filter(n => n.type === 'templateNode' && !targets.has(n.id))
    .map(n => n.id);
}

/**
 * The node a button tap leads to, via this node's Button Router. Returns null when
 * the tapped text matches no wired button. (Immediate/delay children are auto-sent,
 * never tap targets — so there is no "default" fallback here.)
 */
export function resolveNext(c: CompiledFlow, currentNodeId: string, buttonText: string): string | null {
  const entry = c.transitions[currentNodeId];
  if (!entry) return null;
  if (entry.buttons[buttonText]) return entry.buttons[buttonText];
  const lower = buttonText.trim().toLowerCase();
  for (const [k, v] of Object.entries(entry.buttons)) {
    if (k.trim().toLowerCase() === lower) return v;
  }
  return null;
}

/** Whether a node has any onward transition (false ⇒ it's a flow endpoint). */
export function hasOnward(c: CompiledFlow, nodeId: string): boolean {
  const e = c.transitions[nodeId];
  if (!e) return false;
  return Object.keys(e.buttons).length > 0 || e.immediates.length > 0 || e.delays.length > 0;
}

/* ── Tracking helpers ────────────────────────────────────────────────────────── */

/** A short, human label for a sendable node — used in run tracking / funnels. */
export function nodeShortLabel(node: FlowNode | undefined): string {
  if (!node) return 'Node';
  if (node.type === 'templateNode') return getTemplate(node)?.name ?? 'Template';
  if (node.type === 'textNode')     return textNodeLabel(node);
  if (node.type === 'customNode')   return (node.data as { label?: string } | undefined)?.label || 'Custom message';
  return node.type ?? 'Node';
}

/**
 * Sendable nodes reachable from the root, in breadth-first (flow) order — the
 * spine of a run funnel. Mirrors the runtime: a run "reaches" the root and every
 * node it later advances to, so these are exactly the nodes a run can occupy.
 */
export function orderedSendableNodes(flow: Flow, rootId: string): string[] {
  const c = compileFlow(flow);
  const order: string[] = [];
  const seen = new Set<string>();
  const queue: string[] = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || !c.nodesById[id]) continue;
    seen.add(id);
    order.push(id);
    const e = c.transitions[id];
    if (!e) continue;
    const nexts = [...Object.values(e.buttons), ...e.immediates, ...e.delays.map(d => d.nextId)]
      .filter((n): n is string => !!n);
    for (const n of nexts) if (!seen.has(n)) queue.push(n);
  }
  return order;
}
