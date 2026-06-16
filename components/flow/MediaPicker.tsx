'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Film, ImageIcon, Images, Play } from 'lucide-react';

interface Item { key: string; type: 'image' | 'video'; src: string; assetId?: string; url?: string; description?: string; }
export interface PickedMedia { type: 'image' | 'video'; assetId?: string; url?: string; }

/**
 * Modal that lists the media library (GET /api/media) and lets the user pick one
 * item. Rendered via a portal so it escapes React Flow's transformed canvas.
 */
export default function MediaPicker({ onPick, onClose }: {
  onPick: (m: PickedMedia) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');

  useEffect(() => {
    fetch('/api/media').then(r => (r.ok ? r.json() : [])).then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const list = (items ?? []).filter(i => filter === 'all' || i.type === filter);
  const pick = (i: Item) => { onPick({ type: i.type, assetId: i.assetId, url: i.url }); onClose(); };

  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-[#1f2c34] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/8 shrink-0">
          <Images size={16} className="text-[#25D366]" />
          <span className="text-white font-semibold text-sm flex-1">Choose from Media</span>
          {(['all', 'image', 'video'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-lg text-[11px] capitalize transition-all ${filter === f ? 'bg-[#25D366] text-black' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
              {f === 'all' ? 'All' : f + 's'}
            </button>
          ))}
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all"><X size={16} /></button>
        </div>

        {/* grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {items === null ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-white/30" /></div>
          ) : list.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <Images size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No media yet</p>
              <p className="text-xs mt-1 text-white/15">Upload photos &amp; videos in the Media tab, then pick them here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
              {list.map(i => (
                <button key={i.key} onClick={() => pick(i)}
                  className="group relative aspect-square rounded-lg overflow-hidden bg-[#0b141a] border border-white/8 hover:border-[#25D366]/50 transition-all">
                  {i.type === 'video'
                    ? <video src={i.src} className="w-full h-full object-cover" muted preload="metadata" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={i.src} alt={i.description || ''} className="w-full h-full object-cover" loading="lazy" />}
                  {i.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center"><Play size={12} className="text-white ml-0.5" /></div>
                    </div>
                  )}
                  <span className="absolute top-1 right-1 text-[8px] px-1 py-0.5 rounded-full bg-black/55 text-white/80 flex items-center gap-0.5">
                    {i.type === 'video' ? <Film size={8} /> : <ImageIcon size={8} />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
