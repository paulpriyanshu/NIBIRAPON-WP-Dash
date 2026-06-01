'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package, Plus, Trash2, Pencil, Check, Loader2,
  ChevronDown, ChevronUp, Layers, Calendar, StickyNote,
  Upload, Link2, ImageIcon, Film, Bot,
} from 'lucide-react';

/* ── types ───────────────────────────────────────────────────────── */

interface ProductMedia {
  type: 'image' | 'video';
  url?: string;
  assetId?: string;
  mimeType?: string;
  description?: string;
}

interface Product {
  id: string; name: string; description: string | null;
  priceRange: string | null; category: string | null;
  fabric: string | null; occasions: string | null;
  media: ProductMedia[]; customInfo: string | null;
  isActive: boolean; inAgentContext: boolean; syncedAt: string | null;
}

const EMPTY_PRODUCT = {
  name: '', description: '', priceRange: '', category: '',
  fabric: '', occasions: '', customInfo: '',
  media: [] as ProductMedia[],
};
type ProductForm = typeof EMPTY_PRODUCT;

/* ── helpers ─────────────────────────────────────────────────────── */

/** Browser-renderable source for a media item. */
function mediaSrc(m: ProductMedia): string {
  if (m.assetId) return `/api/inventory/media/${m.assetId}`;
  return m.url || '';
}

const inputCls = 'w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-[#25D366]/50 transition-colors';

/* ── Media manager ───────────────────────────────────────────────── */

