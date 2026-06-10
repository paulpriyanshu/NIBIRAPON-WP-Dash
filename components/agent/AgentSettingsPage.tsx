'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Bot, Package, MessageSquarePlus, Save, Plus, Trash2,
  Pencil, Check, Loader2, ChevronDown, ChevronUp,
  Sparkles, Info, Tag, Layers, Calendar, ArrowUpRight,
  StickyNote, ImageIcon, Film,
} from 'lucide-react';
import NextLink from 'next/link';
import type { TemplateMessage } from '@/lib/templates';

/* ── types ───────────────────────────────────────────────────────── */

interface AgentSettings { agentName: string; systemPrompt: string; }

interface ProductMedia {
  type: 'image' | 'video';
  url?: string; assetId?: string; mimeType?: string; description?: string;
}

interface Product {
  id: string; name: string; description: string | null;
  priceRange: string | null; category: string | null;
  fabric: string | null; occasions: string | null;
  media: ProductMedia[]; customInfo: string | null;
  isActive: boolean; inAgentContext: boolean; syncedAt: string | null;
}

interface Draft {
  id: string; name: string; kind?: 'text' | 'template'; content: string;
  triggerHint: string | null; isActive: boolean;
  templateMessageId?: string | null;
}

/** Browser-renderable source for a media item. */
function mediaSrc(m: ProductMedia): string {
  if (m.assetId) return `/api/inventory/media/${m.assetId}`;
  return m.url || '';
}

type Tab = 'general' | 'catalog' | 'drafts';

/* ── small shared components ─────────────────────────────────────── */

function TabBtn({ label, icon: Icon, active, onClick, count }: {
  label: string; icon: React.ElementType; active: boolean;
  onClick: () => void; count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
        active
          ? 'border-[#25D366] text-[#25D366]'
          : 'border-transparent text-white/40 hover:text-white/70 hover:border-white/20'
      }`}
    >
      <Icon size={14} />
      {label}
      {count !== undefined && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-white/10 text-white/40'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ── General tab ─────────────────────────────────────────────────── */

function GeneralTab() {
  const [settings, setSettings] = useState<AgentSettings>({ agentName: 'Riya', systemPrompt: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/agent/settings')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSettings({ agentName: d.agentName ?? 'Riya', systemPrompt: d.systemPrompt ?? '' }));
  }, []);

  const save = async () => {
    setSaving(true);
    await fetch('/api/agent/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="bg-[#1f2c34] border border-white/10 rounded-xl p-5">
        <h3 className="text-white font-semibold text-sm mb-1">Agent Identity</h3>
        <p className="text-white/40 text-xs mb-4">The name Riya uses when introducing herself to customers.</p>
        <input
          value={settings.agentName}
          onChange={e => setSettings(s => ({ ...s, agentName: e.target.value }))}
          placeholder="e.g. Riya"
          className="w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#25D366]/50 transition-colors"
        />
      </div>

      <div className="bg-[#1f2c34] border border-white/10 rounded-xl p-5">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-white font-semibold text-sm">Custom Instructions</h3>
            <p className="text-white/40 text-xs mt-0.5">
              Additional rules appended to the base prompt. The base prompt (brand context, language rules, topic guardrails) always applies.
            </p>
          </div>
        </div>

        <div className="mt-4 bg-[#111b21] border border-white/8 rounded-lg px-3 py-2 mb-4">
          <p className="text-[#25D366]/60 text-[10px] font-medium uppercase tracking-wider mb-1">Base context (always active)</p>
          <p className="text-white/30 text-[10px] leading-relaxed">
            Nibirapon by FemFashion · premium saree brand · replies in Hindi or English · stays on-topic to sarees/fashion
          </p>
        </div>

        <textarea
          value={settings.systemPrompt}
          onChange={e => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
          placeholder={"Add extra instructions…\ne.g. Always mention free shipping on orders above ₹5000.\nPrioritize Banarasi sarees for wedding inquiries."}
          rows={7}
          className="w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2.5 text-white/80 text-sm leading-relaxed placeholder:text-white/20 focus:outline-none focus:border-[#25D366]/50 resize-none transition-colors"
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${
            saved ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-[#25D366] text-black hover:bg-[#22c55e]'
          }`}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

/* ── Catalog tab — selects which inventory products the agent can use ── */

