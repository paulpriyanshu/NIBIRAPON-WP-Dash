'use client';
import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, X, Loader2, Check, Image as ImageIcon, MessageSquare, List, MousePointerClick, Type, Send } from 'lucide-react';
import MediaPicker, { type PickedMedia } from '@/components/flow/MediaPicker';
import { renderCustomPreview, customMessageOptions, type CustomMessage, type CustomMessageType } from '@/lib/custom-messages';

const TYPE_META: Record<CustomMessageType, { label: string; icon: any; hint: string }> = {
  text:    { label: 'Text',         icon: Type,               hint: 'A plain text message.' },
  media:   { label: 'Media',        icon: ImageIcon,          hint: 'A photo or video with an optional caption.' },
  buttons: { label: 'Reply buttons',icon: MousePointerClick,  hint: 'Body text + up to 3 tappable buttons.' },
  list:    { label: 'Option list',  icon: List,               hint: 'A tappable list of options grouped in sections.' },
};

type Draft = Omit<CustomMessage, 'id' | 'createdAt' | 'updatedAt'>;
const EMPTY: Draft = { name: '', type: 'text', body: '', isActive: true, buttons: [], sections: [{ rows: [{ title: '' }] }], listButton: 'View options', optionSource: 'manual' };

function SourceSelector({ value, onChange }: { value: 'manual' | 'categories' | 'products'; onChange: (v: 'manual' | 'categories' | 'products') => void }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">Options come from</label>
      <div className="grid grid-cols-3 gap-2">
        {(['manual', 'categories', 'products'] as const).map(s => (
          <button key={s} type="button" onClick={() => onChange(s)}
            className={`py-1.5 rounded-lg border text-[11px] font-medium capitalize transition-all ${value === s ? 'border-wp-green bg-wp-green/10 text-wp-green' : 'border-gray-200 dark:border-[#2a3942] text-gray-500 dark:text-[#8696a0] hover:bg-gray-50 dark:hover:bg-[#1f2c34]'}`}>
            {s === 'manual' ? 'Manual' : s}
          </button>
        ))}
      </div>
      {value !== 'manual' && (
        <p className="text-[11px] text-gray-400 dark:text-[#667781] mt-1.5 leading-relaxed">
          Options are pulled live from your {value}. When the customer taps one, they automatically get its image &amp; details{value === 'categories' ? ' (a category drills down to its products)' : ''}.
        </p>
      )}
    </div>
  );
}

const fieldCls = 'w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] rounded-lg px-3 py-2 text-sm outline-none focus:border-wp-green transition-colors';

/* ── Editor modal ─────────────────────────────────────────────────── */

