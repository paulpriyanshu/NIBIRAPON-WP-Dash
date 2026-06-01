'use client';
import { useState } from 'react';
import { Handle, Position, useReactFlow, useEdges } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { GitBranch, X, CheckCircle2, XCircle, AlertTriangle, Layers, Ban } from 'lucide-react';
import type { Template, TemplateButton } from '@/types';

// Only quick-reply buttons send a message back from the customer, so only those
// can take the conversation forward / be branched on. URL & phone buttons just
// open a link or dialer — no reply event, so they aren't wireable.
const isActionable = (b: TemplateButton) => b.type === 'QUICK_REPLY';

const BRANCH_COLORS = ['#a78bfa', '#34d399', '#60a5fa', '#fb923c', '#f472b6', '#facc15'];

export default function BinaryDecisionNode({ id, data, selected }: NodeProps) {
  const { deleteElements, updateNodeData, getNode } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const allEdges = useEdges();

  // ── Detect an upstream template node and its buttons ──────────────────────
  // When this decision node is fed by a template that has buttons, it auto-
  // converts into a router with one branch per button (labelled with the
  // button text) instead of a plain Yes / No.
  const incoming   = allEdges.find(e => e.target === id);
  const srcNode    = incoming ? getNode(incoming.source) : undefined;
  const srcTemplate = srcNode?.type === 'templateNode'
    ? (srcNode.data as { template?: Template }).template
    : undefined;
  const tplButtons: TemplateButton[] =
    srcTemplate?.components.find(c => c.type === 'BUTTONS')?.buttons ?? [];
  // Keep original indexes so handle ids (`btn-${i}`) stay stable across renders.
  const actionable = tplButtons
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => isActionable(b));
  // Only enter router mode when there's at least one wireable (quick-reply) button.
  const buttonMode = actionable.length > 0;

  const connected = (handleId: string) =>
    allEdges.some(e => e.source === id && e.sourceHandle === handleId);

  /* ── Button-router mode ─────────────────────────────────────────────────── */
  if (buttonMode) {
    const wiredCount = actionable.filter(({ i }) => connected(`btn-${i}`)).length;
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`bg-[#1f1805] border rounded-xl w-[300px] shadow-xl transition-all ${
          selected
            ? 'border-amber-400/70 shadow-[0_0_0_3px_rgba(251,191,36,0.12)]'
            : 'border-amber-400/25 hover:border-amber-400/50'
        }`}
      >
        <Handle type="target" position={Position.Top}
          style={{ background: '#fbbf24', border: '2.5px solid #1f1805', width: 13, height: 13, top: -7 }} />

        {/* Header */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-amber-400/10">
          <div className="w-7 h-7 bg-amber-500/15 rounded-lg flex items-center justify-center shrink-0">
            <GitBranch size={13} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-amber-300 text-[11px] font-semibold leading-none">Button Router</p>
            <p className="text-amber-500/60 text-[9px] flex items-center gap-1 mt-0.5 truncate">
              <Layers size={8} className="shrink-0" />
              from {srcTemplate?.name}
            </p>
          </div>
          <button
            style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}
            onClick={() => deleteElements({ nodes: [{ id }] })}
            className="p-0.5 rounded hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors"
          >
            <X size={11} />
          </button>
        </div>

        {/* Button list — only quick-reply buttons get a wireable branch */}
        <div className="px-3 py-2.5 space-y-1.5">
          <label className="text-white/25 text-[9px] uppercase tracking-wider block">
            Wire each reply button to its next step ({wiredCount}/{actionable.length})
          </label>
          {tplButtons.map((b, i) => {
            const actionableIdx = actionable.findIndex(a => a.i === i);
            const act = actionableIdx !== -1;
            const color = BRANCH_COLORS[actionableIdx % BRANCH_COLORS.length];
            const on = act && connected(`btn-${i}`);
            return (
              <div key={i} className={`flex items-center gap-1.5 ${act ? '' : 'opacity-45'}`}>
                <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[8px] font-bold"
                  style={act
                    ? { background: color + '25', color }
                    : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                  {act ? actionableIdx + 1 : <Ban size={9} />}
                </div>
                <span className="flex-1 text-[10px] truncate" style={{ color: on ? color : 'rgba(255,255,255,0.5)' }}>
                  {b.text}
                </span>
                <span className="text-white/25 text-[8px] uppercase tracking-wider shrink-0">
                  {b.type === 'QUICK_REPLY' ? 'reply' : b.type === 'PHONE_NUMBER' ? 'call · no branch' : `${b.type.toLowerCase()} · no branch`}
                </span>
              </div>
            );
          })}
        </div>

        {/* Handle labels row — actionable buttons only */}
        <div className="px-3 pb-4 border-t border-amber-400/5 pt-2 flex" style={{ justifyContent: 'space-around' }}>
          {actionable.map(({ b }, ai) => (
            <div key={ai} className="text-center" style={{ width: `${100 / actionable.length}%` }}>
              <p className="text-[8px] truncate px-0.5" style={{ color: BRANCH_COLORS[ai % BRANCH_COLORS.length] + 'aa' }}>
                {b.text}
              </p>
            </div>
          ))}
        </div>

        {/* One source handle per actionable (quick-reply) button */}
        {actionable.map(({ i }, ai) => (
          <Handle
            key={i}
            type="source"
            position={Position.Bottom}
            id={`btn-${i}`}
            style={{
              background: BRANCH_COLORS[ai % BRANCH_COLORS.length],
              border: '2.5px solid #1f1805',
              width: 12, height: 12, bottom: -6,
              left: `${(ai + 0.5) / actionable.length * 100}%`,
            }}
          />
        ))}
      </div>
    );
  }

  /* ── Plain Yes / No mode (no upstream button template) ───────────────────── */
  const hasYes = connected('yes');
  const hasNo  = connected('no');
  const bothConnected = hasYes && hasNo;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`bg-[#1f1805] border rounded-xl w-[280px] shadow-xl transition-all ${
        selected
          ? 'border-amber-400/70 shadow-[0_0_0_3px_rgba(251,191,36,0.12)]'
          : 'border-amber-400/25 hover:border-amber-400/50'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#fbbf24', border: '2.5px solid #1f1805', width: 13, height: 13, top: -7 }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-amber-400/10">
        <div className="w-7 h-7 bg-amber-500/15 rounded-lg flex items-center justify-center shrink-0">
          <GitBranch size={13} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-amber-300 text-[11px] font-semibold leading-none">Yes / No Decision</p>
          {!bothConnected && (
            <p className="text-amber-500/60 text-[9px] flex items-center gap-1 mt-0.5">
              <AlertTriangle size={8} />
              {!hasYes && !hasNo ? 'Connect both branches' : !hasYes ? 'Connect YES branch' : 'Connect NO branch'}
            </p>
          )}
        </div>
        <button
          style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="p-0.5 rounded hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors"
        >
          <X size={11} />
        </button>
      </div>

      {/* Condition input */}
      <div className="px-3 py-2.5">
        <label className="text-white/25 text-[9px] uppercase tracking-wider mb-1.5 block">
          Condition to evaluate
        </label>
        <input
          type="text"
          value={(data.condition as string) ?? ''}
          onChange={e => updateNodeData(id, { condition: e.target.value })}
          placeholder="e.g. User replied with 'Yes'"
          className="
            w-full bg-[#0b141a] border border-white/8 rounded-lg
            px-2.5 py-1.5 text-white/70 text-[10px]
            placeholder:text-white/20 focus:outline-none focus:border-amber-400/40
            transition-colors nodrag
          "
        />
      </div>

      {/* Branch labels */}
      <div className="px-3 pb-3 flex justify-between items-center">
        <div className={`flex items-center gap-1 text-[10px] font-semibold transition-colors ${hasYes ? 'text-green-400' : 'text-white/20'}`}>
          <CheckCircle2 size={11} />
          YES
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-semibold transition-colors ${hasNo ? 'text-red-400' : 'text-white/20'}`}>
          NO
          <XCircle size={11} />
        </div>
      </div>

      {/* YES handle — left side */}
      <Handle
        type="source" position={Position.Bottom} id="yes"
        style={{ background: '#4ade80', border: '2.5px solid #1f1805', width: 13, height: 13, bottom: -7, left: '27%' }}
      />
      {/* NO handle — right side */}
      <Handle
        type="source" position={Position.Bottom} id="no"
        style={{ background: '#f87171', border: '2.5px solid #1f1805', width: 13, height: 13, bottom: -7, left: '73%' }}
      />
    </div>
  );
}