function CatalogTab() {
  const [products,   setProducts]   = useState<Product[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [syncing,    setSyncing]    = useState(false);
  const [syncResult, setSyncResult] = useState('');
  const [expanded,   setExpanded]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inventory');
    if (res.ok) setProducts(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleContext = async (p: Product) => {
    setTogglingId(p.id);
    // optimistic
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, inAgentContext: !x.inAgentContext } : x));
    await fetch(`/api/inventory/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inAgentContext: !p.inAgentContext }),
    });
    setTogglingId(null);
    load();
  };

  const sync = async () => {
    setSyncing(true); setSyncResult('');
    const res = await fetch('/api/agent/sync', { method: 'POST' });
    const data = await res.json();
    setSyncing(false);
    setSyncResult(res.ok ? `✓ Synced ${data.synced} product${data.synced !== 1 ? 's' : ''} to AI` : `Error: ${data.error}`);
    load();
    setTimeout(() => setSyncResult(''), 5000);
  };

  const inContext   = products.filter(p => p.inAgentContext);
  const unsynced    = inContext.filter(p => !p.syncedAt).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <Sparkles size={14} className="text-[#25D366]" />
            Agent Catalog
          </h3>
          <p className="text-white/35 text-[11px] mt-0.5">
            {inContext.length} of {products.length} product{products.length !== 1 ? 's' : ''} in the agent's context
            {syncResult && (
              <span className={`ml-2 ${syncResult.startsWith('✓') ? 'text-[#25D366]' : 'text-red-400'}`}>{syncResult}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={sync} disabled={syncing || inContext.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 disabled:opacity-40 transition-all">
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {syncing ? 'Syncing…' : 'Sync to AI'}
          </button>
          <NextLink href="/inventory"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#25D366] text-black hover:bg-[#22c55e] transition-all">
            <ArrowUpRight size={12} /> Manage inventory
          </NextLink>
        </div>
      </div>

      <div className="bg-[#111b21] border border-white/8 rounded-xl px-4 py-3 flex gap-2">
        <Info size={12} className="text-white/30 shrink-0 mt-0.5" />
        <p className="text-white/35 text-[11px] leading-relaxed">
          Add products to the agent's context, then <strong className="text-white/50">Sync to AI</strong>. The agent answers from and sends photos/videos of only the products you add here. Create or edit products in <strong className="text-white/50">Inventory</strong>.
        </p>
      </div>

      {unsynced > 0 && (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-2.5 flex gap-2 items-start">
          <Info size={12} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300/80 text-xs">
            {unsynced} product{unsynced > 1 ? 's' : ''} in context not synced. Click <strong>Sync to AI</strong> so the agent can use them.
          </p>
        </div>
      )}

      {loading ? (
        [...Array(3)].map((_, i) => <div key={i} className="h-14 bg-[#1f2c34] rounded-xl animate-pulse" />)
      ) : products.length === 0 ? (
        <div className="text-center py-10 text-white/20">
          <Package size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs">No products in inventory yet</p>
          <NextLink href="/inventory" className="text-[#25D366] text-xs mt-2 inline-block hover:underline">Go to Inventory →</NextLink>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map(p => {
            const m0 = p.media?.[0];
            return (
              <div key={p.id} className={`bg-[#1f2c34] border rounded-xl overflow-hidden ${p.inAgentContext ? 'border-[#25D366]/30' : 'border-white/8'}`}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
                  onClick={() => setExpanded(e => e === p.id ? null : p.id)}>
                  <div className="w-9 h-9 rounded-md overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                    {m0
                      ? (m0.type === 'video'
                          ? <video src={mediaSrc(m0)} className="w-full h-full object-cover" muted />
                          // eslint-disable-next-line @next/next/no-img-element
                          : <img src={mediaSrc(m0)} alt="" className="w-full h-full object-cover" />)
                      : <Package size={15} className="text-white/20" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-xs font-medium truncate">{p.name}</p>
                      {p.inAgentContext && p.syncedAt && (
                        <span className="text-[9px] bg-[#25D366]/15 text-[#25D366] px-1.5 py-0.5 rounded-full shrink-0">Synced</span>
                      )}
                      {p.inAgentContext && !p.syncedAt && (
                        <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full shrink-0">Not synced</span>
                      )}
                      {p.media?.length > 0 && (
                        <span className="text-[9px] bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                          {p.media.some(m => m.type === 'video') ? <Film size={8} /> : <ImageIcon size={8} />}
                          {p.media.length}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-white/30 text-[10px]">
                      {p.category   && <span>{p.category}</span>}
                      {p.priceRange && <span>· {p.priceRange}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => toggleContext(p)}
                      disabled={togglingId === p.id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                        p.inAgentContext
                          ? 'bg-white/5 text-white/50 hover:bg-red-500/10 hover:text-red-400 border border-white/10'
                          : 'bg-[#25D366] text-black hover:bg-[#22c55e]'
                      } disabled:opacity-50`}
                    >
                      {togglingId === p.id ? <Loader2 size={10} className="animate-spin" />
                        : p.inAgentContext ? <><Check size={10} /> In context</>
                        : <><Plus size={10} /> Add</>}
                    </button>
                    {expanded === p.id ? <ChevronUp size={13} className="text-white/25 ml-1" /> : <ChevronDown size={13} className="text-white/25 ml-1" />}
                  </div>
                </div>

                {expanded === p.id && (
                  <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-2.5">
                    {p.description && <p className="text-white/50 text-xs leading-relaxed">{p.description}</p>}
                    <div className="flex flex-wrap gap-3 text-[10px] text-white/30">
                      {p.fabric    && <span className="flex items-center gap-1"><Layers size={9} /> {p.fabric}</span>}
                      {p.occasions && <span className="flex items-center gap-1"><Calendar size={9} /> {p.occasions}</span>}
                    </div>
                    {p.customInfo && (
                      <div className="bg-purple-500/8 border border-purple-500/15 rounded-lg px-3 py-2">
                        <p className="text-purple-400/70 text-[9px] uppercase tracking-wider mb-1 flex items-center gap-1">
                          <StickyNote size={9} /> Agent Notes
                        </p>
                        <p className="text-purple-200/60 text-[11px] leading-relaxed">{p.customInfo}</p>
                      </div>
                    )}
                    {p.media?.length > 0 && (
                      <div className="grid grid-cols-5 gap-2">
                        {p.media.map((m, i) => (
                          <div key={i} className="aspect-square rounded-lg overflow-hidden bg-white/5">
                            {m.type === 'video'
                              ? <video src={mediaSrc(m)} className="w-full h-full object-cover" muted />
                              // eslint-disable-next-line @next/next/no-img-element
                              : <img src={mediaSrc(m)} alt="" className="w-full h-full object-cover" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Drafts tab ──────────────────────────────────────────────────── */

const EMPTY_DRAFT = { name: '', content: '', triggerHint: '' };

function DraftForm({
  initial, onSave, onCancel, loading,
}: {
  initial?: Partial<typeof EMPTY_DRAFT>;
  onSave: (d: typeof EMPTY_DRAFT) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({ ...EMPTY_DRAFT, ...initial });
  const set = (k: keyof typeof EMPTY_DRAFT) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="bg-[#1f2c34] border border-purple-400/30 rounded-xl p-4 space-y-3">
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Draft Name *</label>
        <input value={form.name} onChange={set('name')} placeholder="e.g. UPI Payment QR Code"
          className="w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-purple-400/50 transition-colors" />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Trigger Hint</label>
        <input value={form.triggerHint} onChange={set('triggerHint')}
          placeholder="When should agent send this? e.g. when customer wants to pay"
          className="w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-purple-400/50 transition-colors" />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Message Content *</label>
        <textarea value={form.content} onChange={set('content')} rows={5}
          placeholder={"Full message the agent will send verbatim.\ne.g. To pay via UPI, please scan the QR code below:\n[paste QR image or UPI ID here]\nUPI ID: yourname@upi"}
          className="w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs leading-relaxed placeholder:text-white/20 focus:outline-none focus:border-purple-400/50 resize-none transition-colors" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg text-xs text-white/40 hover:text-white hover:bg-white/5 transition-all">Cancel</button>
        <button onClick={() => onSave(form)} disabled={loading || !form.name.trim() || !form.content.trim()}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-purple-500 text-white font-medium hover:bg-purple-400 disabled:opacity-40 transition-all">
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Save Draft
        </button>
      </div>
    </div>
  );
}

/* ── Template draft form — pick a saved template message ─────────── */

const draftInput = 'w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-purple-400/50 transition-colors';

interface TemplateDraftData {
  name: string; triggerHint: string; templateMessageId: string;
}

function TemplateDraftForm({ messages, initial, onSave, onCancel, loading }: {
  messages: TemplateMessage[];
  initial?: Partial<TemplateDraftData>;
  onSave: (d: TemplateDraftData) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName]                       = useState(initial?.name ?? '');
  const [triggerHint, setTriggerHint]         = useState(initial?.triggerHint ?? '');
  const [templateMessageId, setTemplateMessageId] = useState(initial?.templateMessageId ?? '');
  const [err, setErr] = useState('');

  const selected = messages.find(m => m.id === templateMessageId);

  const save = async () => {
    if (!name.trim()) { setErr('Name is required'); return; }
    if (!templateMessageId) { setErr('Pick a saved message'); return; }
    setErr('');
    await onSave({ name: name.trim(), triggerHint, templateMessageId });
  };

  return (
    <div className="bg-[#1f2c34] border border-purple-400/30 rounded-xl p-4 space-y-3">
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Draft Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Diwali offer template" className={draftInput} />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Saved message *</label>
        <select value={templateMessageId} onChange={e => setTemplateMessageId(e.target.value)} className={draftInput}>
          <option value="">Select a saved message…</option>
          {messages.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.templateName})</option>
          ))}
        </select>
        {messages.length === 0 ? (
          <p className="text-amber-400/70 text-[10px] mt-1">No saved messages yet — create one in <NextLink href="/templates" className="underline">Templates → Messages</NextLink>.</p>
        ) : (
          <p className="text-white/30 text-[10px] mt-1">Compose new ones in <NextLink href="/templates" className="text-purple-300 hover:underline">Templates → Messages</NextLink>.</p>
        )}
      </div>

      {selected && (
        <div className="bg-[#111b21] border border-white/8 rounded-lg p-3">
          <p className="text-white/30 text-[9px] uppercase tracking-wider mb-1">Preview</p>
          <p className="text-white/60 text-[11px] leading-relaxed whitespace-pre-wrap">{selected.preview || '(no preview)'}</p>
        </div>
      )}

      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">When to send / instructions for the agent</label>
        <textarea value={triggerHint} onChange={e => setTriggerHint(e.target.value)} rows={2}
          placeholder="e.g. Send when the customer asks about the Diwali offer or wants the latest collection"
          className={`${draftInput} resize-none leading-relaxed`} />
      </div>

      {err && <p className="text-red-400 text-[11px]">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg text-xs text-white/40 hover:text-white hover:bg-white/5 transition-all">Cancel</button>
        <button onClick={save} disabled={loading || !name.trim() || !templateMessageId}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-purple-500 text-white font-medium hover:bg-purple-400 disabled:opacity-40 transition-all">
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save Template Draft
        </button>
      </div>
    </div>
  );
}

function DraftsTab() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [messages, setMessages] = useState<TemplateMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showTmplForm, setShowTmplForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [dRes, mRes] = await Promise.all([fetch('/api/agent/drafts'), fetch('/api/template-messages')]);
    if (dRes.ok) setDrafts(await dRes.json());
    if (mRes.ok) setMessages(await mRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (data: object) => {
    setSaving(true);
    await fetch('/api/agent/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setSaving(false); setShowForm(false); setShowTmplForm(false); load();
  };
  const update = async (id: string, data: object) => {
    setSaving(true);
    await fetch(`/api/agent/drafts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setSaving(false); setEditId(null); load();
  };
  const deleteDraft = async (id: string) => {
    if (!confirm('Delete this draft?')) return;
    await fetch(`/api/agent/drafts/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <p className="text-white/40 text-xs">{drafts.length} draft{drafts.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowForm(true); setShowTmplForm(false); setEditId(null); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-purple-400/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-all">
            <Plus size={12} /> Text Draft
          </button>
          <button onClick={() => { setShowTmplForm(true); setShowForm(false); setEditId(null); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-purple-500 text-white hover:bg-purple-400 transition-all">
            <Layers size={12} /> Template Draft
          </button>
        </div>
      </div>

      <div className="bg-[#111b21] border border-white/8 rounded-xl px-4 py-3 flex gap-2">
        <Info size={12} className="text-white/30 shrink-0 mt-0.5" />
        <p className="text-white/35 text-[11px] leading-relaxed">
          Drafts are things the agent can send: a <strong className="text-white/50">text</strong> snippet (sent verbatim) or a fully-filled <strong className="text-white/50">template</strong>. Add a clear <strong className="text-white/50">when-to-send</strong> note so the agent knows the right moment (e.g. "when the customer wants to pay").
        </p>
      </div>

      {showForm && <DraftForm onSave={d => create({ ...d, kind: 'text' })} onCancel={() => setShowForm(false)} loading={saving} />}
      {showTmplForm && <TemplateDraftForm messages={messages} onSave={d => create({ ...d, kind: 'template' })} onCancel={() => setShowTmplForm(false)} loading={saving} />}

      {loading ? (
        [...Array(2)].map((_, i) => <div key={i} className="h-20 bg-[#1f2c34] rounded-xl animate-pulse" />)
      ) : drafts.length === 0 && !showForm && !showTmplForm ? (
        <div className="text-center py-16 text-white/20">
          <MessageSquarePlus size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No drafts yet</p>
          <p className="text-xs mt-1 text-white/15">Text (UPI QR, return policy) or a ready-to-send template</p>
        </div>
      ) : (
        drafts.map(d => {
          const isTemplate = d.kind === 'template';
          return (
            <div key={d.id} className="bg-[#1f2c34] border border-white/8 rounded-xl overflow-hidden">
              {editId === d.id && !isTemplate ? (
                <div className="p-3">
                  <DraftForm initial={{ name: d.name, content: d.content, triggerHint: d.triggerHint ?? '' }}
                    onSave={data => update(d.id, { ...data, kind: 'text' })} onCancel={() => setEditId(null)} loading={saving} />
                </div>
              ) : editId === d.id && isTemplate ? (
                <div className="p-3">
                  <TemplateDraftForm messages={messages}
                    initial={{ name: d.name, triggerHint: d.triggerHint ?? '', templateMessageId: d.templateMessageId ?? '' }}
                    onSave={data => update(d.id, { ...data, kind: 'template' })} onCancel={() => setEditId(null)} loading={saving} />
                </div>
              ) : (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-medium">{d.name}</p>
                        {isTemplate
                          ? <span className="text-[9px] bg-purple-500/15 text-purple-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Layers size={8} /> Template</span>
                          : <span className="text-[9px] bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full">Text</span>}
                      </div>
                      {d.triggerHint && (
                        <p className="text-purple-400/70 text-[10px] mt-0.5 flex items-center gap-1">
                          <Tag size={9} /> {d.triggerHint}
                        </p>
                      )}
                      {isTemplate
                        ? (() => {
                            const msg = messages.find(m => m.id === d.templateMessageId);
                            return msg
                              ? <p className="text-white/40 text-[11px] mt-2">Sends saved message <strong className="text-white/60">{msg.name}</strong> · template {msg.templateName}</p>
                              : <p className="text-amber-400/70 text-[11px] mt-2">⚠ Linked saved message was deleted — pick another.</p>;
                          })()
                        : <p className="text-white/40 text-[11px] mt-2 leading-relaxed line-clamp-3 whitespace-pre-wrap">{d.content}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditId(d.id)} className="p-1.5 rounded-lg text-white/25 hover:text-purple-400 hover:bg-purple-500/10 transition-all">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteDraft(d.id)} className="p-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */

export default function AgentSettingsPage() {
  const [tab, setTab] = useState<Tab>('catalog');

  return (
    <div className="h-full flex flex-col bg-[#0b141a] overflow-hidden">
      {/* Page header */}
      <div className="px-6 pt-6 pb-0 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-[#25D366]/15 rounded-xl flex items-center justify-center">
            <Bot size={18} className="text-[#25D366]" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">Agent Settings</h1>
            <p className="text-white/40 text-xs">Manage Riya's knowledge, personality and pre-written messages</p>
          </div>
        </div>

        <div className="flex gap-0 border-b-0">
          <TabBtn label="General"  icon={Bot}              active={tab === 'general'}  onClick={() => setTab('general')} />
          <TabBtn label="Catalog"  icon={Package}          active={tab === 'catalog'}  onClick={() => setTab('catalog')} />
          <TabBtn label="Drafts"   icon={MessageSquarePlus} active={tab === 'drafts'}   onClick={() => setTab('drafts')} />
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {tab === 'general' && <GeneralTab />}
        {tab === 'catalog' && <CatalogTab />}
        {tab === 'drafts'  && <DraftsTab />}
      </div>
    </div>
  );
}
