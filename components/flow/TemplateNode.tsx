'use client';
import { useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Layers, X, MessageSquare, Image, FileText } from 'lucide-react';
import type { Template } from '@/types';

const CATEGORY_STYLE = {
  MARKETING:      { bg: 'bg-purple-500/20', text: 'text-purple-300', label: 'Marketing' },
  UTILITY:        { bg: 'bg-blue-500/20',   text: 'text-blue-300',   label: 'Utility' },
  AUTHENTICATION: { bg: 'bg-amber-500/20',  text: 'text-amber-300',  label: 'Auth' },
} as const;

const HEADER_ICON = {
  IMAGE:    <Image size={11} />,
  VIDEO:    <FileText size={11} />,
  DOCUMENT: <FileText size={11} />,
  TEXT:     <MessageSquare size={11} />,
};

export default function TemplateNode({ id, data, selected }: NodeProps) {
  const { deleteElements } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const template = data.template as Template;

  const body   = template.components.find(c => c.type === 'BODY');
  const header = template.components.find(c => c.type === 'HEADER');
  const footer = template.components.find(c => c.type === 'FOOTER');
  const buttons = template.components.find(c => c.type === 'BUTTONS');
  const cat    = CATEGORY_STYLE[template.category as keyof typeof CATEGORY_STYLE];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`bg-[#1f2c34] border rounded-xl w-[240px] shadow-xl transition-all select-none ${
        selected
          ? 'border-[#25D366] shadow-[0_0_0_3px_rgba(37,211,102,0.12)]'
          : 'border-white/10 hover:border-white/25'
      }`}
    >
      {/* Target handle — incoming connection */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: '#25D366',
          border: '2.5px solid #1f2c34',
          width: 13,
          height: 13,
          top: -7,
        }}
      />

      {/* Node header bar */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2.5 border-b border-white/5">
        <div className="w-7 h-7 bg-[#25D366]/15 rounded-lg flex items-center justify-center shrink-0">
          <Layers size={13} className="text-[#25D366]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[11px] font-semibold truncate leading-snug">{template.name}</p>
          <p className="text-white/30 text-[9px] uppercase tracking-wider">{template.language}</p>
        </div>
        <button
          style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="p-0.5 rounded hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors shrink-0"
        >
          <X size={11} />
        </button>
      </div>

      {/* Message preview */}
      <div className="px-3 py-2.5 space-y-1.5">
        {/* Header */}
        {header && (
          <div className="flex items-center gap-1.5">
            {header.format && header.format !== 'TEXT' && (
              <span className="text-white/30">
                {HEADER_ICON[header.format as keyof typeof HEADER_ICON]}
              </span>
            )}
            {header.text && (
              <p className="text-white text-[11px] font-medium line-clamp-1">{header.text}</p>
            )}
            {header.format && header.format !== 'TEXT' && !header.text && (
              <p className="text-white/40 text-[10px] italic">{header.format.toLowerCase()} header</p>
            )}
          </div>
        )}

        {/* Body */}
        {body?.text && (
          <p className="text-white/55 text-[10px] leading-relaxed line-clamp-3">{body.text}</p>
        )}

        {/* Footer */}
        {footer?.text && (
          <p className="text-white/25 text-[9px] italic line-clamp-1">{footer.text}</p>
        )}

        {/* Buttons count */}
        {buttons?.buttons && buttons.buttons.length > 0 && (
          <div className="pt-0.5 border-t border-white/5 flex items-center gap-1">
            <span className="text-white/30 text-[9px]">
              {buttons.buttons.length} button{buttons.buttons.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="px-3 pb-3">
        {cat ? (
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${cat.bg} ${cat.text} font-medium`}>
            {cat.label}
          </span>
        ) : (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-500/20 text-gray-400 font-medium">
            {template.category}
          </span>
        )}
      </div>

      {/* Source handle — outgoing connection */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: '#25D366',
          border: '2.5px solid #1f2c34',
          width: 13,
          height: 13,
          bottom: -7,
        }}
      />
    </div>
  );
}
