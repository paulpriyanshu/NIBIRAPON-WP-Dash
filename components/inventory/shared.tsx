'use client';
import { useRef, useState } from 'react';
import { Upload, Link2, Loader2, Trash2, ImageIcon } from 'lucide-react';

export const inputCls = 'w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-[#25D366]/50 transition-colors';

/** A single image — either an uploaded R2 asset or a pasted public URL. */
export interface SingleImage { assetId?: string; url?: string; }

/** Browser-renderable source for a stored asset or a pasted URL. */
export function imageSrc(img: SingleImage | null | undefined): string {
  if (!img) return '';
  if (img.assetId) return `/api/inventory/media/${img.assetId}`;
  return img.url || '';
}

const MAX_IMAGE = 5 * 1024 * 1024;

/** Upload-or-paste picker for a single image (used by categories). */
export function SingleImagePicker({ value, onChange }: {
  value: SingleImage | null;
  onChange: (img: SingleImage | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [urlValue,  setUrlValue]  = useState('');
  const [error,     setError]     = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      if (!file.type.startsWith('image')) { setError('Only image files'); return; }
      if (file.size > MAX_IMAGE) { setError(`Too large (max ${Math.round(MAX_IMAGE / 1024 / 1024)} MB)`); return; }

      const signRes = await fetch('/api/inventory/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: file.type }),
      });
      const sign = await signRes.json();
      if (!signRes.ok || !sign.uploadUrl) { setError(sign.error || 'Upload failed'); return; }

      const putRes = await fetch(sign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!putRes.ok) { setError(`Upload failed (${putRes.status})`); return; }

      onChange({ assetId: sign.assetId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addUrl = () => {
    const v = urlValue.trim();
    if (!v) return;
    onChange({ url: v });
    setUrlValue('');
  };

  const src = imageSrc(value);

  return (
    <div className="space-y-2.5">
      {src ? (
        <div className="flex items-center gap-3">
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-white/5 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="w-full h-full object-cover" />
          </div>
          <button type="button" onClick={() => onChange(null)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <Trash2 size={12} /> Remove image
          </button>
        </div>
      ) : (
        <div className="w-20 h-20 rounded-lg bg-white/5 flex items-center justify-center text-white/20">
          <ImageIcon size={20} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onFile(e.target.files)} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-all">
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? 'Uploading…' : 'Upload image'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Link2 size={13} className="text-white/30 shrink-0" />
        <input value={urlValue} onChange={e => setUrlValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addUrl())}
          placeholder="…or paste a public image URL" className={inputCls} />
        <button type="button" onClick={addUrl} disabled={!urlValue.trim()}
          className="px-3 py-1.5 rounded-lg text-xs bg-white/10 text-white/70 hover:bg-white/15 disabled:opacity-40 transition-all shrink-0">
          Add
        </button>
      </div>

      {error && <p className="text-red-400 text-[11px]">{error}</p>}
    </div>
  );
}
