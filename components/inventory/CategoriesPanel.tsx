'use client';
import { useState } from 'react';
import {
  Tags, Plus, Trash2, Pencil, Check, Loader2, Bot, ImageIcon,
} from 'lucide-react';
import { inputCls, imageSrc, SingleImagePicker, type SingleImage } from './shared';

export interface Category {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageAssetId: string | null;
  sortOrder: number;
  inAgentContext: boolean;
}

const EMPTY = { name: '', description: '', image: null as SingleImage | null, inAgentContext: true };
type CategoryForm = typeof EMPTY;

function toImage(c: Pick<Category, 'imageAssetId' | 'imageUrl'>): SingleImage | null {
  if (c.imageAssetId) return { assetId: c.imageAssetId };
  if (c.imageUrl)     return { url: c.imageUrl };
  return null;
}

function CategoryFormCard({ initial, onSave, onCancel, loading }: {
  initial?: Partial<CategoryForm>;
  onSave: (data: CategoryForm) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
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

  const payload = (data: CategoryForm) => ({
    name:           data.name,
    description:    data.description,
    imageUrl:       data.image?.url     ?? null,
    imageAssetId:   data.image?.assetId ?? null,
    inAgentContext: data.inAgentContext,
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
    onChange();
  };

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex justify-end">
        <button onClick={() => { setShowForm(true); setEditId(null); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#25D366] text-black hover:bg-[#22c55e] transition-all">
          <Plus size={14} /> Add Category
        </button>
      </div>

      {showForm && <CategoryFormCard onSave={addCategory} onCancel={() => setShowForm(false)} loading={saving} />}

      {categories.length === 0 && !showForm ? (
        <div className="text-center py-16 text-white/20">
          <Tags size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No categories yet</p>
          <p className="text-xs mt-1 text-white/15">Add categories with images for the agent to show customers</p>
        </div>
      ) : (
        categories.map(c => (
          <div key={c.id} className="bg-[#1f2c34] border border-white/8 rounded-xl overflow-hidden">
            {editId === c.id ? (
              <div className="p-3">
                <CategoryFormCard
                  initial={{ name: c.name, description: c.description ?? '', image: toImage(c), inAgentContext: c.inAgentContext }}
                  onSave={data => updateCategory(c.id, data)}
                  onCancel={() => setEditId(null)}
                  loading={saving}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                  {imageSrc(toImage(c))
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={imageSrc(toImage(c))} alt="" className="w-full h-full object-cover" />
                    : <Tags size={16} className="text-white/20" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-xs font-medium truncate">{c.name}</p>
                    {c.inAgentContext && (
                      <span className="text-[9px] bg-[#25D366]/15 text-[#25D366] px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                        <Bot size={8} /> In agent
                      </span>
                    )}
                  </div>
                  {c.description && <p className="text-white/30 text-[10px] truncate mt-0.5">{c.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => { setEditId(c.id); setShowForm(false); }} className="p-1.5 rounded-lg text-white/25 hover:text-[#25D366] hover:bg-[#25D366]/10 transition-all">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => deleteCategory(c.id)} className="p-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
