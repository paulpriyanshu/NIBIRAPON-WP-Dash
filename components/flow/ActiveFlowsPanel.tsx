'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Radio, Play, Pause, Send, Loader2, Users, CheckCircle2,
  Megaphone, AlertTriangle, RefreshCw, Layers, ChevronDown, ChevronUp, X, ShoppingBag,
} from 'lucide-react';
import {
  findRootNodes, getTemplate, flowParamSpecs, specNeedsConfig,
  type Flow as EngineFlow, type NodeParams, type TemplateParamSpec,
} from '@/lib/flow-engine';
import type { TemplateMessage, TemplateMessageConfig } from '@/lib/templates';

interface Flow extends EngineFlow {
  _id: string;
  nodeCount?: number;
  edgeCount?: number;
  updatedAt?: string;
}
interface RunStats { active: number; completed: number; stopped: number; total: number; }

const inputCls = 'w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-[#25D366]/50';

function emptyParams(s: TemplateParamSpec, saved?: NodeParams): NodeParams {
  return {
    bodyParams: Array.from({ length: s.bodyParams }, (_, i) => saved?.bodyParams?.[i] ?? ''),
    headerParam: saved?.headerParam ?? '',
    headerMediaUrl: saved?.headerMediaUrl ?? '',
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
    thumbnailProductRetailerId: cfg.thumbnailProductRetailerId ?? '',
    mpmSections: cfg.mpmSections?.length ? cfg.mpmSections : [{ title: '', productIds: '' }],
  };
}

function FlowCard({ flow, onChanged, savedMessages }: { flow: Flow; onChanged: () => void; savedMessages: TemplateMessage[] }) {
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
  useEffect(() => { if (isLive) loadStats(); }, [isLive, loadStats]);

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
      if (s.needsHeaderMedia && !v.headerMediaUrl?.trim()) missing.push(`${s.templateName} (media)`);
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
                      <input value={v.headerMediaUrl ?? ''} onChange={e => patch(s.nodeId, p => ({ ...p, headerMediaUrl: e.target.value }))}
                        placeholder={`${(s.headerFormat ?? 'media').toLowerCase()} header URL (https://…)`} className={inputCls} />
                    )}
                    {(s.isMPM || s.isCatalog) && (
                      <input value={v.thumbnailProductRetailerId ?? ''} onChange={e => patch(s.nodeId, p => ({ ...p, thumbnailProductRetailerId: e.target.value }))}
                        placeholder="Thumbnail product retailer ID" className={inputCls} />
                    )}
                    {s.isMPM && (
                      <>
                        <input value={v.mpmSections?.[0]?.productIds ?? ''} onChange={e => patch(s.nodeId, p => ({ ...p, mpmSections: [{ title: p.mpmSections?.[0]?.title ?? '', productIds: e.target.value }] }))}
                          placeholder="Product IDs (comma separated) — e.g. tissue01, tissue02" className={inputCls} />
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

export default function ActiveFlowsPanel() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedMessages, setSavedMessages] = useState<TemplateMessage[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/flows');
    if (res.ok) setFlows(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/template-messages').then(r => r.ok ? r.json() : []).then(setSavedMessages).catch(() => {});
  }, []);

  const liveCount = flows.filter(f => f.status === 'live').length;

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] px-6 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#25D366]/15 rounded-xl flex items-center justify-center">
              <Radio size={18} className="text-[#25D366]" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">Active Flows</h1>
              <p className="text-white/40 text-xs">{liveCount} live · {flows.length} total</p>
            </div>
          </div>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-white/15 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        <div className="bg-[#111b21] border border-white/8 rounded-xl px-4 py-3 flex gap-2 my-4">
          <CheckCircle2 size={13} className="text-[#25D366]/60 shrink-0 mt-0.5" />
          <p className="text-white/40 text-[11px] leading-relaxed">
            <strong className="text-white/60">Launch</strong> opens a modal to fill the parameters for every template the flow uses, then <strong className="text-white/60">Broadcast root template</strong> to the contacts you choose. Quick-reply taps drive the rest. Live-flow templates are locked from independent broadcast.
          </p>
        </div>

        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-20 bg-[#1f2c34] rounded-xl animate-pulse mb-3" />)
        ) : flows.length === 0 ? (
          <div className="text-center py-16 text-white/20">
            <Radio size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No flows yet</p>
            <p className="text-xs mt-1 text-white/15">Build one in the Builder tab first</p>
          </div>
        ) : (
          <div className="space-y-3">
            {flows.map(f => <FlowCard key={f._id} flow={f} onChanged={load} savedMessages={savedMessages} />)}
          </div>
        )}
      </div>
    </div>
  );
}
