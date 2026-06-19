'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useInfiniteList } from '@/hooks/useInfiniteList';
import {
  Package, Plus, Trash2, Pencil, Check, Loader2,
  ChevronDown, ChevronUp, StickyNote,
  Upload, Link2, ImageIcon, Film, Bot, Tags, GitBranch, X, EyeOff,
} from 'lucide-react';
import { inputCls } from './shared';
import CategoriesPanel, { type Category } from './CategoriesPanel';

/* ── types ───────────────────────────────────────────────────────── */

interface ProductMedia {
  type: 'image' | 'video';
  url?: string;
  assetId?: string;
  mimeType?: string;
  description?: string;
}

interface VariantAttribute { label: string; value: string; }

interface Product {
  id: string; name: string; description: string | null;
  priceRange: string | null; category: string | null; categoryId: string | null;
  fabric: string | null; occasions: string | null;
  media: ProductMedia[]; customInfo: string | null; contentId: string | null; tags: string[];
  parentId: string | null; variantAttributes: VariantAttribute[];
  isActive: boolean; inAgentContext: boolean; syncedAt: string | null;
  variants?: Product[];
}

const EMPTY_PRODUCT = {
  name: '', description: '', priceRange: '', categoryId: '',
  fabric: '', occasions: '', customInfo: '', contentId: '',
  media: [] as ProductMedia[],
  tags: [] as string[],
  parentId: '' as string,
  variantAttributes: [] as VariantAttribute[],
  isActive: true,
};
type ProductForm = typeof EMPTY_PRODUCT;

/* ── helpers ─────────────────────────────────────────────────────── */

/** Browser-renderable source for a media item. */
function mediaSrc(m: ProductMedia): string {
  if (m.assetId) return `/api/inventory/media/${m.assetId}`;
  return m.url || '';
}

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
  const MAX_VIDEO = 100 * 1024 * 1024;

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

/* ── Variant attributes editor ───────────────────────────────────── */

