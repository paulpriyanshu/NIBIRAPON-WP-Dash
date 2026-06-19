'use client';
import { useState, useEffect } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Layers, X, MessageSquare, Image, FileText, CornerUpLeft, ExternalLink, Phone, ShoppingBag, LifeBuoy } from 'lucide-react';
import type { Template, TemplateButton } from '@/types';

// Cached, fetched-once list of custom messages (for the fallback selector).
let _cmCache: { id: string; name: string }[] | null = null;
let _cmPromise: Promise<{ id: string; name: string }[]> | null = null;
function useCustomMessages() {
  const [list, setList] = useState<{ id: string; name: string }[]>(_cmCache ?? []);
  useEffect(() => {
    if (_cmCache) { setList(_cmCache); return; }
    if (!_cmPromise) {
      _cmPromise = fetch('/api/custom-messages')
        .then(r => (r.ok ? r.json() : []))
        .then((rows: { id: string; name: string }[]) => { _cmCache = rows.map(m => ({ id: m.id, name: m.name })); return _cmCache; })
        .catch(() => []);
    }
    _cmPromise.then(setList);
  }, []);
  return list;
}

// Icon per WhatsApp button type — quick-reply buttons are the ones that send a
// reply you can branch on; URL / phone just open the link / dialer.
const BUTTON_ICON: Record<TemplateButton['type'], React.ReactNode> = {
  QUICK_REPLY:  <CornerUpLeft size={10} />,
  URL:          <ExternalLink size={10} />,
  PHONE_NUMBER: <Phone size={10} />,
  CATALOG:      <ShoppingBag size={10} />,
  MPM:          <ShoppingBag size={10} />,
};

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
  const { deleteElements, updateNodeData } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const template = data.template as Template;
  const customMsgs = useCustomMessages();
  const fallbackId = (data.fallbackCustomMessageId as string) ?? '';

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

        {/* Buttons — show each one so the flow can branch per button */}
        {buttons?.buttons && buttons.buttons.length > 0 && (
          <div className="pt-1.5 mt-0.5 border-t border-white/5 space-y-1">
            {buttons.buttons.map((b, i) => {
              // Only quick-reply buttons send a message back, so only those can
              // carry the flow forward — others are shown dimmed.
              const act = b.type === 'QUICK_REPLY';
              return (
                <div key={i} className={`flex items-center gap-1.5 bg-white/[0.04] rounded-md px-1.5 py-1 ${act ? '' : 'opacity-45'}`}>
                  <span className={`${act ? 'text-[#25D366]/70' : 'text-white/30'} shrink-0`}>{BUTTON_ICON[b.type] ?? <CornerUpLeft size={10} />}</span>
                  <span className="text-white/65 text-[10px] truncate flex-1">{b.text}</span>
                  <span className="text-white/25 text-[8px] uppercase tracking-wider shrink-0">
                    {act ? 'reply' : b.type === 'PHONE_NUMBER' ? 'call · no branch' : `${b.type.toLowerCase()} · no branch`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="px-3 pb-2">
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

      {/* Fallback — sent if the template can't be delivered (e.g. outside 24h window) */}
      <div className="px-3 pb-3 nodrag">
        <label className="text-white/30 text-[8px] uppercase tracking-wider mb-1 flex items-center gap-1">
          <LifeBuoy size={9} /> Fallback if not sent
        </label>
        <select
          value={fallbackId}
          onChange={e => updateNodeData(id, { fallbackCustomMessageId: e.target.value })}
          className="w-full bg-[#0b141a] border border-white/10 rounded px-1.5 py-1 text-white/70 text-[9px] focus:outline-none focus:border-[#25D366]/40"
        >
          <option value="">— none —</option>
          {customMsgs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {fallbackId && !customMsgs.some(m => m.id === fallbackId) && (
          <p className="text-amber-400/70 text-[8px] mt-0.5">selected message not found</p>
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
