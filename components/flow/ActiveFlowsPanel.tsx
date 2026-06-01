'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Radio, Play, Pause, Send, Loader2, Users, CheckCircle2,
  Megaphone, AlertTriangle, RefreshCw, Layers, ChevronDown, ChevronUp,
} from 'lucide-react';
import { findRootNodes, getTemplate, quickReplyButtons, type Flow as EngineFlow } from '@/lib/flow-engine';

interface Flow extends EngineFlow {
  _id: string;
  nodeCount?: number;
  edgeCount?: number;
  updatedAt?: string;
}
interface RunStats { active: number; completed: number; stopped: number; total: number; }

/** Count distinct {{n}} placeholders in a template's BODY. */
function bodyParamCount(flow: Flow, nodeId: string): number {
  const node = flow.nodes.find(n => n.id === nodeId);
  const body = getTemplate(node)?.components.find(c => c.type === 'BODY')?.text ?? '';
  const nums = new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map(m => m[1]));
  return nums.size;
}
function headerIsMedia(flow: Flow, nodeId: string): boolean {
  const node = flow.nodes.find(n => n.id === nodeId);
  const header = getTemplate(node)?.components.find(c => c.type === 'HEADER');
  return !!header?.format && header.format !== 'TEXT';
}

function FlowCard({ flow, onChanged }: { flow: Flow; onChanged: () => void }) {
  const roots = findRootNodes(flow);
  const isLive = flow.status === 'live';

  const [rootId, setRootId]     = useState<string>(flow.rootNodeId && roots.includes(flow.rootNodeId) ? flow.rootNodeId : roots[0] ?? '');
  const [toggling, setToggling] = useState(false);
  const [err, setErr]           = useState('');
  const [stats, setStats]       = useState<RunStats | null>(null);

  /* launch form */
  const [open, setOpen]         = useState(false);
  const [recipients, setRecipients] = useState('');
  const [params, setParams]     = useState<string[]>([]);
  const [mediaUrl, setMediaUrl] = useState('');
  const [launching, setLaunching] = useState(false);
  const [result, setResult]     = useState('');

  const activeRoot = flow.rootNodeId || rootId;
  const rootTemplate = getTemplate(flow.nodes.find(n => n.id === activeRoot));
  const nParams = activeRoot ? bodyParamCount(flow, activeRoot) : 0;
  const needsMedia = activeRoot ? headerIsMedia(flow, activeRoot) : false;

  const loadStats = useCallback(async () => {
    const res = await fetch(`/api/flows/${flow._id}/runs`);
    if (res.ok) setStats(await res.json());
  }, [flow._id]);

  useEffect(() => { if (isLive) loadStats(); }, [isLive, loadStats]);
  useEffect(() => { setParams(p => Array.from({ length: nParams }, (_, i) => p[i] ?? '')); }, [nParams]);

  const toggle = async () => {
    setToggling(true); setErr('');
    const next = isLive ? 'draft' : 'live';
    const res = await fetch(`/api/flows/${flow._id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next, rootNodeId: rootId || undefined }),
    });
    const d = await res.json();
    setToggling(false);
    if (!res.ok) { setErr(d.error || 'Failed'); return; }
    onChanged();
  };

  const launch = async () => {
    const list = recipients.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    if (list.length === 0) { setResult('Add at least one recipient'); return; }
    setLaunching(true); setResult('');
    const res = await fetch(`/api/flows/${flow._id}/launch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: list, bodyParams: params, headerMediaUrl: mediaUrl }),
    });
    const d = await res.json();
    setLaunching(false);
    if (!res.ok) { setResult(d.error || 'Launch failed'); return; }
    setResult(`✓ Started ${d.started}/${d.total}${d.failures?.length ? ` · ${d.failures.length} failed` : ''}`);
    setRecipients('');
    loadStats();
  };

  return (
    <div className={`bg-[#1f2c34] border rounded-xl overflow-hidden ${isLive ? 'border-[#25D366]/40' : 'border-white/10'}`}>
      {/* header */}
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
            <span>{flow.nodeCount ?? flow.nodes?.length ?? 0} nodes</span>
            <span>·</span>
            <span>{roots.length} start{roots.length !== 1 ? 's' : ''}</span>
            {isLive && stats && <><span>·</span><span className="text-[#25D366]/70">{stats.active} active</span><span>{stats.completed} done</span></>}
          </div>
        </div>

        {/* root picker (only when several possible starts and not yet live) */}
        {!isLive && roots.length > 1 && (
          <select value={rootId} onChange={e => setRootId(e.target.value)}
            className="bg-[#111b21] border border-white/10 rounded-lg px-2 py-1.5 text-white/70 text-[10px] focus:outline-none focus:border-[#25D366]/50 max-w-[140px]">
            {roots.map(r => {
              const t = getTemplate(flow.nodes.find(n => n.id === r));
              return <option key={r} value={r}>{t?.name ?? r}</option>;
            })}
          </select>
        )}

        <button onClick={toggle} disabled={toggling || roots.length === 0}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium shrink-0 transition-all disabled:opacity-40 ${
            isLive ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25' : 'bg-[#25D366] text-black hover:bg-[#22c55e]'
          }`}>
          {toggling ? <Loader2 size={12} className="animate-spin" /> : isLive ? <Pause size={12} /> : <Play size={12} />}
          {isLive ? 'Pause' : 'Launch'}
        </button>
      </div>

      {err && <p className="px-4 pb-2 text-red-400 text-[11px] flex items-center gap-1"><AlertTriangle size={11} /> {err}</p>}
      {roots.length === 0 && <p className="px-4 pb-3 text-amber-400/70 text-[10px]">No starting template — connect a template with no incoming arrow.</p>}

      {/* live: broadcast root template */}
      {isLive && (
        <div className="border-t border-white/8">
          <button onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] text-white/60 hover:bg-white/[0.03] transition-colors">
            <span className="flex items-center gap-1.5"><Megaphone size={12} className="text-[#25D366]" /> Broadcast root template{rootTemplate ? ` — ${rootTemplate.name}` : ''}</span>
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {open && (
            <div className="px-4 pb-4 space-y-2.5">
              <div className="bg-[#111b21] border border-white/8 rounded-lg px-3 py-2 text-white/35 text-[10px] flex gap-1.5">
                <Layers size={11} className="text-[#25D366]/60 shrink-0 mt-0.5" />
                Sends the root template to these contacts and starts a flow run for each. Their button taps then advance the flow automatically.
              </div>
              <div>
                <label className="text-white/40 text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1"><Users size={9} /> Recipients</label>
                <textarea value={recipients} onChange={e => setRecipients(e.target.value)} rows={2}
                  placeholder="Phone numbers, comma or newline separated — e.g. 919812345678, 919876543210"
                  className="w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-[#25D366]/50 resize-none" />
              </div>
              {params.map((v, i) => (
                <input key={i} value={v} onChange={e => setParams(p => p.map((x, idx) => idx === i ? e.target.value : x))}
                  placeholder={`Body variable {{${i + 1}}}`}
                  className="w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-[#25D366]/50" />
              ))}
              {needsMedia && (
                <input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)}
                  placeholder="Header media URL (https://…)"
                  className="w-full bg-[#111b21] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-[#25D366]/50" />
              )}
              <div className="flex items-center justify-between">
                {result && <span className={`text-[11px] ${result.startsWith('✓') ? 'text-[#25D366]' : 'text-red-400'}`}>{result}</span>}
                <button onClick={launch} disabled={launching} className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-[#25D366] text-black font-medium hover:bg-[#22c55e] disabled:opacity-40 transition-all">
                  {launching ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Broadcast &amp; start
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ActiveFlowsPanel() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/flows');
    if (res.ok) setFlows(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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
            <strong className="text-white/60">Launch</strong> a flow to make it live, then <strong className="text-white/60">Broadcast root template</strong> to the contacts you choose. Their quick-reply button taps drive the rest automatically. Templates in a live flow are locked from independent broadcast.
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
            {flows.map(f => <FlowCard key={f._id} flow={f} onChanged={load} />)}
          </div>
        )}
      </div>
    </div>
  );
}
