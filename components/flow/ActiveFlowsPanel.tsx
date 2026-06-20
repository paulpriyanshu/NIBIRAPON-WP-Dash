'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Radio, Play, Pause, Send, Loader2, Users, CheckCircle2,
  Megaphone, AlertTriangle, RefreshCw, Layers, ChevronDown, ChevronUp, X, ShoppingBag,
  ImagePlus, Images, Trash2, BarChart3, TrendingUp, MailCheck, Star,
} from 'lucide-react';
import {
  findRootNodes, getTemplate, flowParamSpecs, specNeedsConfig,
  type Flow as EngineFlow, type NodeParams, type TemplateParamSpec,
} from '@/lib/flow-engine';
import type { TemplateMessage, TemplateMessageConfig } from '@/lib/templates';

interface MediaItem { key: string; type: 'image' | 'video'; src: string; assetId?: string; url?: string; name?: string; bytes?: number; createdAt?: number; }
/** Human file size, e.g. 6.9 MB. */
function fmtBytes(b?: number): string {
  if (!b || b <= 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
interface PickMedia { type: 'image' | 'video'; assetId?: string; url?: string }
/** A product offered in the MPM/catalog picker — mapped to WhatsApp by its contentId. */
interface PickProduct { id: string; name: string; contentId: string | null; priceRange: string | null; parentId: string | null; media: PickMedia[] }
function pickMediaSrc(m?: PickMedia): string { return m ? (m.assetId ? `/api/inventory/media/${m.assetId}` : (m.url ?? '')) : ''; }

/** Download the flow's participants as a CSV lead list (deepest first). */
function exportLeads(flowName: string, participants: FlowParticipant[]) {
  const header = ['Name', 'Phone', 'Reached step', 'Total steps', 'Reached node', 'Taps', 'Status', 'Last active'];
  const rows = participants.map(p => [
    p.name, p.phone, String(p.depth), String(p.totalSteps), p.reachedLabel,
    String(p.stepCount), p.status, new Date(p.lastAt).toLocaleString(),
  ]);
  const csv = [header, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${flowName.replace(/[^a-z0-9]+/gi, '_')}_leads.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Flow extends EngineFlow {
  _id: string;
  nodeCount?: number;
  edgeCount?: number;
  updatedAt?: string;
}
interface RunStats { active: number; completed: number; stopped: number; total: number; }
interface FunnelStep { nodeId: string; label: string; type: string; count: number }
interface FlowParticipant {
  phone: string; name: string; reachedNodeId: string; reachedLabel: string;
  depth: number; totalSteps: number; stepCount: number; lastAt: string;
  status: 'active' | 'completed' | 'stopped';
}
interface FlowTracking {
  sent: number; delivered: number; started: number; completed: number;
  active: number; stopped: number; total: number; funnel: FunnelStep[];
  participants: FlowParticipant[];
}

const inputCls = 'w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-[#25D366]/50';

function emptyParams(s: TemplateParamSpec, saved?: NodeParams): NodeParams {
  return {
    bodyParams: Array.from({ length: s.bodyParams }, (_, i) => saved?.bodyParams?.[i] ?? ''),
    headerParam: saved?.headerParam ?? '',
    headerMediaUrl: saved?.headerMediaUrl ?? '',
    headerMediaAssetId: saved?.headerMediaAssetId ?? '',
    thumbnailProductRetailerId: saved?.thumbnailProductRetailerId ?? '',
    mpmSections: saved?.mpmSections?.length ? saved.mpmSections : [{ title: '', productIds: '' }],
  };
}

/** Map a saved template message's config into this node's NodeParams (config is NodeParams-shaped). */
function paramsFromConfig(s: TemplateParamSpec, cfg: TemplateMessageConfig): NodeParams {
  return {
    bodyParams: Array.from({ length: s.bodyParams }, (_, i) => cfg.bodyParams?.[i] ?? ''),
    headerParam: cfg.headerParam ?? '',
    headerMediaUrl: cfg.headerMediaUrl ?? '',
    headerMediaAssetId: cfg.headerMediaAssetId ?? '',
    thumbnailProductRetailerId: cfg.thumbnailProductRetailerId ?? '',
    mpmSections: cfg.mpmSections?.length ? cfg.mpmSections : [{ title: '', productIds: '' }],
  };
}

/**
 * Header media picker for a template launch param. Three ways to set the header
 * image/video: upload a file (→ R2, stored as an asset key), pick one from the
 * Media library, or paste a public URL (kept as-is). Upload/library set
 * headerMediaAssetId (resolved to a fetchable link at send time); a pasted URL
 * sets headerMediaUrl. Each input clears the other so only one source wins.
 */
function HeaderMediaField({ spec, v, patch, media }: {
  spec: TemplateParamSpec;
  v: NodeParams;
  patch: (fn: (p: NodeParams) => NodeParams) => void;
  media: MediaItem[];
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [showLib, setShowLib] = useState(false);
  const [sizes, setSizes] = useState<Record<string, number>>({}); // lazily fetched file sizes
  const fileRef = useRef<HTMLInputElement>(null);

  const fmt = (spec.headerFormat ?? 'IMAGE').toUpperCase();
  const previewType: 'image' | 'video' = fmt === 'VIDEO' ? 'video' : 'image';
  const accept = fmt === 'VIDEO' ? 'video/*' : fmt === 'DOCUMENT' ? 'application/pdf,image/*' : 'image/*';

  const currentSrc = v.headerMediaAssetId ? `/api/inventory/media/${v.headerMediaAssetId}` : (v.headerMediaUrl ?? '');
  const hasMedia = !!(v.headerMediaAssetId || v.headerMediaUrl?.trim());
  const libItems = media.filter(m => m.type === previewType);

  // When the library opens, fill in any sizes we don't already know (HEAD lookup).
  useEffect(() => {
    if (!showLib) return;
    libItems.forEach(m => {
      if (m.bytes || sizes[m.key]) return;
      const q = m.assetId ? `assetId=${encodeURIComponent(m.assetId)}` : `url=${encodeURIComponent(m.url ?? '')}`;
      fetch(`/api/media/size?${q}`).then(r => r.ok ? r.json() : null).then(d => {
        if (d?.bytes) setSizes(s => ({ ...s, [m.key]: d.bytes }));
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLib]);

  const setAsset = (assetId: string) => patch(p => ({ ...p, headerMediaAssetId: assetId, headerMediaUrl: '' }));
  const setUrl   = (url: string)     => patch(p => ({ ...p, headerMediaUrl: url, headerMediaAssetId: '' }));
  const clear    = ()                => patch(p => ({ ...p, headerMediaUrl: '', headerMediaAssetId: '' }));

  const onFile = async (file?: File) => {
    if (!file) return;
    setErr(''); setUploading(true);
    try {
      const signRes = await fetch('/api/inventory/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: file.type }),
      });
      const sign = await signRes.json();
      if (!signRes.ok || !sign.uploadUrl) throw new Error(sign.error || 'upload failed');
      const put = await fetch(sign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error(`upload failed (${put.status})`);
      setAsset(sign.assetId);
      setShowLib(false);
      // Record it in the Media library so it shows in the Media tab and can be re-picked.
      fetch('/api/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: sign.assetId, type: previewType }),
      }).catch(() => {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-white/40 text-[10px] uppercase tracking-wider block">{fmt.toLowerCase()} header</label>

      {hasMedia && (
        <div className="flex gap-2 bg-[#0b141a] border border-white/8 rounded-lg p-1.5">
          <div className="w-12 h-12 rounded-md overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
            {previewType === 'video'
              ? <video src={currentSrc} className="w-full h-full object-cover" muted />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={currentSrc} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <span className="text-white/60 text-[10px]">{previewType} · {v.headerMediaAssetId ? 'uploaded' : 'url'}</span>
            <span className="text-white/25 text-[9px] truncate">{currentSrc}</span>
          </div>
          <button onClick={clear} className="p-1 rounded text-white/25 hover:text-red-400 hover:bg-red-500/10 self-start">
            <Trash2 size={12} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <input ref={fileRef} type="file" accept={accept} hidden onChange={e => onFile(e.target.files?.[0])} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-all">
          {uploading ? <Loader2 size={10} className="animate-spin" /> : <ImagePlus size={10} />}
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <button onClick={() => setShowLib(s => !s)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all">
          <Images size={10} /> From library
        </button>
      </div>

      {showLib && (
        libItems.length === 0
          ? <p className="text-white/30 text-[10px]">No {previewType}s in the library yet.</p>
          : <div className="max-h-48 overflow-y-auto bg-[#0b141a] border border-white/8 rounded-lg divide-y divide-white/5">
              {libItems.map(m => {
                const selected = (!!m.assetId && m.assetId === v.headerMediaAssetId) || (!!m.url && m.url === v.headerMediaUrl);
                const size = fmtBytes(m.bytes ?? sizes[m.key]);
                const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '';
                return (
                  <button key={m.key} onClick={() => { if (m.assetId) setAsset(m.assetId); else setUrl(m.url ?? ''); setShowLib(false); }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-all ${selected ? 'bg-[#25D366]/10' : 'hover:bg-white/[0.04]'}`}>
                    <div className={`w-9 h-9 rounded-md overflow-hidden shrink-0 border ${selected ? 'border-[#25D366]' : 'border-white/10'}`}>
                      {m.type === 'video'
                        ? <video src={m.src} className="w-full h-full object-cover" muted />
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={m.src} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/80 text-[11px] truncate">{m.name || 'Untitled'}</p>
                      <p className="text-white/35 text-[9px] truncate">
                        {[size, date].filter(Boolean).join(' · ') || m.type}
                      </p>
                    </div>
                    {selected && <CheckCircle2 size={13} className="text-[#25D366] shrink-0" />}
                  </button>
                );
              })}
            </div>
      )}

      {/* Paste a public URL — kept as the original option. */}
      <input value={v.headerMediaUrl ?? ''} onChange={e => setUrl(e.target.value)}
        placeholder={`or paste ${fmt.toLowerCase()} URL (https://…)`} className={inputCls} />

      {err && <p className="text-red-400 text-[10px]">{err}</p>}
    </div>
  );
}

/** Pick the thumbnail product (single) — stores the product's Content ID. */
function ProductThumbSelect({ products, value, onChange }: { products: PickProduct[]; value: string; onChange: (contentId: string) => void }) {
  const usable = products.filter(p => p.contentId);
  return (
    <div>
      <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
        <option value="">— pick the thumbnail product —</option>
        {usable.map(p => <option key={p.id} value={p.contentId!}>{p.name}{p.priceRange ? ` · ${p.priceRange}` : ''}</option>)}
        {value && !usable.some(p => p.contentId === value) && <option value={value}>{value} (current)</option>}
      </select>
      {usable.length === 0 && <p className="text-amber-400/70 text-[10px] mt-1">No products have a Content ID yet — add one per product in Inventory to pick them here.</p>}
    </div>
  );
}

/** Pick the MPM products (multi) — stores their Content IDs as a comma list. */
function ProductMultiSelect({ products, value, onChange }: { products: PickProduct[]; value: string; onChange: (csv: string) => void }) {
  const [q, setQ] = useState('');
  const selectedIds = value.split(',').map(s => s.trim()).filter(Boolean);
  const toggle = (cid: string) => {
    const set = new Set(selectedIds);
    if (set.has(cid)) set.delete(cid); else set.add(cid);
    onChange([...set].join(','));
  };
  const ql = q.toLowerCase();
  // Show ALL products (parents AND variants); only those with a Content ID can be
  // picked — the rest are shown disabled so you know to add an ID in Inventory.
  const filtered = products.filter(p => p.name.toLowerCase().includes(ql) || (p.contentId ?? '').toLowerCase().includes(ql));
  const byCid = new Map(products.filter(p => p.contentId).map(p => [p.contentId!, p]));
  const missingContentId = products.some(p => !p.contentId);
  return (
    <div className="space-y-1.5">
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedIds.map(cid => {
            const p = byCid.get(cid);
            return (
              <span key={cid} className="flex items-center gap-1 text-[10px] bg-[#25D366]/15 text-[#25D366] px-1.5 py-0.5 rounded-full">
                {p?.name ?? cid}
                <button onClick={() => toggle(cid)} className="hover:text-red-400"><X size={9} /></button>
              </span>
            );
          })}
        </div>
      )}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search products to add…" className={inputCls} />
      {products.length === 0 ? (
        <p className="text-white/30 text-[10px]">No products yet.</p>
      ) : (
        <div className="max-h-44 overflow-y-auto bg-[#0b141a] border border-white/8 rounded-lg divide-y divide-white/5">
          {filtered.map(p => {
            const usable = !!p.contentId;
            const on = usable && selectedIds.includes(p.contentId!);
            return (
              <button key={p.id} onClick={() => usable && toggle(p.contentId!)} disabled={!usable}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${on ? 'bg-[#25D366]/10' : usable ? 'hover:bg-white/5' : 'opacity-50 cursor-not-allowed'}`}>
                <input type="checkbox" readOnly checked={on} disabled={!usable} className="accent-[#25D366] shrink-0" />
                <div className="w-7 h-7 rounded overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                  {p.media?.[0]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={pickMediaSrc(p.media[0])} alt="" className="w-full h-full object-cover" />
                    : null}
                </div>
                <span className="flex-1 min-w-0 text-white/75 text-[10px] truncate">
                  {p.parentId && <span className="text-white/30">↳ </span>}{p.name}
                  {p.parentId && <span className="text-white/30 text-[8px] ml-1">variant</span>}
                </span>
                {!usable
                  ? <span className="text-amber-400/70 text-[8px] shrink-0">no Content ID</span>
                  : p.priceRange && <span className="text-white/35 text-[9px] shrink-0">{p.priceRange}</span>}
              </button>
            );
          })}
        </div>
      )}
      {missingContentId && (
        <p className="text-white/30 text-[9px]">Greyed products (and variants) need a Content ID — set one in Inventory to pick them.</p>
      )}
    </div>
  );
}

function FlowCard({ flow, onChanged, savedMessages, media, products, tracking, trackLoading, trackOpen, onToggleTracking, onReloadTracking }: {
  flow: Flow; onChanged: () => void; savedMessages: TemplateMessage[]; media: MediaItem[]; products: PickProduct[];
  tracking: FlowTracking | null; trackLoading: boolean; trackOpen: boolean; onToggleTracking: () => void; onReloadTracking: () => void;
}) {
  const roots = findRootNodes(flow);
  const specs = flowParamSpecs(flow);
  const isLive = flow.status === 'live';

  const [rootId, setRootId]     = useState<string>(flow.rootNodeId && roots.includes(flow.rootNodeId) ? flow.rootNodeId : roots[0] ?? '');
  const [toggling, setToggling] = useState(false);
  const [err, setErr]           = useState('');
  const [stats, setStats]       = useState<RunStats | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [tp, setTp] = useState<Record<string, NodeParams>>({});

  const [bcOpen, setBcOpen]     = useState(false);
  const [recipients, setRecipients] = useState('');
  const [launching, setLaunching]   = useState(false);
  const [result, setResult]         = useState('');

  const loadStats = useCallback(async () => {
    const res = await fetch(`/api/flows/${flow._id}/runs`);
    if (res.ok) setStats(await res.json());
  }, [flow._id]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const openModal = () => {
    setErr('');
    if (roots.length === 0) { setErr('No starting template'); return; }
    const init: Record<string, NodeParams> = {};
    for (const s of specs) init[s.nodeId] = emptyParams(s, flow.templateParams?.[s.nodeId]);
    setTp(init);
    setModalOpen(true);
  };

  const patch = (nodeId: string, fn: (p: NodeParams) => NodeParams) =>
    setTp(prev => ({ ...prev, [nodeId]: fn(prev[nodeId]) }));

  const goLive = async () => {
    const missing: string[] = [];
    for (const s of specs) {
      const v = tp[s.nodeId]; if (!v) continue;
      if (s.bodyParams > 0 && v.bodyParams.some(x => !x.trim())) missing.push(s.templateName);
      if (s.headerTextParams > 0 && !v.headerParam?.trim()) missing.push(`${s.templateName} (header)`);
      if (s.needsHeaderMedia && !v.headerMediaUrl?.trim() && !v.headerMediaAssetId?.trim()) missing.push(`${s.templateName} (media)`);
      if (s.isMPM && (!v.thumbnailProductRetailerId?.trim() || !v.mpmSections?.some(m => m.productIds.trim()))) missing.push(`${s.templateName} (products)`);
      if (s.isCatalog && !v.thumbnailProductRetailerId?.trim()) missing.push(`${s.templateName} (thumbnail)`);
    }
    if (missing.length) { setErr(`Fill all parameters: ${[...new Set(missing)].join(', ')}`); return; }

    setToggling(true); setErr('');
    const res = await fetch(`/api/flows/${flow._id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'live', rootNodeId: rootId || undefined, templateParams: tp }),
    });
    const d = await res.json();
    setToggling(false);
    if (!res.ok) { setErr(d.error || 'Failed'); return; }
    setModalOpen(false);
    onChanged();
  };

  const pause = async () => {
    setToggling(true); setErr('');
    const res = await fetch(`/api/flows/${flow._id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft' }),
    });
    setToggling(false);
    if (!res.ok) { const d = await res.json(); setErr(d.error || 'Failed'); return; }
    onChanged();
  };

  const launch = async () => {
    const list = recipients.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    if (list.length === 0) { setResult('Add at least one recipient'); return; }
    setLaunching(true); setResult('');
    const res = await fetch(`/api/flows/${flow._id}/launch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: list }),
    });
    const d = await res.json();
    setLaunching(false);
    if (!res.ok) { setResult(d.error || 'Launch failed'); return; }
    setResult(`✓ Started ${d.started}/${d.total}${d.failures?.length ? ` · ${d.failures.length} failed` : ''}`);
    setRecipients('');
    loadStats();
  };

  const rootTemplate = getTemplate(flow.nodes.find(n => n.id === (flow.rootNodeId || rootId)));

  return (
    <div className={`bg-[#1f2c34] border rounded-xl overflow-hidden ${isLive ? 'border-[#25D366]/40' : 'border-white/10'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isLive ? 'bg-[#25D366]/15' : 'bg-white/5'}`}>
          <Radio size={16} className={isLive ? 'text-[#25D366]' : 'text-white/30'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white text-sm font-medium truncate">{flow.name}</p>
            {isLive
              ? <span className="text-[9px] bg-[#25D366]/20 text-[#25D366] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" /> LIVE</span>
              : <span className="text-[9px] bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full font-medium">Draft</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-white/30 text-[10px]">
            <span>{flow.nodeCount ?? flow.nodes?.length ?? 0} nodes</span><span>·</span>
            <span>{specs.length} template{specs.length !== 1 ? 's' : ''}</span>
            {isLive && stats && <><span>·</span><span className="text-[#25D366]/70">{stats.active} active</span><span>{stats.completed} done</span></>}
          </div>
        </div>
        <button onClick={isLive ? pause : openModal} disabled={toggling || roots.length === 0}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium shrink-0 transition-all disabled:opacity-40 ${
            isLive ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25' : 'bg-[#25D366] text-black hover:bg-[#22c55e]'
          }`}>
          {toggling ? <Loader2 size={12} className="animate-spin" /> : isLive ? <Pause size={12} /> : <Play size={12} />}
          {isLive ? 'Pause' : 'Launch'}
        </button>
      </div>

      {err && !modalOpen && <p className="px-4 pb-2 text-red-400 text-[11px] flex items-center gap-1"><AlertTriangle size={11} /> {err}</p>}
      {roots.length === 0 && <p className="px-4 pb-3 text-amber-400/70 text-[10px]">No starting template — connect a template with no incoming arrow.</p>}

      {/* ── Broadcast root (when live) ─────────────────────────────── */}
      {isLive && (
        <div className="border-t border-white/8">
          <button onClick={() => setBcOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] text-white/60 hover:bg-white/[0.03] transition-colors">
            <span className="flex items-center gap-1.5"><Megaphone size={12} className="text-[#25D366]" /> Broadcast root template{rootTemplate ? ` — ${rootTemplate.name}` : ''}</span>
            {bcOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {bcOpen && (
            <div className="px-4 pb-4 space-y-2.5">
              <div className="bg-[#111b21] border border-white/8 rounded-lg px-3 py-2 text-white/35 text-[10px] flex gap-1.5">
                <Layers size={11} className="text-[#25D366]/60 shrink-0 mt-0.5" />
                Sends the root template (with the parameters you set) to these contacts and starts a run for each. Button taps then advance the flow.
              </div>
              <div>
                <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1"><Users size={9} /> Recipients</label>
                <textarea value={recipients} onChange={e => setRecipients(e.target.value)} rows={2}
                  placeholder="Phone numbers, comma or newline separated — e.g. 919812345678, 919876543210"
                  className={`${inputCls} resize-none`} />
              </div>
              <div className="flex items-center justify-between">
                {result && <span className={`text-[11px] ${result.startsWith('✓') ? 'text-[#25D366]' : 'text-red-400'}`}>{result}</span>}
                <button onClick={launch} disabled={launching} className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-[#25D366] text-black font-medium hover:bg-[#22c55e] disabled:opacity-40 transition-all">
                  {launching ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Broadcast &amp; start
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tracking (delivery + node funnel; people list shows in the right column) ── */}
      {(isLive || (stats?.total ?? 0) > 0) && (
        <div className="border-t border-white/8">
          <button onClick={onToggleTracking}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] text-white/60 hover:bg-white/[0.03] transition-colors">
            <span className="flex items-center gap-1.5"><BarChart3 size={12} className="text-[#25D366]" /> Tracking</span>
            {trackOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {trackOpen && (
            <div className="px-4 pb-4 space-y-3">
              {trackLoading && !tracking ? (
                <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-white/30" /></div>
              ) : !tracking || tracking.total === 0 ? (
                <p className="text-white/30 text-[11px] py-2">No runs yet — broadcast the root template to start tracking.</p>
              ) : (
                <>
                  {/* headline metrics */}
                  <div className="grid grid-cols-4 gap-2">
                    {([
                      ['Sent',      tracking.sent,      Send,         'text-white/70'],
                      ['Delivered', tracking.delivered, MailCheck,    'text-blue-300'],
                      ['Started',   tracking.started,   TrendingUp,   'text-amber-300'],
                      ['Completed', tracking.completed, CheckCircle2, 'text-[#25D366]'],
                    ] as const).map(([label, val, Icon, color]) => (
                      <div key={label} className="bg-[#111b21] border border-white/8 rounded-lg px-2 py-2 text-center">
                        <Icon size={12} className={`mx-auto mb-1 ${color}`} />
                        <p className="text-white text-sm font-semibold leading-none">{val}</p>
                        <p className="text-white/35 text-[9px] uppercase tracking-wider mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-white/35">
                    <span className="text-[#25D366]/70">{tracking.active} active</span>
                    <span>{tracking.stopped} stopped</span>
                    <button onClick={onReloadTracking} className="ml-auto flex items-center gap-1 hover:text-white/70 transition-colors">
                      <RefreshCw size={10} /> Refresh
                    </button>
                  </div>

                  {/* node funnel — how far runs travelled */}
                  {tracking.funnel.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-white/40 text-[10px] uppercase tracking-wider">Node funnel — runs that reached each step</p>
                      {tracking.funnel.map((f, i) => {
                        const denom = tracking.sent || tracking.funnel[0]?.count || 1;
                        const pct = Math.min(100, Math.round((f.count / denom) * 100));
                        return (
                          <div key={f.nodeId} className="flex items-center gap-2">
                            <span className="text-white/25 text-[9px] w-4 text-right shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                <span className="text-white/70 text-[10px] truncate">{f.label}</span>
                                <span className="text-white/45 text-[10px] shrink-0">{f.count} · {pct}%</span>
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-[#25D366]/70 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <p className="text-white/25 text-[9px] flex items-center gap-1 pt-1">
                    <Users size={9} /> Per-number details are in the panel on the right →
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Launch params modal ────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-[#1f2c34] border border-white/12 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
              <div>
                <h3 className="text-white font-semibold text-sm">Launch “{flow.name}”</h3>
                <p className="text-white/40 text-[11px]">Fill the parameters for every template before going live.</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-white/30 hover:text-white"><X size={16} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {roots.length > 1 && (
                <div>
                  <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Start template</label>
                  <select value={rootId} onChange={e => setRootId(e.target.value)} className={inputCls}>
                    {roots.map(r => { const t = getTemplate(flow.nodes.find(n => n.id === r)); return <option key={r} value={r}>{t?.name ?? r}</option>; })}
                  </select>
                </div>
              )}

              {specs.map(s => {
                const v = tp[s.nodeId];
                if (!v) return null;
                const needs = specNeedsConfig(s);
                return (
                  <div key={s.nodeId} className="bg-[#111b21] border border-white/8 rounded-lg p-3 space-y-2">
                    <p className="text-white/70 text-[11px] font-medium flex items-center gap-1.5">
                      {s.isMPM || s.isCatalog ? <ShoppingBag size={11} className="text-[#25D366]" /> : <Layers size={11} className="text-[#25D366]" />}
                      {s.templateName}
                      {s.nodeId === rootId && <span className="text-[9px] bg-[#25D366]/15 text-[#25D366] px-1.5 py-0.5 rounded-full">start</span>}
                    </p>

                    {!needs && <p className="text-white/30 text-[10px]">No parameters needed.</p>}

                    {needs && (() => {
                      const matches = savedMessages.filter(m => m.templateName === s.templateName);
                      if (matches.length === 0) return null;
                      return (
                        <select value="" onChange={e => { const m = matches.find(x => x.id === e.target.value); if (m) patch(s.nodeId, () => paramsFromConfig(s, m.config)); }} className={`${inputCls} text-purple-200`}>
                          <option value="">Prefill from a saved message…</option>
                          {matches.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      );
                    })()}

                    {Array.from({ length: s.headerTextParams }).map((_, i) => i === 0 && (
                      <input key="hdr" value={v.headerParam ?? ''} onChange={e => patch(s.nodeId, p => ({ ...p, headerParam: e.target.value }))}
                        placeholder="Header text {{1}}" className={inputCls} />
                    ))}
                    {Array.from({ length: s.bodyParams }).map((_, i) => (
                      <input key={i} value={v.bodyParams[i] ?? ''} onChange={e => patch(s.nodeId, p => ({ ...p, bodyParams: p.bodyParams.map((x, idx) => idx === i ? e.target.value : x) }))}
                        placeholder={`Body variable {{${i + 1}}}`} className={inputCls} />
                    ))}
                    {s.needsHeaderMedia && (
                      <HeaderMediaField spec={s} v={v} media={media}
                        patch={fn => patch(s.nodeId, fn)} />
                    )}
                    {(s.isMPM || s.isCatalog) && (
                      <div>
                        <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Thumbnail product</label>
                        <ProductThumbSelect products={products} value={v.thumbnailProductRetailerId ?? ''}
                          onChange={cid => patch(s.nodeId, p => ({ ...p, thumbnailProductRetailerId: cid }))} />
                      </div>
                    )}
                    {s.isMPM && (
                      <>
                        <div>
                          <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 block">Products to show</label>
                          <ProductMultiSelect products={products} value={v.mpmSections?.[0]?.productIds ?? ''}
                            onChange={csv => patch(s.nodeId, p => ({ ...p, mpmSections: [{ title: p.mpmSections?.[0]?.title ?? '', productIds: csv }] }))} />
                        </div>
                        <input value={v.mpmSections?.[0]?.title ?? ''} onChange={e => patch(s.nodeId, p => ({ ...p, mpmSections: [{ title: e.target.value, productIds: p.mpmSections?.[0]?.productIds ?? '' }] }))}
                          placeholder="Section title (optional) — e.g. New Collection" className={inputCls} />
                      </>
                    )}
                  </div>
                );
              })}

              {err && <p className="text-red-400 text-[11px] flex items-center gap-1"><AlertTriangle size={11} /> {err}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/8 shrink-0">
              <button onClick={() => setModalOpen(false)} className="px-4 py-1.5 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={goLive} disabled={toggling}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-[#25D366] text-black font-medium hover:bg-[#22c55e] disabled:opacity-40 transition-all">
                {toggling ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Go live
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Extreme-right column: every number that interacted and how far they reached. */
function ParticipantsPanel({ tracking, loading, flowName, onRefresh }: { tracking: FlowTracking | null; loading: boolean; flowName: string; onRefresh: () => void }) {
  const people = tracking?.participants ?? [];
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Users size={13} className="text-[#25D366] shrink-0" />
          <span className="text-white text-[12px] font-semibold truncate">People reached</span>
          {people.length > 0 && <span className="text-white/35 text-[10px]">({people.length})</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {people.length > 0 && (
            <button onClick={() => exportLeads(flowName, people)} title="Export CSV"
              className="p-1.5 rounded-lg text-[#25D366]/80 hover:text-[#25D366] hover:bg-white/5 transition-colors"><Send size={12} /></button>
          )}
          <button onClick={onRefresh} title="Refresh" className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"><RefreshCw size={12} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && !tracking ? (
          <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-white/30" /></div>
        ) : people.length === 0 ? (
          <p className="text-white/25 text-[11px] px-4 py-6 text-center">No one has interacted yet.</p>
        ) : (
          <>
            <p className="text-white/25 text-[9px] px-4 pt-3 pb-2">★ went at least halfway — your warmest leads. Deepest first.</p>
            <div className="divide-y divide-white/5">
              {people.map(p => {
                const pct = Math.round((p.depth / (p.totalSteps || 1)) * 100);
                const deep = p.status === 'completed' || (p.stepCount > 0 && pct >= 50);
                const last = new Date(p.lastAt);
                return (
                  <div key={p.phone} className="px-4 py-2.5 hover:bg-white/[0.02]">
                    <div className="flex items-center gap-1.5">
                      {deep && <Star size={11} className="text-amber-300 shrink-0 fill-amber-300" />}
                      <span className="text-white/85 text-[12px] font-medium truncate flex-1">{p.name}</span>
                      <span className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded-full ${
                        p.status === 'completed' ? 'bg-[#25D366]/15 text-[#25D366]'
                        : p.status === 'active' ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-white/8 text-white/40'}`}>{p.status}</span>
                    </div>
                    <p className="text-white/40 text-[11px] mt-0.5 tabular-nums">{p.phone}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${deep ? 'bg-[#25D366]/70' : 'bg-white/25'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-[10px] shrink-0 ${deep ? 'text-[#25D366]' : 'text-white/45'}`}>{p.depth}/{p.totalSteps}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-white/30 text-[9px]">
                      <span className="truncate pr-2">→ {p.reachedLabel}</span>
                      <span className="shrink-0">{p.stepCount === 0 ? 'no taps' : `${p.stepCount} taps`} · {last.toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ActiveFlowsPanel() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedMessages, setSavedMessages] = useState<TemplateMessage[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [products, setProducts] = useState<PickProduct[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Tracking (lifted here so the per-number list can live in its own right column).
  const [trackOpen, setTrackOpen]       = useState(false);
  const [tracking, setTracking]         = useState<FlowTracking | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);

  const loadTracking = useCallback(async () => {
    if (!selectedId) return;
    setTrackLoading(true);
    try {
      const res = await fetch(`/api/flows/${selectedId}/tracking`);
      if (res.ok) setTracking(await res.json());
    } finally {
      setTrackLoading(false);
    }
  }, [selectedId]);
  const toggleTracking = () => setTrackOpen(o => { if (!o) loadTracking(); return !o; });
  // Reset tracking when the selected flow changes; reload if the panel is open.
  useEffect(() => { setTracking(null); if (trackOpen && selectedId) loadTracking(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedId]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/flows');
    if (res.ok) {
      const list: Flow[] = await res.json();
      setFlows(list);
      // Keep the current selection if it still exists, else select the first flow.
      setSelectedId(prev => (prev && list.some(f => f._id === prev)) ? prev : (list[0]?._id ?? null));
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/template-messages').then(r => r.ok ? r.json() : []).then(setSavedMessages).catch(() => {});
    fetch('/api/media').then(r => r.ok ? r.json() : []).then(setMedia).catch(() => {});
    fetch('/api/inventory').then(r => r.ok ? r.json() : []).then((rows: PickProduct[]) =>
      setProducts(rows.map(p => ({ id: p.id, name: p.name, contentId: p.contentId, priceRange: p.priceRange, parentId: p.parentId, media: p.media ?? [] })))
    ).catch(() => {});
  }, []);

  const liveCount = flows.filter(f => f.status === 'live').length;
  const selected = flows.find(f => f._id === selectedId) ?? null;

  return (
    <div className="h-full flex bg-[#0b141a]">
      {/* ── Master list ─────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-white/8 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/8">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-[#25D366]/15 rounded-lg flex items-center justify-center shrink-0">
              <Radio size={15} className="text-[#25D366]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-white font-bold text-sm leading-tight">Active Flows</h1>
              <p className="text-white/40 text-[10px]">{liveCount} live · {flows.length} total</p>
            </div>
          </div>
          <button onClick={load} title="Refresh" className="p-2 rounded-lg border border-white/12 bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-all shrink-0">
            <RefreshCw size={12} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            [...Array(4)].map((_, i) => <div key={i} className="h-14 bg-[#1f2c34] rounded-lg animate-pulse" />)
          ) : flows.length === 0 ? (
            <div className="text-center py-16 text-white/20 px-4">
              <Radio size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No flows yet</p>
              <p className="text-xs mt-1 text-white/15">Build one in the Builder tab first</p>
            </div>
          ) : (
            flows.map(f => {
              const live = f.status === 'live';
              const sel = f._id === selectedId;
              return (
                <button key={f._id} onClick={() => setSelectedId(f._id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 border transition-all ${sel ? 'bg-[#1f2c34] border-[#25D366]/40' : 'border-transparent hover:bg-white/[0.04]'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${live ? 'bg-[#25D366] animate-pulse' : 'bg-white/20'}`} />
                    <p className="text-white text-[13px] font-medium truncate flex-1">{f.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 pl-3.5 text-white/30 text-[10px]">
                    <span className={live ? 'text-[#25D366]/80' : 'text-white/40'}>{live ? 'Live' : 'Draft'}</span>
                    <span>·</span>
                    <span>{f.nodeCount ?? f.nodes?.length ?? 0} nodes</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Detail pane (middle: info + node funnel) ────────────────── */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {selected ? (
          <div className="max-w-2xl mx-auto px-6 py-6">
            <FlowCard
              key={selected._id} flow={selected} onChanged={load}
              savedMessages={savedMessages} media={media} products={products}
              tracking={tracking} trackLoading={trackLoading} trackOpen={trackOpen}
              onToggleTracking={toggleTracking} onReloadTracking={loadTracking}
            />
          </div>
        ) : !loading && (
          <div className="h-full flex flex-col items-center justify-center text-white/20">
            <Radio size={36} className="mb-3 opacity-30" />
            <p className="text-sm">Select a flow to see its details &amp; tracking</p>
          </div>
        )}
      </div>

      {/* ── People column (extreme right: per-number details) ────────── */}
      {selected && trackOpen && (
        <div className="w-80 shrink-0 border-l border-white/8">
          <ParticipantsPanel tracking={tracking} loading={trackLoading} flowName={selected.name} onRefresh={loadTracking} />
        </div>
      )}
    </div>
  );
}
