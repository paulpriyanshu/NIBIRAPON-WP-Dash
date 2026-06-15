'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Images, Film, ImageIcon, X, ChevronLeft, ChevronRight,
  Package, Tags, GitBranch, Play,
} from 'lucide-react';

interface MediaUsage { kind: 'product' | 'category' | 'flow'; label: string; href: string; }
interface MediaItem { key: string; type: 'image' | 'video'; src: string; description?: string; usages: MediaUsage[]; }

const USAGE_ICON = { product: Package, category: Tags, flow: GitBranch } as const;
const USAGE_LABEL = { product: 'Product', category: 'Category', flow: 'Flow' } as const;

export default function MediaLibrary({ items }: { items: MediaItem[] }) {
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const [open, setOpen] = useState<number | null>(null);

  const list = items.filter(i => filter === 'all' || i.type === filter);
  const imgCount = items.filter(i => i.type === 'image').length;
  const vidCount = items.filter(i => i.type === 'video').length;

  const close = useCallback(() => setOpen(null), []);
  const prev  = useCallback(() => setOpen(o => (o === null ? o : (o - 1 + list.length) % list.length)), [list.length]);
  const next  = useCallback(() => setOpen(o => (o === null ? o : (o + 1) % list.length)), [list.length]);

  useEffect(() => {
    if (open === null) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, close, prev, next]);

  const setFilterSafe = (f: 'all' | 'image' | 'video') => { setOpen(null); setFilter(f); };
  const current = open !== null ? list[open] : null;

  return (
    <div className="h-full flex flex-col bg-[#0b141a] overflow-hidden">
      {/* header */}
      <div className="px-6 pt-6 pb-0 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-3 pb-4">
          <div className="w-9 h-9 bg-[#25D366]/15 rounded-xl flex items-center justify-center">
            <Images size={18} className="text-[#25D366]" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">Media</h1>
            <p className="text-white/40 text-xs">{items.length} file{items.length !== 1 ? 's' : ''} · {imgCount} image{imgCount !== 1 ? 's' : ''} · {vidCount} video{vidCount !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex gap-1">
          {([['all', 'All', Images], ['image', 'Images', ImageIcon], ['video', 'Videos', Film]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setFilterSafe(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all ${
                filter === key ? 'border-[#25D366] text-white' : 'border-transparent text-white/40 hover:text-white/70'
              }`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {list.length === 0 ? (
          <div className="text-center py-20 text-white/20">
            <Images size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No media yet</p>
            <p className="text-xs mt-1 text-white/15">Photos and videos used in products, categories and flows show up here</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {list.map((m, i) => (
              <button key={m.key} onClick={() => setOpen(i)}
                className="group relative aspect-square rounded-xl overflow-hidden bg-[#1f2c34] border border-white/8 hover:border-[#25D366]/40 transition-all">
                {m.type === 'video'
                  ? <video src={m.src} className="w-full h-full object-cover" muted preload="metadata" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={m.src} alt={m.description || ''} className="w-full h-full object-cover" loading="lazy" />}

                {m.type === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center"><Play size={15} className="text-white ml-0.5" /></div>
                  </div>
                )}

                {/* bottom gradient + usage count */}
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] text-white/90">{m.usages.length} use{m.usages.length !== 1 ? 's' : ''}</span>
                </div>
                <span className="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-black/55 text-white/80 flex items-center gap-0.5">
                  {m.type === 'video' ? <Film size={9} /> : <ImageIcon size={9} />}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* lightbox carousel */}
      {current && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col" onClick={close}>
          {/* top bar */}
          <div className="flex items-center justify-between px-5 py-3 shrink-0" onClick={e => e.stopPropagation()}>
            <span className="text-white/50 text-xs">{(open ?? 0) + 1} / {list.length}</span>
            <button onClick={close} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all"><X size={18} /></button>
          </div>

          {/* stage */}
          <div className="flex-1 flex items-center justify-center min-h-0 px-2 sm:px-14 relative" onClick={e => e.stopPropagation()}>
            {list.length > 1 && (
              <button onClick={prev} className="absolute left-2 sm:left-4 z-10 p-2.5 rounded-full bg-white/8 text-white/70 hover:bg-white/15 hover:text-white transition-all"><ChevronLeft size={22} /></button>
            )}

            <div className="max-w-5xl w-full h-full flex items-center justify-center">
              {current.type === 'video'
                ? <video key={current.key} src={current.src} controls autoPlay className="max-h-full max-w-full rounded-lg" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img key={current.key} src={current.src} alt={current.description || ''} className="max-h-full max-w-full object-contain rounded-lg" />}
            </div>

            {list.length > 1 && (
              <button onClick={next} className="absolute right-2 sm:right-4 z-10 p-2.5 rounded-full bg-white/8 text-white/70 hover:bg-white/15 hover:text-white transition-all"><ChevronRight size={22} /></button>
            )}
          </div>

          {/* details */}
          <div className="shrink-0 max-h-[34%] overflow-y-auto px-5 py-4 border-t border-white/10 bg-[#0b141a]/60" onClick={e => e.stopPropagation()}>
            <div className="max-w-3xl mx-auto space-y-3">
              {current.description && <p className="text-white/70 text-sm">{current.description}</p>}
              <div>
                <p className="text-white/35 text-[10px] uppercase tracking-wider mb-1.5">Used in {current.usages.length} place{current.usages.length !== 1 ? 's' : ''}</p>
                {current.usages.length === 0 ? (
                  <p className="text-white/30 text-xs">Not referenced anywhere — safe to remove.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {current.usages.map((u, i) => {
                      const Icon = USAGE_ICON[u.kind];
                      return (
                        <Link key={i} href={u.href}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1f2c34] border border-white/10 text-white/70 text-xs hover:border-[#25D366]/40 hover:text-white transition-all">
                          <Icon size={12} className="text-[#25D366]" />
                          <span className="text-white/35">{USAGE_LABEL[u.kind]}:</span> {u.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* filmstrip */}
          {list.length > 1 && (
            <div className="shrink-0 px-3 py-2.5 border-t border-white/10 overflow-x-auto" onClick={e => e.stopPropagation()}>
              <div className="flex gap-1.5 justify-center min-w-min">
                {list.map((m, i) => (
                  <button key={m.key} onClick={() => setOpen(i)}
                    className={`w-12 h-12 rounded-md overflow-hidden shrink-0 border-2 transition-all ${i === open ? 'border-[#25D366]' : 'border-transparent opacity-50 hover:opacity-90'}`}>
                    {m.type === 'video'
                      ? <video src={m.src} className="w-full h-full object-cover" muted preload="metadata" />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={m.src} alt="" className="w-full h-full object-cover" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
