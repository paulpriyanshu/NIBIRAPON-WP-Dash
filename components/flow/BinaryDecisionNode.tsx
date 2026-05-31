'use client';
import { useState } from 'react';
import { Handle, Position, useReactFlow, useEdges } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { GitBranch, X, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

export default function BinaryDecisionNode({ id, data, selected }: NodeProps) {
  const { deleteElements, updateNodeData } = useReactFlow();
  const [hovered, setHovered] = useState(false);

  const allEdges = useEdges();
  const hasYes = allEdges.some(e => e.source === id && e.sourceHandle === 'yes');
  const hasNo  = allEdges.some(e => e.source === id && e.sourceHandle === 'no');
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
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{
          background: '#4ade80',
          border: '2.5px solid #1f1805',
          width: 13,
          height: 13,
          bottom: -7,
          left: '27%',
        }}
      />
      {/* NO handle — right side */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{
          background: '#f87171',
          border: '2.5px solid #1f1805',
          width: 13,
          height: 13,
          bottom: -7,
          left: '73%',
        }}
      />
    </div>
  );
}
