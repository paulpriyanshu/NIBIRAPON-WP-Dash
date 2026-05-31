'use client';
import { useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Network, X, Plus, Trash2 } from 'lucide-react';

interface Branch { id: string; label: string; }

const BRANCH_COLORS = [
  '#a78bfa', '#34d399', '#60a5fa', '#fb923c', '#f472b6', '#facc15',
];

export default function MultiConditionNode({ id, data, selected }: NodeProps) {
  const { deleteElements, updateNodeData } = useReactFlow();
  const [hovered, setHovered] = useState(false);

  const branches: Branch[] = (data.branches as Branch[]) ?? [
    { id: 'b1', label: 'Branch 1' },
    { id: 'b2', label: 'Branch 2' },
  ];

  const addBranch = () => {
    if (branches.length >= 6) return;
    updateNodeData(id, {
      branches: [...branches, { id: `b${Date.now()}`, label: `Branch ${branches.length + 1}` }],
    });
  };

  const removeBranch = (bId: string) => {
    if (branches.length <= 2) return;
    updateNodeData(id, { branches: branches.filter(b => b.id !== bId) });
  };

  const updateLabel = (bId: string, label: string) => {
    updateNodeData(id, { branches: branches.map(b => b.id === bId ? { ...b, label } : b) });
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`bg-[#180f28] border rounded-xl w-[280px] shadow-xl transition-all ${
        selected
          ? 'border-purple-400/70 shadow-[0_0_0_3px_rgba(167,139,250,0.13)]'
          : 'border-purple-400/25 hover:border-purple-400/50'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#a78bfa', border: '2.5px solid #180f28', width: 13, height: 13, top: -7 }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-purple-400/10">
        <div className="w-7 h-7 bg-purple-500/15 rounded-lg flex items-center justify-center shrink-0">
          <Network size={13} className="text-purple-400" />
        </div>
        <p className="text-purple-300 text-[11px] font-semibold flex-1">Multi-Path Router</p>
        <button
          style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="p-0.5 rounded hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors"
        >
          <X size={11} />
        </button>
      </div>

      {/* Branches list */}
      <div className="px-3 py-2.5 space-y-1.5">
        <label className="text-white/25 text-[9px] uppercase tracking-wider mb-2 block">
          Paths ({branches.length}/6)
        </label>

        {branches.map((branch, i) => (
          <div key={branch.id} className="flex items-center gap-1.5">
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[8px] font-bold"
              style={{ background: BRANCH_COLORS[i % BRANCH_COLORS.length] + '25', color: BRANCH_COLORS[i % BRANCH_COLORS.length] }}
            >
              {i + 1}
            </div>
            <input
              type="text"
              value={branch.label}
              onChange={e => updateLabel(branch.id, e.target.value)}
              className="
                flex-1 bg-[#0b141a] border border-white/8 rounded-md
                px-2 py-1 text-white/70 text-[10px]
                focus:outline-none focus:border-purple-400/40
                transition-colors nodrag
              "
            />
            {branches.length > 2 && (
              <button
                onClick={() => removeBranch(branch.id)}
                className="p-0.5 text-white/15 hover:text-red-400 transition-colors"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        ))}

        {branches.length < 6 && (
          <button
            onClick={addBranch}
            className="flex items-center gap-1 text-[9px] text-purple-400/40 hover:text-purple-400 transition-colors pt-0.5"
          >
            <Plus size={10} />
            Add path
          </button>
        )}
      </div>

      {/* Handle row labels */}
      <div className="px-3 pb-4 border-t border-purple-400/5 pt-2">
        <div
          className="flex items-end"
          style={{ justifyContent: 'space-around' }}
        >
          {branches.map((branch, i) => (
            <div key={branch.id} className="text-center" style={{ width: `${100 / branches.length}%` }}>
              <p
                className="text-[8px] truncate px-0.5"
                style={{ color: BRANCH_COLORS[i % BRANCH_COLORS.length] + 'aa' }}
              >
                {branch.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic source handles — evenly spaced */}
      {branches.map((branch, i) => (
        <Handle
          key={branch.id}
          type="source"
          position={Position.Bottom}
          id={branch.id}
          style={{
            background: BRANCH_COLORS[i % BRANCH_COLORS.length],
            border: '2.5px solid #180f28',
            width: 12,
            height: 12,
            bottom: -6,
            left: `${(i + 0.5) / branches.length * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
