'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Bot, Package, MessageSquarePlus, Save, Plus, Trash2,
  RefreshCw, Pencil, X, Check, Loader2, ChevronDown, ChevronUp,
  Sparkles, Info, Tag, Layers, Calendar, Link, Download, ShoppingBag,
  StickyNote,
} from 'lucide-react';

/* ── types ───────────────────────────────────────────────────────── */

interface AgentSettings { agentName: string; systemPrompt: string; }

interface Product {
  id: string; name: string; description: string | null;
  priceRange: string | null; category: string | null;
  fabric: string | null; occasions: string | null;
  imageUrl: string | null; retailerId: string | null;
  customInfo: string | null; isActive: boolean;
  syncedAt: string | null;
}

interface WaProduct {
  waId: string; retailerId: string; name: string;
  description: string; priceRange: string;
  imageUrl: string | null; url: string | null;
  category: string | null; availability: string;
}

interface Draft {
  id: string; name: string; content: string;
  triggerHint: string | null; isActive: boolean;
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
    <div className="space-y-6 max-w-2xl">
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

/* ── Catalog tab ─────────────────────────────────────────────────── */

const EMPTY_PRODUCT = {
  name: '', description: '', priceRange: '', category: '',
  fabric: '', occasions: '', imageUrl: '', customInfo: '',
};

function ProductForm({
  initial, onSave, onCancel, loading,
}: {
  initial?: Partial<typeof EMPTY_PRODUCT>;
  onSave: (data: typeof EMPTY_PRODUCT) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({ ...EMPTY_PRODUCT, ...initial });
  const set = (k: keyof typeof EMPTY_PRODUCT) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const inputCls = 'w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-[#25D366]/50 transition-colors';

  return (
    <div className="bg-[#1f2c34] border border-[#25D366]/30 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Name *</label>
          <input value={form.name} onChange={set('name')} placeholder="e.g. Banarasi Silk Saree" className={inputCls} />
        </div>
        <div>
          <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Price Range</label>
          <input value={form.priceRange} onChange={set('priceRange')} placeholder="e.g. ₹8,000–₹35,000" className={inputCls} />
        </div>
        <div>
          <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Category</label>
          <input value={form.category} onChange={set('category')} placeholder="e.g. Silk, Cotton, Georgette" className={inputCls} />
        </div>
        <div>
          <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Fabric</label>
          <input value={form.fabric} onChange={set('fabric')} placeholder="e.g. Pure Silk, Blended" className={inputCls} />
        </div>
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Occasions</label>
        <input value={form.occasions} onChange={set('occasions')} placeholder="e.g. Wedding, Festival, Daily wear" className={inputCls} />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Description</label>
        <textarea value={form.description} onChange={set('description')} rows={2}
          placeholder="Full product description the agent will use to answer customer questions…"
          className={`${inputCls} resize-none leading-relaxed`} />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block flex items-center gap-1">
          <StickyNote size={9} /> Custom Info for Agent
        </label>
        <textarea value={form.customInfo} onChange={set('customInfo')} rows={2}
          placeholder="Extra notes only the agent should know — e.g. 'This saree runs slightly short, recommend for height under 5'4&quot;' or 'Limited stock: 3 pieces left in red'"
          className={`${inputCls} resize-none leading-relaxed border-purple-400/20 focus:border-purple-400/50`} />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Image URL (optional)</label>
        <input value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://…" className={inputCls} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg text-xs text-white/40 hover:text-white hover:bg-white/5 transition-all">Cancel</button>
        <button onClick={() => onSave(form)} disabled={loading || !form.name.trim()}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-[#25D366] text-black font-medium hover:bg-[#22c55e] disabled:opacity-40 transition-all">
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Save Product
        </button>
      </div>
    </div>
  );
}

function CatalogTab() {
  const [products,    setProducts]    = useState<Product[]>([]);
  const [waProducts,  setWaProducts]  = useState<WaProduct[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [waLoading,   setWaLoading]   = useState(false);
  const [waError,     setWaError]     = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [editId,      setEditId]      = useState<string | null>(null);
  const [addingId,    setAddingId]    = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [syncResult,  setSyncResult]  = useState('');
  const [expanded,    setExpanded]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/agent/catalog');
    if (res.ok) setProducts(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* fetch WhatsApp catalog */
  const loadWa = async () => {
    setWaLoading(true); setWaError('');
    const res = await fetch('/api/agent/catalog/whatsapp');
    if (res.ok) {
      setWaProducts(await res.json());
    } else {
      const d = await res.json();
      setWaError(d.error ?? 'Failed to fetch WhatsApp catalog');
    }
    setWaLoading(false);
  };

  /* check if a WA product is already in the local list */
  const isAdded = (retailerId: string) =>
    products.some(p => p.retailerId === retailerId);

  /* add a WA product to the local catalog */
  const addFromWa = async (wp: WaProduct) => {
    setAddingId(wp.retailerId);
    await fetch('/api/agent/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:        wp.name,
        description: wp.description,
        priceRange:  wp.priceRange,
        category:    wp.category ?? '',
        imageUrl:    wp.imageUrl,
        retailerId:  wp.retailerId,
      }),
    });
    setAddingId(null);
    load();
  };

  const addProduct = async (data: typeof EMPTY_PRODUCT) => {
    setSaving(true);
    await fetch('/api/agent/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setSaving(false); setShowForm(false); load();
  };

  const updateProduct = async (id: string, data: typeof EMPTY_PRODUCT) => {
    setSaving(true);
    await fetch(`/api/agent/catalog/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setSaving(false); setEditId(null); load();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    await fetch(`/api/agent/catalog/${id}`, { method: 'DELETE' });
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

  const syncedCount = products.filter(p => p.syncedAt).length;

  return (
    <div className="space-y-6">

      {/* ── Section 1: Import from WhatsApp ────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <ShoppingBag size={14} className="text-[#25D366]" />
              From WhatsApp Catalog
            </h3>
            <p className="text-white/35 text-[11px] mt-0.5">
              Click a product to load it, then click Add to put it in your AI catalog.
            </p>
          </div>
          <button
            onClick={loadWa}
            disabled={waLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-white/15 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-all"
          >
            {waLoading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {waLoading ? 'Loading…' : 'Load Products'}
          </button>
        </div>

        {waError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-red-400 text-xs mb-3">
            {waError}
          </div>
        )}

        {waProducts.length === 0 && !waLoading ? (
          <div className="bg-[#1f2c34] border border-dashed border-white/10 rounded-xl py-6 text-center text-white/25 text-xs">
            Click <strong className="text-white/40">Load Products</strong> to fetch from your WhatsApp catalog
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {waProducts.map(wp => {
              const added = isAdded(wp.retailerId);
              return (
                <div key={wp.waId} className={`flex items-center gap-3 bg-[#1f2c34] border rounded-xl px-4 py-3 transition-all ${added ? 'border-[#25D366]/25 opacity-70' : 'border-white/8 hover:border-white/20'}`}>
                  {wp.imageUrl && (
                    <img src={wp.imageUrl} alt={wp.name} className="w-10 h-10 rounded-lg object-cover shrink-0 bg-white/5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{wp.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {wp.priceRange && <span className="text-white/40 text-[10px]">{wp.priceRange}</span>}
                      {wp.category   && <span className="text-white/30 text-[10px]">· {wp.category}</span>}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${wp.availability === 'in stock' ? 'bg-[#25D366]/10 text-[#25D366]/70' : 'bg-red-500/10 text-red-400/70'}`}>
                        {wp.availability}
                      </span>
                    </div>
                    {wp.description && (
                      <p className="text-white/25 text-[10px] mt-0.5 line-clamp-1">{wp.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => !added && addFromWa(wp)}
                    disabled={added || addingId === wp.retailerId}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium shrink-0 transition-all ${
                      added
                        ? 'bg-[#25D366]/10 text-[#25D366] cursor-default'
                        : 'bg-[#25D366] text-black hover:bg-[#22c55e]'
                    } disabled:opacity-60`}
                  >
                    {addingId === wp.retailerId ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : added ? (
                      <><Check size={10} /> Added</>
                    ) : (
                      <><Plus size={10} /> Add</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 2: Your AI catalog ─────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <Sparkles size={14} className="text-[#25D366]" />
              Your AI Catalog
            </h3>
            <p className="text-white/35 text-[11px] mt-0.5">
              {products.length} product{products.length !== 1 ? 's' : ''} · {syncedCount} synced to AI
              {syncResult && (
                <span className={`ml-2 ${syncResult.startsWith('✓') ? 'text-[#25D366]' : 'text-red-400'}`}>
                  {syncResult}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={sync} disabled={syncing || products.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 disabled:opacity-40 transition-all">
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {syncing ? 'Syncing…' : 'Sync to AI'}
            </button>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#25D366] text-black hover:bg-[#22c55e] transition-all">
              <Plus size={12} />
              Add Manually
            </button>
          </div>
        </div>

        {syncedCount < products.length && products.length > 0 && (
          <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-2.5 flex gap-2 items-start mb-3">
            <Info size={12} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-300/80 text-xs">
              {products.length - syncedCount} product{products.length - syncedCount > 1 ? 's' : ''} not synced.
              Click <strong>Sync to AI</strong> so the agent can use them.
            </p>
          </div>
        )}

        {showForm && (
          <div className="mb-3">
            <ProductForm onSave={addProduct} onCancel={() => setShowForm(false)} loading={saving} />
          </div>
        )}

        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-14 bg-[#1f2c34] rounded-xl animate-pulse mb-2" />)
        ) : products.length === 0 && !showForm ? (
          <div className="text-center py-10 text-white/20">
            <Package size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">Add products from WhatsApp or manually</p>
          </div>
        ) : (
          products.map(p => (
            <div key={p.id} className="bg-[#1f2c34] border border-white/8 rounded-xl overflow-hidden mb-2">
              {editId === p.id ? (
                <div className="p-3">
                  <ProductForm
                    initial={{
                      name:        p.name,
                      description: p.description ?? '',
                      priceRange:  p.priceRange  ?? '',
                      category:    p.category    ?? '',
                      fabric:      p.fabric      ?? '',
                      occasions:   p.occasions   ?? '',
                      imageUrl:    p.imageUrl    ?? '',
                      customInfo:  p.customInfo  ?? '',
                    }}
                    onSave={data => updateProduct(p.id, data)}
                    onCancel={() => setEditId(null)}
                    loading={saving}
                  />
                </div>
              ) : (
                <>
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
                    onClick={() => setExpanded(e => e === p.id ? null : p.id)}
                  >
                    {p.imageUrl && (
                      <img src={p.imageUrl} alt={p.name} className="w-8 h-8 rounded-md object-cover shrink-0 bg-white/5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-xs font-medium truncate">{p.name}</p>
                        {p.syncedAt
                          ? <span className="text-[9px] bg-[#25D366]/15 text-[#25D366] px-1.5 py-0.5 rounded-full shrink-0">Synced</span>
                          : <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full shrink-0">Not synced</span>
                        }
                        {p.customInfo && (
                          <span className="text-[9px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                            <StickyNote size={8} /> Notes
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-white/30 text-[10px]">
                        {p.category   && <span>{p.category}</span>}
                        {p.priceRange && <span>· {p.priceRange}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setEditId(p.id)} className="p-1.5 rounded-lg text-white/25 hover:text-[#25D366] hover:bg-[#25D366]/10 transition-all">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteProduct(p.id)} className="p-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all">
                        <Trash2 size={13} />
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
                    </div>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>
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

function DraftsTab() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/agent/drafts');
    if (res.ok) setDrafts(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addDraft = async (data: typeof EMPTY_DRAFT) => {
    setSaving(true);
    await fetch('/api/agent/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setSaving(false); setShowForm(false); load();
  };

  const updateDraft = async (id: string, data: typeof EMPTY_DRAFT) => {
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
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-white/40 text-xs">{drafts.length} draft message{drafts.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-purple-500 text-white hover:bg-purple-400 transition-all"
        >
          <Plus size={12} />
          New Draft
        </button>
      </div>

      <div className="bg-[#111b21] border border-white/8 rounded-xl px-4 py-3 flex gap-2">
        <Info size={12} className="text-white/30 shrink-0 mt-0.5" />
        <p className="text-white/35 text-[11px] leading-relaxed">
          Drafts are pre-written messages the agent can send verbatim. Give each draft a clear <strong className="text-white/50">trigger hint</strong> so the agent knows when to use it (e.g. "when customer asks how to pay").
        </p>
      </div>

      {showForm && <DraftForm onSave={addDraft} onCancel={() => setShowForm(false)} loading={saving} />}

      {loading ? (
        [...Array(2)].map((_, i) => <div key={i} className="h-20 bg-[#1f2c34] rounded-xl animate-pulse" />)
      ) : drafts.length === 0 && !showForm ? (
        <div className="text-center py-16 text-white/20">
          <MessageSquarePlus size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No drafts yet</p>
          <p className="text-xs mt-1 text-white/15">E.g. UPI QR code, return policy, shipping info</p>
        </div>
      ) : (
        drafts.map(d => (
          <div key={d.id} className="bg-[#1f2c34] border border-white/8 rounded-xl overflow-hidden">
            {editId === d.id ? (
              <div className="p-3">
                <DraftForm
                  initial={{ name: d.name, content: d.content, triggerHint: d.triggerHint ?? '' }}
                  onSave={data => updateDraft(d.id, data)}
                  onCancel={() => setEditId(null)}
                  loading={saving}
                />
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{d.name}</p>
                    {d.triggerHint && (
                      <p className="text-purple-400/70 text-[10px] mt-0.5 flex items-center gap-1">
                        <Tag size={9} /> {d.triggerHint}
                      </p>
                    )}
                    <p className="text-white/40 text-[11px] mt-2 leading-relaxed line-clamp-3 whitespace-pre-wrap">{d.content}</p>
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
        ))
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
