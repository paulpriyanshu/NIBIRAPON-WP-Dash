'use client';
import { useState } from 'react';
import { Handle, Position, useReactFlow, useEdges } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Clock, X, AlertTriangle } from 'lucide-react';

// Time-bound auto-advance: after a template is sent, wait N seconds, then send
// the next template — no button tap needed. Wire template → Delay → next template.
export default function DelayNode({ id, data, selected }: NodeProps) {
  const { deleteElements, updateNodeData } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const edges = useEdges();
  const wired = edges.some(e => e.source === id);
  const seconds = Number(data.seconds) || 0;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`bg-[#0e1f1c] border rounded-xl w-[240px] shadow-xl transition-all ${
        selected ? 'border-teal-400/70 shadow-[0_0_0_3px_rgba(45,212,191,0.12)]' : 'border-teal-400/25 hover:border-teal-400/50'
      }`}
    >
      <Handle type="target" position={Position.Top}
        style={{ background: '#2dd4bf', border: '2.5px solid #0e1f1c', width: 13, height: 13, top: -7 }} />

      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-teal-400/10">
        <div className="w-7 h-7 bg-teal-500/15 rounded-lg flex items-center justify-center shrink-0">
          <Clock size={13} className="text-teal-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-teal-200 text-[11px] font-semibold leading-none">Delay</p>
          {!wired && (
            <p className="text-teal-400/60 text-[9px] flex items-center gap-1 mt-0.5">
              <AlertTriangle size={8} /> connect to the next template
            </p>
          )}
        </div>
        <button style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="p-0.5 rounded hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors">
          <X size={11} />
        </button>
      </div>

      <div className="px-3 py-2.5">
        <label className="text-white/25 text-[9px] uppercase tracking-wider mb-1.5 block">Wait before sending next</label>
        <div className="flex items-center gap-2">
          <input type="number" min={1} value={seconds || ''}
            onChange={e => updateNodeData(id, { seconds: Math.max(0, Number(e.target.value)) })}
            placeholder="5"
            className="w-20 bg-[#0b141a] border border-white/8 rounded-lg px-2.5 py-1.5 text-white/80 text-[11px] focus:outline-none focus:border-teal-400/40 transition-colors nodrag" />
          <span className="text-white/40 text-[10px]">seconds</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ background: '#2dd4bf', border: '2.5px solid #0e1f1c', width: 13, height: 13, bottom: -7 }} />
    </div>
  );
}