function VariantAttributesEditor({ attrs, onChange }: {
  attrs: VariantAttribute[];
  onChange: (a: VariantAttribute[]) => void;
}) {
  const update = (i: number, patch: Partial<VariantAttribute>) =>
    onChange(attrs.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  const remove = (i: number) => onChange(attrs.filter((_, idx) => idx !== i));
  const add = () => onChange([...attrs, { label: '', value: '' }]);

  return (
    <div className="space-y-2">
      <datalist id="variant-attr-labels">
        <option value="Color" /><option value="Size" /><option value="Length" /><option value="Material" />
      </datalist>
      {attrs.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <input list="variant-attr-labels" value={a.label} onChange={e => update(i, { label: e.target.value })}
            placeholder="Attribute (e.g. Color)" className={inputCls} />
          <input value={a.value} onChange={e => update(i, { value: e.target.value })}
            placeholder="Value (e.g. Red)" className={inputCls} />
          <button type="button" onClick={() => remove(i)}
            className="p-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0">
            <X size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1 text-[11px] text-[#25D366]/80 hover:text-[#25D366] transition-colors">
        <Plus size={11} /> Add attribute
      </button>
    </div>
  );
}

/* ── Tags editor ─────────────────────────────────────────────────── */

function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !tags.some(t => t.toLowerCase() === v.toLowerCase())) onChange([...tags, v]);
    setDraft('');
  };
  const remove = (i: number) => onChange(tags.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-1.5">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <span key={i} className="flex items-center gap-1 text-[11px] bg-[#25D366]/15 text-[#25D366] px-2 py-0.5 rounded-full">
              {t}
              <button type="button" onClick={() => remove(i)} className="hover:text-red-400"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder="Type a tag and press Enter — e.g. silk, festive, handloom"
        className={inputCls}
      />
    </div>
  );
}

/* ── Product form ────────────────────────────────────────────────── */

function ProductFormCard({ initial, onSave, onCancel, loading, categories, parentOptions, lockParentName }: {
  initial?: Partial<ProductForm>;
  onSave: (data: ProductForm) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
  categories: Category[];
  parentOptions: { id: string; name: string }[];
  lockParentName?: string;   // when adding a variant from a parent row, show the parent name read-only
}) {
  const [form, setForm] = useState<ProductForm>({ ...EMPTY_PRODUCT, ...initial });
  const set = (k: keyof ProductForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const isVariant = !!form.parentId || !!lockParentName;

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
          <select value={form.categoryId} onChange={set('categoryId')}
            className="w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#25D366]/50 transition-colors">
            <option value="">— none —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Fabric</label>
          <input value={form.fabric} onChange={set('fabric')} placeholder="e.g. Pure Silk" className={inputCls} />
        </div>
      </div>

      {/* Variant linkage */}
      <div className="bg-[#111b21]/60 border border-white/8 rounded-lg p-3 space-y-2.5">
        <label className="text-white/40 text-[10px] uppercase tracking-wider flex items-center gap-1">
          <GitBranch size={9} /> Variant of another product
        </label>
        {lockParentName ? (
          <p className="text-white/60 text-xs">Variant of <span className="text-[#25D366]">{lockParentName}</span></p>
        ) : (
          <select value={form.parentId} onChange={set('parentId')}
            className="w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#25D366]/50 transition-colors">
            <option value="">— standalone product (not a variant) —</option>
            {parentOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {isVariant && (
          <div>
            <p className="text-white/30 text-[10px] mb-1.5">How does this variant differ? (e.g. Color: Red, Size: M)</p>
            <VariantAttributesEditor attrs={form.variantAttributes} onChange={a => setForm(f => ({ ...f, variantAttributes: a }))} />
          </div>
        )}
      </div>

      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Occasions</label>
        <input value={form.occasions} onChange={set('occasions')} placeholder="e.g. Wedding, Festival" className={inputCls} />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Content ID <span className="text-white/25 normal-case">(reference — optional)</span></label>
        <input value={form.contentId} onChange={set('contentId')} placeholder="e.g. WhatsApp catalog content id, SKU, or any reference" className={inputCls} />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Tags <span className="text-white/25 normal-case">— agent matches broad queries like "silk"</span></label>
        <TagsEditor tags={form.tags} onChange={t => setForm(f => ({ ...f, tags: t }))} />
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
      <label className="flex items-center gap-2 text-white/60 text-xs cursor-pointer select-none">
        <input type="checkbox" checked={!form.isActive}
          onChange={e => setForm(f => ({ ...f, isActive: !e.target.checked }))}
          className="accent-red-500" />
        <EyeOff size={12} /> Hide this product everywhere (agent, flows, storefront)
      </label>
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

/** What the right-hand editor pane is showing. */
type Selection =
  | { mode: 'new' }
  | { mode: 'new-variant'; parentId: string; parentName: string }
  | { mode: 'edit'; id: string }
  | null;

export default function InventoryPage({ initialItems = [], initialCursor = null }: {
  initialItems?: Product[];
  initialCursor?: string | null;
}) {
  const { items: products, loading, hasMore, reload, sentinelRef } =
    useInfiniteList<Product>({ endpoint: '/api/inventory', limit: 30, initialItems, initialCursor });

  const [tab, setTab] = useState<'products' | 'categories'>('products');
  const [categories, setCategories] = useState<Category[]>([]);

  const [saving,    setSaving]    = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /** Find a product or variant anywhere in the loaded list. */
  const findProduct = (id: string): Product | undefined => {
    for (const p of products) {
      if (p.id === id) return p;
      const v = p.variants?.find(x => x.id === id);
      if (v) return v;
    }
    return undefined;
  };

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) setCategories(await res.json());
    } catch { /* ignore */ }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadCategories(); }, []);

  const parentOptions = products.map(p => ({ id: p.id, name: p.name }));

  const addProduct = async (data: ProductForm) => {
    setSaving(true);
    await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setSaving(false); setSelection(null); reload();
  };

  const updateProduct = async (id: string, data: ProductForm) => {
    setSaving(true);
    await fetch(`/api/inventory/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setSaving(false); reload();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Delete this product from inventory? Its variants will also be removed.')) return;
    await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
    setSelection(s => (s?.mode === 'edit' && s.id === id) ? null : s);
    reload();
  };

  const variantInitial = (p: Product): Partial<ProductForm> => ({
    name:        p.name,
    description: p.description ?? '',
    priceRange:  p.priceRange  ?? '',
    categoryId:  p.categoryId  ?? '',
    fabric:      p.fabric      ?? '',
    occasions:   p.occasions   ?? '',
    customInfo:  p.customInfo  ?? '',
    contentId:   p.contentId   ?? '',
    tags:        p.tags        ?? [],
    media:       p.media       ?? [],
    parentId:    p.parentId    ?? '',
    variantAttributes: p.variantAttributes ?? [],
    isActive:    p.isActive,
  });

  const totalInAgent = products.filter(p => p.inAgentContext).length;

  return (
    <div className="h-full flex flex-col bg-[#0b141a] overflow-hidden">
      {/* header */}
      <div className="px-6 pt-6 pb-0 border-b border-white/8 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#25D366]/15 rounded-xl flex items-center justify-center">
              <Package size={18} className="text-[#25D366]" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">Inventory</h1>
              <p className="text-white/40 text-xs">
                {tab === 'products'
                  ? `${products.length} product${products.length !== 1 ? 's' : ''} · ${totalInAgent} in agent context`
                  : `${categories.length} categor${categories.length !== 1 ? 'ies' : 'y'}`}
              </p>
            </div>
          </div>
          {tab === 'products' && (
            <button onClick={() => setSelection({ mode: 'new' })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#25D366] text-black hover:bg-[#22c55e] transition-all">
              <Plus size={14} /> Add Product
            </button>
          )}
        </div>

        {/* tabs */}
        <div className="flex gap-1">
          {([['products', 'Products', Package], ['categories', 'Categories', Tags]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all ${
                tab === key ? 'border-[#25D366] text-white' : 'border-transparent text-white/40 hover:text-white/70'
              }`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* body */}
      {tab === 'categories' ? (
        <div className="flex-1 min-h-0">
          <CategoriesPanel categories={categories} onChange={loadCategories} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          {/* ── LEFT: product / variant list ───────────────────────── */}
          <div className="w-[340px] shrink-0 border-r border-white/8 overflow-y-auto">
            {products.length === 0 && loading ? (
              <div className="p-3 space-y-2">
                {[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-[#1f2c34] rounded-lg animate-pulse" />)}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-16 px-4 text-white/20">
                <Package size={28} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No products yet</p>
                <p className="text-xs mt-1 text-white/15">Click “Add Product” to create your first one</p>
              </div>
            ) : (
              <div className="py-2">
                {products.map(p => {
                  const isSel = selection?.mode === 'edit' && selection.id === p.id;
                  const hasVariants = (p.variants?.length ?? 0) > 0;
                  const isOpen = expanded.has(p.id);
                  return (
                    <div key={p.id}>
                      <div
                        onClick={() => setSelection({ mode: 'edit', id: p.id })}
                        className={`group flex items-center gap-2.5 px-3 py-2 cursor-pointer border-l-2 transition-colors ${
                          isSel ? 'bg-[#25D366]/10 border-[#25D366]' : 'border-transparent hover:bg-white/5'
                        }`}>
                        <div className="w-9 h-9 rounded-md overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                          {p.media?.[0]
                            ? (p.media[0].type === 'video'
                                ? <video src={mediaSrc(p.media[0])} className="w-full h-full object-cover" muted />
                                // eslint-disable-next-line @next/next/no-img-element
                                : <img src={mediaSrc(p.media[0])} alt="" className="w-full h-full object-cover" />)
                            : <Package size={15} className="text-white/20" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-xs font-medium truncate ${!p.isActive ? 'text-white/40 line-through' : isSel ? 'text-white' : 'text-white/85'}`}>{p.name}</p>
                            {!p.isActive ? <EyeOff size={11} className="text-red-400/70 shrink-0" /> : p.inAgentContext && <Bot size={11} className="text-[#25D366] shrink-0" />}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-white/30 text-[10px]">
                            {p.priceRange && <span className="truncate">{p.priceRange}</span>}
                            {hasVariants && <span className="flex items-center gap-0.5 shrink-0"><GitBranch size={8} /> {p.variants!.length}</span>}
                          </div>
                        </div>
                        {/* hover action: add a variant */}
                        <button
                          onClick={e => { e.stopPropagation(); setSelection({ mode: 'new-variant', parentId: p.id, parentName: p.name }); setExpanded(prev => new Set(prev).add(p.id)); }}
                          title="Add a variant"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-white/30 hover:text-[#25D366] hover:bg-[#25D366]/10 transition-all shrink-0">
                          <GitBranch size={12} />
                        </button>
                        {hasVariants && (
                          <button onClick={e => { e.stopPropagation(); toggleExpand(p.id); }}
                            className="p-0.5 text-white/25 hover:text-white/60 transition-colors shrink-0">
                            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </div>

                      {/* variant sub-rows */}
                      {hasVariants && isOpen && p.variants!.map(v => {
                        const vSel = selection?.mode === 'edit' && selection.id === v.id;
                        return (
                          <div key={v.id}
                            onClick={() => setSelection({ mode: 'edit', id: v.id })}
                            className={`flex items-center gap-2 pl-10 pr-3 py-1.5 cursor-pointer border-l-2 transition-colors ${
                              vSel ? 'bg-[#25D366]/10 border-[#25D366]' : 'border-transparent hover:bg-white/5'
                            }`}>
                            <div className="w-6 h-6 rounded overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                              {v.media?.[0]
                                ? (v.media[0].type === 'video'
                                    ? <video src={mediaSrc(v.media[0])} className="w-full h-full object-cover" muted />
                                    // eslint-disable-next-line @next/next/no-img-element
                                    : <img src={mediaSrc(v.media[0])} alt="" className="w-full h-full object-cover" />)
                                : <Package size={11} className="text-white/20" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] truncate ${vSel ? 'text-white' : 'text-white/70'}`}>
                                {v.variantAttributes?.length
                                  ? v.variantAttributes.map(a => a.value).join(' · ')
                                  : v.name}
                              </p>
                            </div>
                            {v.priceRange && <span className="text-white/30 text-[10px] shrink-0">{v.priceRange}</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Infinite-scroll sentinel — loads the next page as it nears view. */}
                {hasMore && (
                  <div ref={sentinelRef} className="py-4 flex justify-center">
                    {loading && <Loader2 size={16} className="animate-spin text-white/30" />}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: editable preview pane ───────────────────────── */}
          <div className="flex-1 overflow-y-auto">
            {!selection ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-white/20 px-6">
                <Pencil size={30} className="mb-3 opacity-30" />
                <p className="text-sm">Select a product or variant to edit</p>
                <p className="text-xs mt-1 text-white/15">Its full details open here, ready to edit and save</p>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto p-6 space-y-4">
                {selection.mode === 'new' && (
                  <>
                    <h2 className="text-white font-semibold text-sm">New product</h2>
                    <ProductFormCard key="new" onSave={addProduct} onCancel={() => setSelection(null)}
                      loading={saving} categories={categories} parentOptions={parentOptions} />
                  </>
                )}

                {selection.mode === 'new-variant' && (
                  <>
                    <h2 className="text-white font-semibold text-sm">
                      New variant of <span className="text-[#25D366]">{selection.parentName}</span>
                    </h2>
                    <ProductFormCard
                      key={`nv-${selection.parentId}`}
                      initial={{ parentId: selection.parentId, categoryId: findProduct(selection.parentId)?.categoryId ?? '' }}
                      lockParentName={selection.parentName}
                      onSave={addProduct}
                      onCancel={() => setSelection(null)}
                      loading={saving}
                      categories={categories}
                      parentOptions={parentOptions}
                    />
                  </>
                )}

                {selection.mode === 'edit' && (() => {
                  const target = findProduct(selection.id);
                  if (!target) return (
                    <p className="text-white/30 text-sm">This product is no longer available.</p>
                  );
                  return (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-white font-semibold text-sm truncate">{target.name}</h2>
                          <p className="text-white/35 text-[11px] flex items-center gap-1">
                            {target.parentId ? <><GitBranch size={10} /> Variant</> : 'Product'}
                            {!target.isActive && <span className="flex items-center gap-0.5 text-red-300"><EyeOff size={10} /> hidden</span>}
                            {target.inAgentContext && target.isActive && <span className="flex items-center gap-0.5 text-[#25D366]/80"><Bot size={10} /> in agent</span>}
                          </p>
                          {target.contentId && (
                            <p className="text-white/30 text-[10px] mt-0.5 font-mono">ID: {target.contentId}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!target.parentId && (
                            <button onClick={() => { setSelection({ mode: 'new-variant', parentId: target.id, parentName: target.name }); setExpanded(prev => new Set(prev).add(target.id)); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-white/15 bg-white/5 text-white/60 hover:text-[#25D366] hover:bg-[#25D366]/10 transition-all">
                              <GitBranch size={12} /> Add variant
                            </button>
                          )}
                          <button onClick={() => deleteProduct(target.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-white/15 bg-white/5 text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-all">
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                      <ProductFormCard
                        key={`edit-${target.id}`}
                        initial={variantInitial(target)}
                        onSave={data => updateProduct(target.id, data)}
                        onCancel={() => setSelection(null)}
                        loading={saving}
                        categories={categories}
                        parentOptions={parentOptions.filter(o => o.id !== target.id)}
                      />
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
