'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { MessageSquareMore, X, List, MousePointerClick, Type, Image as ImageIcon, Loader2 } from 'lucide-react';
import { customMessageOptions, renderCustomPreview, type CustomMessage } from '@/lib/custom-messages';

const TYPE_ICON: Record<string, any> = { text: Type, media: ImageIcon, buttons: MousePointerClick, list: List };

/** Picker modal (portal — escapes the React Flow transform). */
function Picker({ onPick, onClose }: { onPick: (m: CustomMessage) => void; onClose: () => void }) {
  const [items, setItems] = useState<CustomMessage[] | null>(null);
  useEffect(() => { fetch('/api/custom-messages').then(r => r.ok ? r.json() : []).then(setItems).catch(() => setItems([])); }, []);
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-[#1f2c34] border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/8">
          <MessageSquareMore size={16} className="text-[#25D366]" />
          <span className="text-white font-semibold text-sm flex-1">Choose a custom message</span>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {items === null ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/30" /></div>
          ) : items.length === 0 ? (
            <p className="text-center text-white/40 text-xs py-10">No custom messages yet. Create them in Messages → Custom.</p>
          ) : items.map(m => {
            const Icon = TYPE_ICON[m.type] || Type; const opts = customMessageOptions(m);
            return (
              <button key={m.id} onClick={() => { onPick(m); onClose(); }}
                className="w-full text-left bg-[#0b141a] border border-white/8 rounded-lg p-2.5 hover:border-[#25D366]/50 transition-all">
                <div className="flex items-center gap-2">
                  <Icon size={12} className="text-[#25D366] shrink-0" />
                  <span className="text-white text-xs font-medium truncate">{m.name}</span>
                  {opts.length > 0 && <span className="text-[9px] text-white/40 ml-auto shrink-0">{opts.length} option{opts.length !== 1 ? 's' : ''}</span>}
                </div>
                <p className="text-white/40 text-[10px] mt-1 line-clamp-2 whitespace-pre-wrap">{renderCustomPreview(m)}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Sends a saved custom (in-session) message. If it has options (list/buttons),
// wire it through a Button Router to branch per option.
export default function CustomNode({ id, data, selected }: NodeProps) {
  const { deleteElements, updateNodeData } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const [picking, setPicking] = useState(false);

  const label   = (data.label as string) || '';
  const optType = (data.optType as string) || '';
  const options = (data.options as string[]) || [];
  const Icon    = TYPE_ICON[optType] || MessageSquareMore;

  const pick = async (m: CustomMessage) => {
    // Manual options come from the message; dynamic (category/product) lists pull
    // their option names live so the flow can branch per category/product.
    let options = customMessageOptions(m);
    if (m.optionSource === 'categories') {
      const cats = await fetch('/api/categories').then(r => r.ok ? r.json() : []).catch(() => []);
      options = (cats as { name: string }[]).map(c => c.name).slice(0, 10);
    } else if (m.optionSource === 'products') {
      const prods = await fetch('/api/inventory').then(r => r.ok ? r.json() : []).catch(() => []);
      options = (prods as { name: string; parentId: string | null }[]).filter(p => !p.parentId).map(p => p.name).slice(0, 10);
    }
    updateNodeData(id, { customMessageId: m.id, label: m.name, optType: m.type, options });
  };

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      className={`bg-[#0e2a1d] border rounded-xl w-[240px] shadow-xl transition-all ${selected ? 'border-[#25D366]/70 shadow-[0_0_0_3px_rgba(37,211,102,0.12)]' : 'border-[#25D366]/30 hover:border-[#25D366]/55'}`}>
      <Handle type="target" position={Position.Top} style={{ background: '#25D366', border: '2.5px solid #0e2a1d', width: 13, height: 13, top: -7 }} />

      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-[#25D366]/10">
        <div className="w-7 h-7 bg-[#25D366]/15 rounded-lg flex items-center justify-center shrink-0">
          <MessageSquareMore size={13} className="text-[#25D366]" />
        </div>
        <span className="flex-1 min-w-0 text-[#d7f5e3] text-[11px] font-semibold truncate">Custom message</span>
        <button style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }} onClick={() => deleteElements({ nodes: [{ id }] })}
          className="p-0.5 rounded hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors"><X size={11} /></button>
      </div>

      <div className="px-3 py-2.5 space-y-2 nodrag">
        {label ? (
          <>
            <div className="flex items-center gap-1.5">
              <Icon size={11} className="text-[#25D366] shrink-0" />
              <span className="text-white text-xs font-medium truncate">{label}</span>
            </div>
            {options.length > 0 ? (
              <div className="space-y-1">
                <p className="text-white/30 text-[9px] uppercase tracking-wider">Options (wire via a Yes/No or Multi-Path router)</p>
                <div className="flex flex-wrap gap-1">
                  {options.map((o, i) => <span key={i} className="text-[9px] bg-white/8 text-white/60 px-1.5 py-0.5 rounded-full">{o}</span>)}
                </div>
              </div>
            ) : (
              <p className="text-[#25D366]/40 text-[9px]">Sends, then continues to the next node.</p>
            )}
            <button onClick={() => setPicking(true)} className="text-[10px] text-[#25D366]/80 hover:text-[#25D366]">Change message</button>
          </>
        ) : (
          <button onClick={() => setPicking(true)}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-dashed border-[#25D366]/30 text-[#25D366]/80 text-[11px] hover:bg-[#25D366]/10 transition-all">
            <MessageSquareMore size={12} /> Choose a message
          </button>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#25D366', border: '2.5px solid #0e2a1d', width: 13, height: 13, bottom: -7 }} />
      {picking && <Picker onPick={pick} onClose={() => setPicking(false)} />}
    </div>
  );
}