function MediaManager({ media, onChange }: {
  media: ProductMedia[];
  onChange: (m: ProductMedia[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [urlValue, setUrlValue]   = useState('');
  const [urlType,  setUrlType]    = useState<'image' | 'video'>('image');
  const [error,    setError]      = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (i: number, patch: Partial<ProductMedia>) =>
    onChange(media.map((m, idx) => idx === i ? { ...m, ...patch } : m));
  const remove = (i: number) => onChange(media.filter((_, idx) => idx !== i));

  const MAX_IMAGE = 5  * 1024 * 1024;
  const MAX_VIDEO = 16 * 1024 * 1024;

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true); setError('');
    const added: ProductMedia[] = [];
    for (const file of Array.from(files)) {
      try {
        const isVideo = file.type.startsWith('video');
        if (!isVideo && !file.type.startsWith('image')) { setError(`${file.name}: only images or videos`); continue; }
        const max = isVideo ? MAX_VIDEO : MAX_IMAGE;
        if (file.size > max) { setError(`${file.name}: too large (max ${Math.round(max / 1024 / 1024)} MB)`); continue; }

        // 1. ask our server for a presigned upload URL
        const signRes = await fetch('/api/inventory/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mimeType: file.type }),
        });
        const sign = await signRes.json();
        if (!signRes.ok || !sign.uploadUrl) { setError(sign.error || `Upload failed for ${file.name}`); continue; }

        // 2. upload the file straight to R2
        const putRes = await fetch(sign.uploadUrl, {
          method: 'PUT', headers: { 'Content-Type': file.type }, body: file,
        });
        if (!putRes.ok) { setError(`R2 upload failed for ${file.name} (${putRes.status})`); continue; }

        added.push({ type: isVideo ? 'video' : 'image', assetId: sign.assetId, mimeType: file.type });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      }
    }
    if (added.length) onChange([...media, ...added]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const addUrl = () => {
    const v = urlValue.trim();
    if (!v) return;
    onChange([...media, { type: urlType, url: v }]);
    setUrlValue('');
  };

  return (
    <div className="space-y-3">
      {/* existing media */}
      {media.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5">
          {media.map((m, i) => (
            <div key={i} className="flex gap-3 bg-[#111b21] border border-white/8 rounded-lg p-2.5">
              <div className="w-16 h-16 rounded-md overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                {m.type === 'video' ? (
                  <video src={mediaSrc(m)} className="w-full h-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(m)} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 flex items-center gap-1">
                    {m.type === 'video' ? <Film size={9} /> : <ImageIcon size={9} />}
                    {m.type}
                  </span>
                  <span className="text-[9px] text-white/25 truncate">{m.assetId ? 'uploaded' : 'url'}</span>
                  <button onClick={() => remove(i)} className="ml-auto p-1 rounded text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <Trash2 size={12} />
                  </button>
                </div>
                <textarea
                  value={m.description || ''}
                  onChange={e => update(i, { description: e.target.value })}
                  rows={2}
                  placeholder="Describe this photo so the agent can explain it — e.g. 'close-up of the gold zari border'"
                  className={`${inputCls} resize-none leading-relaxed`}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* upload */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef} type="file" accept="image/*,video/*" multiple hidden
          onChange={e => onFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-all"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? 'Uploading…' : 'Upload photo / video'}
        </button>
      </div>

      {/* paste url */}
      <div className="flex items-center gap-2">
        <Link2 size={13} className="text-white/30 shrink-0" />
        <select
          value={urlType}
          onChange={e => setUrlType(e.target.value as 'image' | 'video')}
          className="bg-[#111b21] border border-white/10 rounded-lg px-2 py-1.5 text-white/70 text-xs focus:outline-none focus:border-[#25D366]/50"
        >
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
        <input
          value={urlValue}
          onChange={e => setUrlValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addUrl())}
          placeholder="…or paste a public media URL"
          className={inputCls}
        />
        <button type="button" onClick={addUrl} disabled={!urlValue.trim()}
          className="px-3 py-1.5 rounded-lg text-xs bg-white/10 text-white/70 hover:bg-white/15 disabled:opacity-40 transition-all shrink-0">
          Add
        </button>
      </div>

      {error && <p className="text-red-400 text-[11px]">{error}</p>}
      <p className="text-white/25 text-[10px] leading-relaxed">
        Uploaded files are stored on our server permanently. You can also paste a public media URL instead.
      </p>
    </div>
  );
}

/* ── Product form ────────────────────────────────────────────────── */

function ProductFormCard({ initial, onSave, onCancel, loading }: {
  initial?: Partial<ProductForm>;
  onSave: (data: ProductForm) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<ProductForm>({ ...EMPTY_PRODUCT, ...initial });
  const set = (k: keyof ProductForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="bg-[#1f2c34] border border-[#25D366]/30 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Name *</label>
          <input value={form.name} onChange={set('name')} placeholder="e.g. Banarasi Silk Saree" className={inputCls} />
        </div>
        <div>
          <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Price</label>
          <input value={form.priceRange} onChange={set('priceRange')} placeholder="e.g. ₹8,000" className={inputCls} />
        </div>
        <div>
          <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Category</label>
          <input value={form.category} onChange={set('category')} placeholder="e.g. Silk, Cotton" className={inputCls} />
        </div>
        <div>
          <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Fabric</label>
          <input value={form.fabric} onChange={set('fabric')} placeholder="e.g. Pure Silk" className={inputCls} />
        </div>
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Occasions</label>
        <input value={form.occasions} onChange={set('occasions')} placeholder="e.g. Wedding, Festival" className={inputCls} />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Description</label>
        <textarea value={form.description} onChange={set('description')} rows={2}
          placeholder="Full product description the agent will use to answer customer questions…"
          className={`${inputCls} resize-none leading-relaxed`} />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1">
          <StickyNote size={9} /> Additional info for agent
        </label>
        <textarea value={form.customInfo} onChange={set('customInfo')} rows={2}
          placeholder="Extra notes only the agent should know — e.g. 'Limited stock: 3 pieces left in red'"
          className={`${inputCls} resize-none leading-relaxed border-purple-400/20 focus:border-purple-400/50`} />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1">
          <ImageIcon size={9} /> Photos &amp; videos
        </label>
        <MediaManager media={form.media} onChange={m => setForm(f => ({ ...f, media: m }))} />
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

/* ── Main page ───────────────────────────────────────────────────── */

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inventory');
    if (res.ok) setProducts(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addProduct = async (data: ProductForm) => {
    setSaving(true);
    await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setSaving(false); setShowForm(false); load();
  };

  const updateProduct = async (id: string, data: ProductForm) => {
    setSaving(true);
    await fetch(`/api/inventory/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setSaving(false); setEditId(null); load();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Delete this product from inventory?')) return;
    await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="h-full flex flex-col bg-[#0b141a] overflow-hidden">
      {/* header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/8 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#25D366]/15 rounded-xl flex items-center justify-center">
              <Package size={18} className="text-[#25D366]" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">Inventory</h1>
              <p className="text-white/40 text-xs">
                {products.length} product{products.length !== 1 ? 's' : ''} · {products.filter(p => p.inAgentContext).length} in agent context
              </p>
            </div>
          </div>
          <button onClick={() => { setShowForm(true); setEditId(null); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#25D366] text-black hover:bg-[#22c55e] transition-all">
            <Plus size={14} /> Add Product
          </button>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 max-w-3xl">
        {showForm && (
          <ProductFormCard onSave={addProduct} onCancel={() => setShowForm(false)} loading={saving} />
        )}

        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-16 bg-[#1f2c34] rounded-xl animate-pulse" />)
        ) : products.length === 0 && !showForm ? (
          <div className="text-center py-16 text-white/20">
            <Package size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No products yet</p>
            <p className="text-xs mt-1 text-white/15">Add your first product with photos, info and price</p>
          </div>
        ) : (
          products.map(p => (
            <div key={p.id} className="bg-[#1f2c34] border border-white/8 rounded-xl overflow-hidden">
              {editId === p.id ? (
                <div className="p-3">
                  <ProductFormCard
                    initial={{
                      name:        p.name,
                      description: p.description ?? '',
                      priceRange:  p.priceRange  ?? '',
                      category:    p.category    ?? '',
                      fabric:      p.fabric      ?? '',
                      occasions:   p.occasions   ?? '',
                      customInfo:  p.customInfo  ?? '',
                      media:       p.media       ?? [],
                    }}
                    onSave={data => updateProduct(p.id, data)}
                    onCancel={() => setEditId(null)}
                    loading={saving}
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
                    onClick={() => setExpanded(e => e === p.id ? null : p.id)}>
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                      {p.media?.[0]
                        ? (p.media[0].type === 'video'
                            ? <video src={mediaSrc(p.media[0])} className="w-full h-full object-cover" muted />
                            // eslint-disable-next-line @next/next/no-img-element
                            : <img src={mediaSrc(p.media[0])} alt="" className="w-full h-full object-cover" />)
                        : <Package size={16} className="text-white/20" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-xs font-medium truncate">{p.name}</p>
                        {p.inAgentContext && (
                          <span className="text-[9px] bg-[#25D366]/15 text-[#25D366] px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                            <Bot size={8} /> In agent
                          </span>
                        )}
                        {p.media?.length > 0 && (
                          <span className="text-[9px] bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full shrink-0">
                            {p.media.length} media
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-white/30 text-[10px]">
                        {p.category   && <span>{p.category}</span>}
                        {p.priceRange && <span>· {p.priceRange}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setEditId(p.id); setShowForm(false); }} className="p-1.5 rounded-lg text-white/25 hover:text-[#25D366] hover:bg-[#25D366]/10 transition-all">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteProduct(p.id)} className="p-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all">
                        <Trash2 size={13} />
                      </button>
                      {expanded === p.id ? <ChevronUp size={13} className="text-white/25 ml-1" /> : <ChevronDown size={13} className="text-white/25 ml-1" />}
                    </div>
                  </div>

                  {expanded === p.id && (
                    <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
                      {p.description && <p className="text-white/50 text-xs leading-relaxed">{p.description}</p>}
                      <div className="flex flex-wrap gap-3 text-[10px] text-white/30">
                        {p.fabric    && <span className="flex items-center gap-1"><Layers size={9} /> {p.fabric}</span>}
                        {p.occasions && <span className="flex items-center gap-1"><Calendar size={9} /> {p.occasions}</span>}
                      </div>
                      {p.customInfo && (
                        <div className="bg-purple-500/8 border border-purple-500/15 rounded-lg px-3 py-2">
                          <p className="text-purple-400/70 text-[9px] uppercase tracking-wider mb-1 flex items-center gap-1">
                            <StickyNote size={9} /> Agent notes
                          </p>
                          <p className="text-purple-200/60 text-[11px] leading-relaxed">{p.customInfo}</p>
                        </div>
                      )}
                      {p.media?.length > 0 && (
                        <div className="grid grid-cols-4 gap-2">
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
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
