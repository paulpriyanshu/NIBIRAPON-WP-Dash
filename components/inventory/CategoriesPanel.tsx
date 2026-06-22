'use client';
import { useState, useEffect } from 'react';
import {
  Tags, Plus, Trash2, Pencil, Check, Loader2, Bot, ImageIcon, Package, EyeOff,
} from 'lucide-react';
import { inputCls, imageSrc, SingleImagePicker, type SingleImage } from './shared';

interface CatProductMedia { type: 'image' | 'video'; assetId?: string; url?: string }
interface CatProduct {
  id: string; name: string; priceRange: string | null; description: string | null;
  categoryId: string | null; parentId: string | null; media: CatProductMedia[];
}
function productMediaSrc(m?: CatProductMedia): string {
  if (!m) return '';
  return m.assetId ? `/api/inventory/media/${m.assetId}` : (m.url ?? '');
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageAssetId: string | null;
  parentId: string | null;
  sortOrder: number;
  inAgentContext: boolean;
  hidden: boolean;
}

const EMPTY = { name: '', description: '', image: null as SingleImage | null, parentId: '' as string, inAgentContext: true, hidden: false };
type CategoryForm = typeof EMPTY;

function toImage(c: Pick<Category, 'imageAssetId' | 'imageUrl'>): SingleImage | null {
  if (c.imageAssetId) return { assetId: c.imageAssetId };
  if (c.imageUrl)     return { url: c.imageUrl };
  return null;
}

function CategoryFormCard({ initial, onSave, onCancel, loading, parentOptions }: {
  initial?: Partial<CategoryForm>;
  onSave: (data: CategoryForm) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
  parentOptions: Category[];   // categories that can be chosen as a parent (excludes self)
}) {
  const [form, setForm] = useState<CategoryForm>({ ...EMPTY, ...initial });

  return (
    <div className="bg-[#1f2c34] border border-[#25D366]/30 rounded-xl p-4 space-y-3">
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Name *</label>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Banarasi Silk" className={inputCls} />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Parent category</label>
        <select value={form.parentId} onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))} className={inputCls}>
          <option value="">— None (top-level) —</option>
          {parentOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <p className="text-white/25 text-[10px] mt-1">Make this a subcategory (e.g. nest under “Saree”). Leave as top-level for a main category.</p>
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Description</label>
        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
          placeholder="Short description the agent can use when introducing this category…"
          className={`${inputCls} resize-none leading-relaxed`} />
      </div>
      <div>
        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1">
          <ImageIcon size={9} /> Category image
        </label>
        <SingleImagePicker value={form.image} onChange={img => setForm(f => ({ ...f, image: img }))} />
      </div>
      <label className="flex items-center gap-2 text-white/50 text-xs cursor-pointer select-none">
        <input type="checkbox" checked={form.inAgentContext}
          onChange={e => setForm(f => ({ ...f, inAgentContext: e.target.checked }))}
          className="accent-[#25D366]" />
        <Bot size={12} /> Show this category to the AI agent
      </label>
      <label className="flex items-center gap-2 text-white/50 text-xs cursor-pointer select-none">
        <input type="checkbox" checked={form.hidden}
          onChange={e => setForm(f => ({ ...f, hidden: e.target.checked }))}
          className="accent-red-500" />
        <EyeOff size={12} /> Hide this category everywhere (agent, flows, storefront)
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-1.5 rounded-lg text-xs text-white/40 hover:text-white hover:bg-white/5 transition-all">Cancel</button>
        <button onClick={() => onSave(form)} disabled={loading || !form.name.trim()}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-[#25D366] text-black font-medium hover:bg-[#22c55e] disabled:opacity-40 transition-all">
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Save Category
        </button>
      </div>
    </div>
  );
}

