'use client';
import { useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Filter, X } from 'lucide-react';

export default function ConditionNode({ id, data, selected }: NodeProps) {
  const { deleteElements, updateNodeData } = useReactFlow();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`bg-[#101e30] border rounded-xl w-[260px] shadow-xl transition-all ${
        selected
          ? 'border-blue-400/70 shadow-[0_0_0_3px_rgba(96,165,250,0.13)]'
          : 'border-blue-400/25 hover:border-blue-400/50'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#60a5fa', border: '2.5px solid #101e30', width: 13, height: 13, top: -7 }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-blue-400/10">
        <div className="w-7 h-7 bg-blue-500/15 rounded-lg flex items-center justify-center shrink-0">
          <Filter size={13} className="text-blue-400" />
        </div>
        <p className="text-blue-300 text-[11px] font-semibold flex-1 leading-none">Condition</p>
        <span className="text-[9px] text-blue-400/30 mr-1">drop on edge to insert</span>
        <button
          style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="p-0.5 rounded hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors"
        >
          <X size={11} />
        </button>
      </div>

      {/* Condition textarea */}
      <div className="px-3 py-2.5">
        <label className="text-white/25 text-[9px] uppercase tracking-wider mb-1.5 block">
          Instruction / Condition
        </label>
        <textarea
          value={(data.condition as string) ?? ''}
          onChange={e => updateNodeData(id, { condition: e.target.value })}
          placeholder={"Enter your condition or instruction…\ne.g. When user replies 'Yes'"}
          rows={3}
          className="
            w-full bg-[#0b141a] border border-white/8 rounded-lg
            px-2.5 py-2 text-white/70 text-[10px] leading-relaxed
            placeholder:text-white/20 focus:outline-none focus:border-blue-400/40
            resize-none transition-colors nodrag
          "
        />
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#60a5fa', border: '2.5px solid #101e30', width: 13, height: 13, bottom: -7 }}
      />
    </div>
  );
}
