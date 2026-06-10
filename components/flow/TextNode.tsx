'use client';
import { useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { MessageSquare, X } from 'lucide-react';

// A custom text message the flow sends, then immediately continues to the next
// node (no button tap needed). Pre-filled from a saved agent message, or typed here.
export default function TextNode({ id, data, selected }: NodeProps) {
  const { deleteElements, updateNodeData } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const name    = (data.name as string) ?? 'Message';
  const content = (data.content as string) ?? '';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`bg-[#161429] border rounded-xl w-[250px] shadow-xl transition-all ${
        selected ? 'border-indigo-400/70 shadow-[0_0_0_3px_rgba(129,140,248,0.12)]' : 'border-indigo-400/25 hover:border-indigo-400/50'
      }`}
    >
      <Handle type="target" position={Position.Top}
        style={{ background: '#818cf8', border: '2.5px solid #161429', width: 13, height: 13, top: -7 }} />

      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-indigo-400/10">
        <div className="w-7 h-7 bg-indigo-500/15 rounded-lg flex items-center justify-center shrink-0">
          <MessageSquare size={13} className="text-indigo-300" />
        </div>
        <input
          value={name}
          onChange={e => updateNodeData(id, { name: e.target.value })}
          placeholder="Message name"
          className="flex-1 min-w-0 bg-transparent text-indigo-100 text-[11px] font-semibold focus:outline-none placeholder:text-indigo-300/40 nodrag"
        />
        <button style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="p-0.5 rounded hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors">
          <X size={11} />
        </button>
      </div>

      <div className="px-3 py-2.5">
        <label className="text-white/25 text-[9px] uppercase tracking-wider mb-1.5 block">Message text</label>
        <textarea
          value={content}
          onChange={e => updateNodeData(id, { content: e.target.value })}
          placeholder="Type the message the flow will send…"
          rows={3}
          className="w-full bg-[#0b141a] border border-white/8 rounded-lg px-2.5 py-1.5 text-white/80 text-[11px] leading-relaxed focus:outline-none focus:border-indigo-400/40 resize-none transition-colors nodrag"
        />
        <p className="text-indigo-300/40 text-[9px] mt-1.5">Sends this text, then continues to the next node.</p>
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ background: '#818cf8', border: '2.5px solid #161429', width: 13, height: 13, bottom: -7 }} />
    </div>
  );
}