export default function CategoriesPanel({ categories, onChange }: {
  categories: Category[];
  onChange: () => void;   // ask the parent to refetch
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [products, setProducts] = useState<CatProduct[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load all products once so we can list them under their category.
  useEffect(() => {
    fetch('/api/inventory').then(r => r.ok ? r.json() : []).then((rows: CatProduct[]) => setProducts(rows)).catch(() => {});
  }, []);

  // All products (parents AND variants) grouped by category. A variant with no
  // category of its own inherits its parent's category.
  const catOf = new Map(products.map(p => [p.id, p.categoryId]));
  const byCategory = new Map<string, CatProduct[]>();
  for (const p of products) {
    const cid = p.categoryId ?? (p.parentId ? catOf.get(p.parentId) ?? null : null);
    if (!cid) continue;
    const arr = byCategory.get(cid) ?? [];
    arr.push(p);
    byCategory.set(cid, arr);
  }
  const selected = categories.find(c => c.id === selectedId) ?? null;

  // Order the list as a 2-level tree: each top-level category followed by its
  // subcategories (indented). Orphans (parent missing) render at the top level.
  const childrenByParent = new Map<string, Category[]>();
  for (const c of categories) {
    if (c.parentId && categories.some(p => p.id === c.parentId)) {
      const a = childrenByParent.get(c.parentId) ?? [];
      a.push(c); childrenByParent.set(c.parentId, a);
    }
  }
  const tops = categories.filter(c => !c.parentId || !categories.some(p => p.id === c.parentId));
  const ordered: { c: Category; indent: boolean }[] = [];
  for (const t of tops) {
    ordered.push({ c: t, indent: false });
    for (const ch of (childrenByParent.get(t.id) ?? [])) ordered.push({ c: ch, indent: true });
  }
  // Roll subcategory product counts up to their parent (a parent has no direct products).
  const countFor = (c: Category) =>
    (byCategory.get(c.id) ?? []).length + (childrenByParent.get(c.id) ?? []).reduce((n, ch) => n + (byCategory.get(ch.id) ?? []).length, 0);

  const payload = (data: CategoryForm) => ({
    name:           data.name,
    description:    data.description,
    imageUrl:       data.image?.url     ?? null,
    imageAssetId:   data.image?.assetId ?? null,
    parentId:       data.parentId || null,
    inAgentContext: data.inAgentContext,
    hidden:         data.hidden,
  });

  const addCategory = async (data: CategoryForm) => {
    setSaving(true);
    await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(data)) });
    setSaving(false); setShowForm(false); onChange();
  };

  const updateCategory = async (id: string, data: CategoryForm) => {
    setSaving(true);
    await fetch(`/api/categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(data)) });
    setSaving(false); setEditId(null); onChange();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Delete this category? Products in it will be uncategorised.')) return;
    await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    if (selectedId === id) setSelectedId(null);
    onChange();
  };

  const selectedProds = selected ? (byCategory.get(selected.id) ?? []) : [];

  return (
    <div className="h-full flex">
      {/* ── LEFT: category list ─────────────────────────────────── */}
      <div className="w-[340px] shrink-0 border-r border-white/8 flex flex-col">
        <div className="p-3 border-b border-white/8">
          <button onClick={() => { setShowForm(true); setEditId(null); setSelectedId(null); }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#25D366] text-black hover:bg-[#22c55e] transition-all">
            <Plus size={14} /> Add Category
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {categories.length === 0 ? (
            <div className="text-center py-16 px-4 text-white/20">
              <Tags size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No categories yet</p>
            </div>
          ) : ordered.map(({ c, indent }) => {
            const count = countFor(c);
            const hasChildren = (childrenByParent.get(c.id) ?? []).length > 0;
            const isSel = selectedId === c.id && !showForm && !editId;
            return (
              <button key={c.id}
                onClick={() => { setSelectedId(c.id); setShowForm(false); setEditId(null); }}
                className={`w-full flex items-center gap-2.5 py-2 pr-3 text-left border-l-2 transition-colors ${indent ? 'pl-7' : 'pl-3'} ${
                  isSel ? 'bg-[#25D366]/10 border-[#25D366]' : 'border-transparent hover:bg-white/5'
                }`}>
                {indent && <span className="text-white/20 text-xs -ml-3 shrink-0">↳</span>}
                <div className="w-9 h-9 rounded-md overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                  {imageSrc(toImage(c))
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={imageSrc(toImage(c))} alt="" className="w-full h-full object-cover" />
                    : <Tags size={15} className="text-white/20" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-xs font-medium truncate ${c.hidden ? 'text-white/40 line-through' : isSel ? 'text-white' : 'text-white/85'}`}>{c.name}</p>
                    {hasChildren && <span className="text-[8px] uppercase tracking-wide bg-white/10 text-white/40 px-1 py-0.5 rounded shrink-0">main</span>}
                    {c.hidden ? <EyeOff size={11} className="text-red-400/70 shrink-0" /> : c.inAgentContext && <Bot size={11} className="text-[#25D366] shrink-0" />}
                  </div>
                  <p className="text-white/30 text-[10px] mt-0.5">
                    {hasChildren ? `${(childrenByParent.get(c.id) ?? []).length} subcategor${(childrenByParent.get(c.id) ?? []).length !== 1 ? 'ies' : 'y'} · ` : ''}{count} product{count !== 1 ? 's' : ''}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT: detail / form ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {showForm ? (
          <div className="max-w-2xl mx-auto p-6 space-y-4">
            <h2 className="text-white font-semibold text-sm">New category</h2>
            <CategoryFormCard onSave={addCategory} onCancel={() => setShowForm(false)} loading={saving} parentOptions={categories} />
          </div>
        ) : editId && selected ? (
          <div className="max-w-2xl mx-auto p-6 space-y-4">
            <h2 className="text-white font-semibold text-sm">Edit “{selected.name}”</h2>
            <CategoryFormCard
              initial={{ name: selected.name, description: selected.description ?? '', image: toImage(selected), parentId: selected.parentId ?? '', inAgentContext: selected.inAgentContext, hidden: selected.hidden }}
              onSave={data => updateCategory(selected.id, data)}
              onCancel={() => setEditId(null)}
              loading={saving}
              parentOptions={categories.filter(c => c.id !== selected.id)}
            />
          </div>
        ) : selected ? (
          <div className="max-w-2xl mx-auto p-6 space-y-5">
            {/* category preview */}
            <div className="flex gap-4">
              <div className="w-28 h-28 rounded-xl overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                {imageSrc(toImage(selected))
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={imageSrc(toImage(selected))} alt="" className="w-full h-full object-cover" />
                  : <Tags size={28} className="text-white/20" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-white font-semibold text-base">{selected.name}</h2>
                  {selected.hidden && (
                    <span className="text-[9px] bg-red-500/15 text-red-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><EyeOff size={8} /> Hidden</span>
                  )}
                  {selected.inAgentContext && !selected.hidden && (
                    <span className="text-[9px] bg-[#25D366]/15 text-[#25D366] px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Bot size={8} /> In agent</span>
                  )}
                  <span className="text-[9px] bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full">{selectedProds.length} product{selectedProds.length !== 1 ? 's' : ''}</span>
                </div>
                {selected.description && <p className="text-white/50 text-xs leading-relaxed mt-1.5">{selected.description}</p>}
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => setEditId(selected.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-white/15 bg-white/5 text-white/60 hover:text-[#25D366] hover:bg-[#25D366]/10 transition-all">
                    <Pencil size={12} /> Edit
                  </button>
                  <button onClick={() => deleteCategory(selected.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-white/15 bg-white/5 text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            </div>

            {/* products in this category */}
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-wider mb-2">Products in this category</p>
              {selectedProds.length === 0 ? (
                <p className="text-white/30 text-xs">No products in this category yet.</p>
              ) : (
                <div className="space-y-2">
                  {selectedProds.map(p => (
                    <div key={p.id} className="flex gap-3 bg-[#111b21] border border-white/8 rounded-lg p-2.5">
                      <div className="w-14 h-14 rounded-md overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                        {p.media?.[0]
                          ? (p.media[0].type === 'video'
                              ? <video src={productMediaSrc(p.media[0])} className="w-full h-full object-cover" muted />
                              // eslint-disable-next-line @next/next/no-img-element
                              : <img src={productMediaSrc(p.media[0])} alt="" className="w-full h-full object-cover" />)
                          : <Package size={16} className="text-white/20" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white/85 text-xs font-medium truncate">{p.name}</p>
                          {p.priceRange && <span className="text-[#25D366]/80 text-[11px] shrink-0">{p.priceRange}</span>}
                        </div>
                        {p.description && <p className="text-white/35 text-[11px] mt-1 line-clamp-2 leading-relaxed">{p.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-white/20 px-6">
            <Tags size={30} className="mb-3 opacity-30" />
            <p className="text-sm">Select a category to see its details &amp; products</p>
          </div>
        )}
      </div>
    </div>
  );
}