function Editor({ initial, onClose, onSaved }: { initial: CustomMessage | null; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(initial ? { ...EMPTY, ...initial } : { ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const set = (patch: Partial<Draft>) => setD(p => ({ ...p, ...patch }));

  const save = async () => {
    if (!d.name.trim()) return;
    setSaving(true);
    const url = initial ? `/api/custom-messages/${initial.id}` : '/api/custom-messages';
    await fetch(url, { method: initial ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
    setSaving(false); onSaved();
  };

  // buttons helpers
  const setBtn = (i: number, title: string) => set({ buttons: (d.buttons ?? []).map((b, idx) => idx === i ? { title } : b) });
  const addBtn = () => set({ buttons: [...(d.buttons ?? []), { title: '' }] });
  const rmBtn = (i: number) => set({ buttons: (d.buttons ?? []).filter((_, idx) => idx !== i) });

  // list helpers (single section for simplicity; multiple supported by data model)
  const sections = d.sections ?? [{ rows: [{ title: '' }] }];
  const setRow = (si: number, ri: number, patch: Partial<{ title: string; description: string }>) =>
    set({ sections: sections.map((s, i) => i === si ? { ...s, rows: s.rows.map((r, j) => j === ri ? { ...r, ...patch } : r) } : s) });
  const addRow = (si: number) => set({ sections: sections.map((s, i) => i === si ? { ...s, rows: [...s.rows, { title: '' }] } : s) });
  const rmRow = (si: number, ri: number) => set({ sections: sections.map((s, i) => i === si ? { ...s, rows: s.rows.filter((_, j) => j !== ri) } : s) });

  const preview = renderCustomPreview({ ...(d as any), id: '' });
  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#111b21] rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#2a3942]">
          <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef]">{initial ? 'Edit' : 'New'} custom message</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1f2c34]"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">Name</label>
            <input value={d.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Pick a category" className={fieldCls} />
          </div>

          {/* Agent guidance — so Riya knows what this is and when to send it */}
          <div className="rounded-lg border border-wp-green/30 bg-wp-green/5 p-3 space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">What is this message for? <span className="text-gray-400 normal-case font-normal">(helps the AI agent)</span></label>
              <textarea value={d.agentDescription ?? ''} onChange={e => set({ agentDescription: e.target.value })} rows={2}
                placeholder="e.g. Asks the customer which saree category they want — the opening question before showing products"
                className={`${fieldCls} resize-none`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">When should the agent send it?</label>
              <textarea value={d.triggerHint ?? ''} onChange={e => set({ triggerHint: e.target.value })} rows={2}
                placeholder="e.g. Early in the chat when the customer is browsing or unsure what they want"
                className={`${fieldCls} resize-none`} />
            </div>
          </div>

          {/* type selector */}
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(TYPE_META) as CustomMessageType[]).map(t => {
              const M = TYPE_META[t]; const Icon = M.icon; const active = d.type === t;
              return (
                <button key={t} onClick={() => set({ type: t })}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[11px] font-medium transition-all ${active ? 'border-wp-green bg-wp-green/10 text-wp-green' : 'border-gray-200 dark:border-[#2a3942] text-gray-500 dark:text-[#8696a0] hover:bg-gray-50 dark:hover:bg-[#1f2c34]'}`}>
                  <Icon size={16} /> {M.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-[#667781] -mt-2">{TYPE_META[d.type].hint}</p>

          {/* media */}
          {d.type === 'media' && (
            <div className="space-y-2">
              {d.media ? (
                <div className="flex items-center gap-3 border border-gray-200 dark:border-[#2a3942] rounded-lg p-2">
                  <div className="w-16 h-16 rounded-md overflow-hidden bg-gray-100 dark:bg-[#1f2c34] shrink-0">
                    {d.media.type === 'video'
                      ? <video src={d.media.assetId ? `/api/inventory/media/${d.media.assetId}` : d.media.url} className="w-full h-full object-cover" muted />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={d.media.assetId ? `/api/inventory/media/${d.media.assetId}` : d.media.url} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-[#8696a0] flex-1">{d.media.type}</span>
                  <button onClick={() => set({ media: null })} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              ) : (
                <button onClick={() => setPicking(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2a3942] text-sm text-gray-500 dark:text-[#8696a0] hover:bg-gray-50 dark:hover:bg-[#1f2c34]">
                  <ImageIcon size={14} /> Choose from Media
                </button>
              )}
              <input value={d.caption ?? ''} onChange={e => set({ caption: e.target.value })} placeholder="Caption (optional)" className={fieldCls} />
            </div>
          )}

          {/* media header (buttons only — WhatsApp shows it above the text + buttons) */}
          {d.type === 'buttons' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block">Header image / video <span className="text-gray-400 normal-case font-normal">(optional)</span></label>
              {d.media ? (
                <div className="flex items-center gap-3 border border-gray-200 dark:border-[#2a3942] rounded-lg p-2">
                  <div className="w-16 h-16 rounded-md overflow-hidden bg-gray-100 dark:bg-[#1f2c34] shrink-0">
                    {d.media.type === 'video'
                      ? <video src={d.media.assetId ? `/api/inventory/media/${d.media.assetId}` : d.media.url} className="w-full h-full object-cover" muted />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={d.media.assetId ? `/api/inventory/media/${d.media.assetId}` : d.media.url} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-[#8696a0] flex-1">{d.media.type} header</span>
                  <button onClick={() => set({ media: null })} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              ) : (
                <button onClick={() => setPicking(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2a3942] text-sm text-gray-500 dark:text-[#8696a0] hover:bg-gray-50 dark:hover:bg-[#1f2c34]">
                  <ImageIcon size={14} /> Add a photo / video header
                </button>
              )}
            </div>
          )}

          {/* text header (buttons without a media header, or list) */}
          {((d.type === 'buttons' && !d.media) || d.type === 'list') && (
            <input value={d.header ?? ''} onChange={e => set({ header: e.target.value })} placeholder="Header text (optional)" className={fieldCls} />
          )}

          {/* body (text/buttons/list) */}
          {d.type !== 'media' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">Body</label>
              <textarea value={d.body ?? ''} onChange={e => set({ body: e.target.value })} rows={3} placeholder="The message text…" className={`${fieldCls} resize-none`} />
            </div>
          )}

          {/* buttons */}
          {d.type === 'buttons' && (
            <div className="space-y-2">
              <SourceSelector value={d.optionSource ?? 'manual'} onChange={v => set({ optionSource: v })} />
              {d.optionSource !== 'manual' ? null : (<>
              <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block">Buttons ({(d.buttons ?? []).length}/3)</label>
              {(d.buttons ?? []).map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={b.title} maxLength={20} onChange={e => setBtn(i, e.target.value)} placeholder={`Button ${i + 1}`} className={fieldCls} />
                  <button onClick={() => rmBtn(i)} className="p-1.5 text-gray-400 hover:text-red-500"><X size={14} /></button>
                </div>
              ))}
              {(d.buttons ?? []).length < 3 && <button onClick={addBtn} className="text-xs text-wp-green flex items-center gap-1"><Plus size={12} /> Add button</button>}
              </>)}
            </div>
          )}

          {/* list */}
          {d.type === 'list' && (
            <div className="space-y-2">
              <input value={d.listButton ?? ''} onChange={e => set({ listButton: e.target.value })} maxLength={20} placeholder="List button label (e.g. View options)" className={fieldCls} />
              <SourceSelector value={d.optionSource ?? 'manual'} onChange={v => set({ optionSource: v })} />
              {d.optionSource !== 'manual' ? null : (<>
              <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block">Options ({totalRows}/10)</label>
              {sections.map((s, si) => (
                <div key={si} className="space-y-2">
                  {s.rows.map((r, ri) => (
                    <div key={ri} className="flex items-center gap-2">
                      <input value={r.title} maxLength={24} onChange={e => setRow(si, ri, { title: e.target.value })} placeholder="Option title" className={fieldCls} />
                      <input value={r.description ?? ''} maxLength={72} onChange={e => setRow(si, ri, { description: e.target.value })} placeholder="Description (optional)" className={fieldCls} />
                      <button onClick={() => rmRow(si, ri)} className="p-1.5 text-gray-400 hover:text-red-500"><X size={14} /></button>
                    </div>
                  ))}
                  {totalRows < 10 && <button onClick={() => addRow(si)} className="text-xs text-wp-green flex items-center gap-1"><Plus size={12} /> Add option</button>}
                </div>
              ))}
              </>)}
            </div>
          )}

          {/* preview */}
          {preview && (
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">Preview</label>
              <div className="bg-[#e8f5e9] dark:bg-[#0d2a1a] rounded-xl p-3">
                <div className="bg-white dark:bg-[#1f2c34] rounded-xl shadow-sm p-3 text-[12px] text-[#111b21] dark:text-[#e9edef] whitespace-pre-wrap leading-relaxed max-w-xs">{preview}</div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-[#8696a0]">
            <input type="checkbox" checked={d.isActive} onChange={e => set({ isActive: e.target.checked })} className="accent-wp-green" />
            Available to the AI agent
          </label>
        </div>

        <div className="border-t border-gray-100 dark:border-[#2a3942] px-5 py-3.5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 dark:text-[#8696a0] rounded-lg hover:bg-gray-100 dark:hover:bg-[#1f2c34]">Cancel</button>
          <button onClick={save} disabled={saving || !d.name.trim()} className="flex items-center gap-2 px-4 py-2 bg-wp-green text-white text-sm font-medium rounded-lg hover:bg-[#22c55e] disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
          </button>
        </div>
      </div>

      {picking && <MediaPicker onPick={(m: PickedMedia) => set({ media: { type: m.type, assetId: m.assetId, url: m.url } })} onClose={() => setPicking(false)} />}
    </div>
  );
}

/* ── Test-send modal ──────────────────────────────────────────────── */

function TestSendModal({ message, onClose }: { message: CustomMessage; onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const send = async () => {
    if (!phone.trim()) return;
    setSending(true); setResult(null);
    try {
      const r = await fetch('/api/custom-messages/test-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: message.id, phone: phone.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      setResult(r.ok ? { ok: true, msg: 'Sent! Check WhatsApp.' } : { ok: false, msg: d.error || `Failed (${r.status})` });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Failed' });
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#111b21] rounded-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#2a3942]">
          <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef] text-sm">Send test — “{message.name}”</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1f2c34]"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Recipient phone (e.g. 9198XXXXXXXX)"
            onKeyDown={e => e.key === 'Enter' && send()} className={fieldCls} autoFocus />
          <p className="text-[11px] text-gray-400 dark:text-[#667781] leading-relaxed">
            Interactive messages only deliver inside an open 24-hour session — the number must have messaged you recently (or reply to a template first).
          </p>
          {result && (
            <p className={`text-xs ${result.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{result.msg}</p>
          )}
          <button onClick={send} disabled={sending || !phone.trim()}
            className="w-full flex items-center justify-center gap-2 bg-wp-green text-white text-sm font-medium py-2.5 rounded-xl hover:bg-[#22c55e] disabled:opacity-50">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test message
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── List view ────────────────────────────────────────────────────── */

export default function CustomMessages() {
  const [msgs, setMsgs] = useState<CustomMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{ open: boolean; initial: CustomMessage | null }>({ open: false, initial: null });
  const [testing, setTesting] = useState<CustomMessage | null>(null);

  const load = async () => {
    setLoading(true);
    const r = await fetch('/api/custom-messages');
    if (r.ok) setMsgs(await r.json());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => { if (!confirm('Delete this custom message?')) return; await fetch(`/api/custom-messages/${id}`, { method: 'DELETE' }); load(); };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {editor.open && <Editor initial={editor.initial} onClose={() => setEditor({ open: false, initial: null })} onSaved={() => { setEditor({ open: false, initial: null }); load(); }} />}
      {testing && <TestSendModal message={testing} onClose={() => setTesting(null)} />}

      <div className="bg-blue-50 dark:bg-[#0d2a1a] border border-blue-100 dark:border-[#2a3942] rounded-xl px-4 py-3 flex gap-2">
        <MessageSquare size={14} className="text-blue-500 dark:text-wp-green shrink-0 mt-0.5" />
        <p className="text-xs text-gray-600 dark:text-[#8696a0] leading-relaxed">
          Custom <strong>in-session</strong> messages — option lists, reply buttons, text, or media. Use them in <strong>Flows</strong> (branch per option), let the <strong>Agent</strong> send them, or send manually from the <strong>Inbox</strong>. (They can't be broadcast — WhatsApp needs an approved template to open a chat.)
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-[#8696a0]">{msgs.length} custom message{msgs.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setEditor({ open: true, initial: null })} className="flex items-center gap-2 px-4 py-2 bg-wp-green text-white text-sm font-medium rounded-xl hover:bg-[#22c55e] transition-colors">
          <Plus size={16} /> New custom message
        </button>
      </div>

      {loading ? (
        [...Array(2)].map((_, i) => <div key={i} className="h-20 bg-gray-100 dark:bg-[#1f2c34] rounded-xl animate-pulse" />)
      ) : msgs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-[#667781]">
          <List size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No custom messages yet</p>
          <p className="text-xs mt-1 opacity-70">Create an option list, button prompt, or text/media message.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {msgs.map(m => {
            const Icon = TYPE_META[m.type].icon;
            const opts = customMessageOptions(m);
            return (
              <div key={m.id} className="bg-white dark:bg-[#111b21] border border-gray-100 dark:border-[#2a3942] rounded-xl p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef] truncate">{m.name}</p>
                    <span className="text-[9px] bg-gray-100 dark:bg-[#1f2c34] text-gray-500 dark:text-[#8696a0] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shrink-0"><Icon size={9} /> {TYPE_META[m.type].label}</span>
                    {!m.isActive && <span className="text-[9px] text-gray-400 px-1.5 py-0.5 rounded-full border border-gray-200 dark:border-[#2a3942]">agent off</span>}
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-[#8696a0] mt-1.5 leading-relaxed line-clamp-3 whitespace-pre-wrap">{renderCustomPreview(m)}</p>
                  {opts.length > 0 && <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-1.5">{opts.length} option{opts.length !== 1 ? 's' : ''}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setTesting(m)} className="p-1.5 rounded-lg text-gray-400 hover:text-wp-green hover:bg-gray-100 dark:hover:bg-[#1f2c34]" title="Send test"><Send size={14} /></button>
                  <button onClick={() => setEditor({ open: true, initial: m })} className="p-1.5 rounded-lg text-gray-400 hover:text-wp-dark dark:hover:text-wp-green hover:bg-gray-100 dark:hover:bg-[#1f2c34]" title="Edit"><Pencil size={14} /></button>
                  <button onClick={() => remove(m.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
