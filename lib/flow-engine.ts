import type { Template } from '@/types';

/* ── Flow graph shapes (as stored by the Flow Builder) ───────────────────────── */

export interface FlowNode { id: string; type?: string; data?: Record<string, unknown>; }
export interface FlowEdge { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; }
export interface Flow {
  _id?: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  status?: 'draft' | 'live';
  rootNodeId?: string | null;
}

export interface FlowButton { index: number; text: string; }

export interface CompiledFlow {
  nodesById: Record<string, FlowNode>;
  // transitions[templateNodeId] = { buttons: { [buttonText]: nextTemplateNodeId }, default }
  transitions: Record<string, { buttons: Record<string, string>; default: string | null }>;
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

  // Follow pass-through nodes until we reach a template (best effort).
  const resolveToTemplate = (nodeId: string, seen = new Set<string>()): string | null => {
    if (seen.has(nodeId)) return null;
    seen.add(nodeId);
    const n = nodesById[nodeId];
    if (!n) return null;
    if (n.type === 'templateNode') return nodeId;
    if (n.type === 'conditionNode') {
      const out = edges.find(e => e.source === nodeId);
      return out ? resolveToTemplate(out.target, seen) : null;
    }
    return null;
  };

  const transitions: CompiledFlow['transitions'] = {};

  for (const node of flow.nodes ?? []) {
    if (node.type !== 'templateNode') continue;
    const buttons = quickReplyButtons(node);
    const entry = { buttons: {} as Record<string, string>, default: null as string | null };

    for (const oe of edges.filter(e => e.source === node.id)) {
      const target = nodesById[oe.target];
      if (!target) continue;

      if (target.type === 'binaryDecisionNode') {
        // Button router fed by this template — map each button's btn-i edge.
        for (const b of buttons) {
          const be = edges.find(e => e.source === target.id && e.sourceHandle === `btn-${b.index}`);
          const dest = be ? resolveToTemplate(be.target) : null;
          if (dest) entry.buttons[b.text] = dest;
        }
      } else if (target.type === 'multiConditionNode') {
        // Manual multi-path — match a branch label to a button text (best effort).
        const branches = (target.data?.branches as { id: string; label: string }[] | undefined) ?? [];
        for (const br of branches) {
          const be = edges.find(e => e.source === target.id && e.sourceHandle === br.id);
          const dest = be ? resolveToTemplate(be.target) : null;
          if (dest) entry.buttons[br.label] = dest;
        }
      } else if (target.type === 'templateNode') {
        entry.default = target.id;
      } else if (target.type === 'conditionNode') {
        const dest = resolveToTemplate(target.id);
        if (dest) entry.default = dest;
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

/** Given the current template and the button the customer tapped, find the next template node id. */
export function resolveNext(c: CompiledFlow, currentNodeId: string, buttonText: string): string | null {
  const entry = c.transitions[currentNodeId];
  if (!entry) return null;
  if (entry.buttons[buttonText]) return entry.buttons[buttonText];
  const lower = buttonText.trim().toLowerCase();
  for (const [k, v] of Object.entries(entry.buttons)) {
    if (k.trim().toLowerCase() === lower) return v;
  }
  return entry.default ?? null;
}

/** Whether a node has any onward transition (false ⇒ it's a flow endpoint). */
export function hasOnward(c: CompiledFlow, nodeId: string): boolean {
  const e = c.transitions[nodeId];
  if (!e) return false;
  return Object.keys(e.buttons).length > 0 || !!e.default;
}
