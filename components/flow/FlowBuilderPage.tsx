'use client';
import { useCallback, useRef, useState, useEffect, DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useViewport,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';
import { fetchTemplates } from '@/store/slices/templatesSlice';
import type { Template } from '@/types';
import TemplateNode        from './TemplateNode';
import ConditionNode       from './ConditionNode';
import BinaryDecisionNode  from './BinaryDecisionNode';
import MultiConditionNode  from './MultiConditionNode';
import DeletableEdge       from './DeletableEdge';
import {
  Search, Layers, GitBranch, Trash2, Info, GripVertical,
  Filter, Network, Save, Check, Loader2,
  ChevronLeft, ChevronRight, Clock, X, BookOpen,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

/* ── types ──────────────────────────────────────────────────────── */

interface SavedFlow {
  _id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  nodeCount: number;
  edgeCount: number;
  updatedAt: string;
}

/* ── constants ──────────────────────────────────────────────────── */

const nodeTypes = {
  templateNode:       TemplateNode,
  conditionNode:      ConditionNode,
  binaryDecisionNode: BinaryDecisionNode,
  multiConditionNode: MultiConditionNode,
};

const edgeTypes = { deletableEdge: DeletableEdge };

const DEFAULT_EDGE = {
  type:      'deletableEdge',
  animated:  true,
  style:     { stroke: '#25D366', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#25D366', width: 16, height: 16 },
};

const CATEGORY_STYLE: Record<string, { bg: string; text: string }> = {
  MARKETING:      { bg: 'bg-purple-500/20', text: 'text-purple-300' },
  UTILITY:        { bg: 'bg-blue-500/20',   text: 'text-blue-300'   },
  AUTHENTICATION: { bg: 'bg-amber-500/20',  text: 'text-amber-300'  },
};

const TOOLBAR_NODES = [
  {
    type: 'conditionNode',
    label: 'Condition',
    hint: 'Drop onto an edge to insert between nodes',
    icon: Filter,
    palette: { bg: 'bg-blue-500/10', border: 'border-blue-500/25', hover: 'hover:bg-blue-500/20 hover:border-blue-500/50', text: 'text-blue-300' },
  },
  {
    type: 'binaryDecisionNode',
    label: 'Yes / No',
    hint: 'Two-branch decision node',
    icon: GitBranch,
    palette: { bg: 'bg-amber-500/10', border: 'border-amber-500/25', hover: 'hover:bg-amber-500/20 hover:border-amber-500/50', text: 'text-amber-300' },
  },
  {
    type: 'multiConditionNode',
    label: 'Multi-Path',
    hint: 'Route to multiple paths',
    icon: Network,
    palette: { bg: 'bg-purple-500/10', border: 'border-purple-500/25', hover: 'hover:bg-purple-500/20 hover:border-purple-500/50', text: 'text-purple-300' },
  },
] as const;

const NODE_DEFAULT_DATA: Record<string, object> = {
  conditionNode:      { condition: '' },
  binaryDecisionNode: { condition: '' },
  multiConditionNode: { branches: [{ id: 'b1', label: 'Branch 1' }, { id: 'b2', label: 'Branch 2' }] },
};

/* ── adaptive grid (zoom-invariant) ─────────────────────────────── */

/**
 * Renders two grid layers whose visual density stays constant regardless of
 * the viewport zoom. gap = targetScreenPx / zoom keeps the on-screen spacing
 * fixed; size (line stroke) is divided the same way so lines never thicken.
 */
function AdaptiveGrid() {
  const { zoom } = useViewport();
  const z = zoom || 1;

  return (
    <>
      {/* Fine grid — always ~28 px on-screen between lines */}
      <Background
        id="grid-minor"
        variant={BackgroundVariant.Lines}
        gap={28 / z}
        size={0.35 / z}
        color="rgba(255,255,255,0.038)"
      />
      {/* Major grid — always ~140 px on-screen between lines */}
      <Background
        id="grid-major"
        variant={BackgroundVariant.Lines}
        gap={140 / z}
        size={0.7 / z}
        color="rgba(37,211,102,0.06)"
      />
    </>
  );
}

/* ── sub-components ─────────────────────────────────────────────── */

function ToolbarItem({ type, label, hint, icon: Icon, palette }: (typeof TOOLBAR_NODES)[number]) {
  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/node-type', type);
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <div draggable onDragStart={onDragStart} title={hint}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border cursor-grab active:cursor-grabbing active:opacity-60 active:scale-95 select-none transition-all ${palette.bg} ${palette.border} ${palette.hover}`}
    >
      <Icon size={12} className={palette.text} />
      <span className={`text-[10px] font-medium ${palette.text}`}>{label}</span>
      <GripVertical size={9} className="text-white/20" />
    </div>
  );
}

function DraggableTemplateCard({ template }: { template: Template }) {
  const body = template.components.find(c => c.type === 'BODY');
  const cat  = CATEGORY_STYLE[template.category] ?? { bg: 'bg-gray-500/20', text: 'text-gray-300' };

  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/template', JSON.stringify(template));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div draggable onDragStart={onDragStart}
      className="group bg-[#1f2c34] border border-white/10 rounded-xl p-3 cursor-grab active:cursor-grabbing active:scale-[0.98] active:opacity-70 hover:border-[#25D366]/40 hover:bg-[#1d2e27] transition-all duration-150 select-none"
    >
      <div className="flex items-start gap-2">
        <GripVertical size={12} className="text-white/20 mt-0.5 shrink-0" />
        <div className="w-6 h-6 bg-[#25D366]/15 rounded-md flex items-center justify-center shrink-0 mt-0.5">
          <Layers size={11} className="text-[#25D366]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[11px] font-medium truncate leading-snug">{template.name}</p>
          {body?.text && (
            <p className="text-white/35 text-[9px] mt-0.5 line-clamp-2 leading-relaxed">{body.text}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${cat.bg} ${cat.text}`}>{template.category}</span>
            <span className="text-[9px] text-white/20 uppercase tracking-wide">{template.language}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── main ───────────────────────────────────────────────────────── */

export default function FlowBuilderPage() {
  const dispatch = useAppDispatch();
  const { templates, loading: tmplLoading } = useAppSelector(s => s.templates);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rfInstance, setRfInstance]      = useState<ReactFlowInstance | null>(null);
  const [search, setSearch]              = useState('');
  const [activeCat, setActiveCat]        = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* save state */
  const [flowId,   setFlowId]   = useState<string | null>(null);
  const [flowName, setFlowName] = useState('My Flow');
  const [saveMode, setSaveMode] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');

  /* right sidebar */
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [savedFlows,   setSavedFlows]   = useState<SavedFlow[]>([]);
  const [flowsLoading, setFlowsLoading] = useState(false);

  /* ── auto-save refs ─────────────────────────────────────────── */
  const mountedRef          = useRef(false);
  const suppressAutoSaveRef = useRef(false);
  const autoSaveTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFlowId        = useRef<string | null>(null);
  const latestFlowName      = useRef('My Flow');
  const latestNodes         = useRef<Node[]>([]);
  const latestEdges         = useRef<Edge[]>([]);

  useEffect(() => { latestFlowId.current   = flowId;   }, [flowId]);
  useEffect(() => { latestFlowName.current = flowName; }, [flowName]);
  useEffect(() => { latestNodes.current    = nodes;    }, [nodes]);
  useEffect(() => { latestEdges.current    = edges;    }, [edges]);

  useEffect(() => { dispatch(fetchTemplates()); }, [dispatch]);

  /* fetch saved flows */
  const loadSavedFlows = useCallback(async () => {
    setFlowsLoading(true);
    try {
      const res = await fetch('/api/flows');
      if (res.ok) setSavedFlows(await res.json());
    } finally {
      setFlowsLoading(false);
    }
  }, []);

  useEffect(() => { if (sidebarOpen) loadSavedFlows(); }, [sidebarOpen, loadSavedFlows]);

  /* ── performAutoSave — stable ref to save data avoids stale closures ── */
  const performAutoSave = useCallback(async () => {
    const currentNodes = latestNodes.current;
    const currentEdges = latestEdges.current;
    if (currentNodes.length === 0 && currentEdges.length === 0) { setSaveMode('idle'); return; }
    const name    = latestFlowName.current?.trim() || `Flow ${new Date().toLocaleString()}`;
    const payload = { name, nodes: currentNodes, edges: currentEdges };
    setSaveMode('saving');
    try {
      if (latestFlowId.current) {
        const res = await fetch(`/api/flows/${latestFlowId.current}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Save failed');
      } else {
        const res = await fetch('/api/flows', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Save failed');
        setFlowId(data.id);
        latestFlowId.current = data.id;
      }
      setSaveMode('saved');
      if (sidebarOpen) loadSavedFlows();
      setTimeout(() => setSaveMode('idle'), 1500);
    } catch {
      setSaveMode('idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally stable — reads only from refs

  /* ── auto-save: debounce 1.5 s after any canvas change ─────── */
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (suppressAutoSaveRef.current) return;
    setSaveMode('pending');
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => performAutoSave(), 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]); // performAutoSave is stable

  /* ── auto-load: restore most-recently saved flow on page open ─ */
  useEffect(() => {
    const autoLoad = async () => {
      try {
        const res = await fetch('/api/flows');
        if (!res.ok) return;
        const flows: SavedFlow[] = await res.json();
        if (flows.length === 0) return;
        const latest = flows[0]; // sorted by updatedAt desc
        suppressAutoSaveRef.current = true;
        setNodes(latest.nodes ?? []);
        setEdges((latest.edges ?? []).map(e => ({ ...DEFAULT_EDGE, ...e, type: 'deletableEdge', id: e.id })));
        setFlowId(latest._id);
        setFlowName(latest.name);
        setSavedFlows(flows);
        setTimeout(() => { suppressAutoSaveRef.current = false; }, 300);
      } catch { /* start with empty canvas */ }
    };
    autoLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  /* templates */
  const approved = templates.filter(t => t.status === 'APPROVED');
  const cats     = [...new Set(approved.map(t => t.category))];
  const filtered = approved.filter(t =>
    (!search    || t.name.toLowerCase().includes(search.toLowerCase())) &&
    (!activeCat || t.category === activeCat),
  );

  /* connect */
  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge({ ...params, ...DEFAULT_EDGE }, eds)),
    [setEdges],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  /* edge-insert for condition nodes */
  const tryInsertConditionOnEdge = useCallback((nodeId: string, pos: { x: number; y: number }): boolean => {
    if (!rfInstance) return false;
    const THRESHOLD = 65;
    for (const edge of rfInstance.getEdges()) {
      const src = rfInstance.getNode(edge.source);
      const tgt = rfInstance.getNode(edge.target);
      if (!src || !tgt) continue;
      const sw = (src as any).measured?.width  ?? 240;
      const sh = (src as any).measured?.height ?? 160;
      const tw = (tgt as any).measured?.width  ?? 240;
      const midX = (src.position.x + sw / 2 + tgt.position.x + tw / 2) / 2;
      const midY = (src.position.y + sh     + tgt.position.y)           / 2;
      if (Math.hypot(pos.x - midX, pos.y - midY) < THRESHOLD) {
        const { id: eid, source, target, sourceHandle, targetHandle } = edge;
        setEdges(eds => [
          ...eds.filter(e => e.id !== eid),
          { ...DEFAULT_EDGE, id: `e-${source}-${nodeId}`, source, target: nodeId, sourceHandle: sourceHandle ?? undefined },
          { ...DEFAULT_EDGE, id: `e-${nodeId}-${target}`, source: nodeId, target, targetHandle: targetHandle ?? undefined },
        ]);
        return true;
      }
    }
    return false;
  }, [rfInstance, setEdges]);

  /* drop */
  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!rfInstance) return;
    const rawTemplate = e.dataTransfer.getData('application/template');
    const nodeType    = e.dataTransfer.getData('application/node-type');
    const position    = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const centred     = { x: position.x - 130, y: position.y - 70 };

    if (rawTemplate) {
      setNodes(nds => nds.concat({
        id: `tmpl-${Date.now()}`, type: 'templateNode',
        position: centred, data: { template: JSON.parse(rawTemplate) },
      }));
    } else if (nodeType && nodeType in NODE_DEFAULT_DATA) {
      const nodeId = `${nodeType}-${Date.now()}`;
      setNodes(nds => nds.concat({ id: nodeId, type: nodeType, position: centred, data: { ...NODE_DEFAULT_DATA[nodeType] } }));
      if (nodeType === 'conditionNode') tryInsertConditionOnEdge(nodeId, position);
    }
  }, [rfInstance, setNodes, tryInsertConditionOnEdge]);

  /* save / update */
  const doSave = useCallback(async (asNew = false) => {
    if (!flowName.trim()) return;
    setSaveMode('saving');
    setSaveError('');
    try {
      const payload = { name: flowName, nodes, edges };

      if (flowId && !asNew) {
        await fetch(`/api/flows/${flowId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const res = await fetch('/api/flows', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setFlowId(data.id);
      }

      setSaveMode('saved');
      if (sidebarOpen) loadSavedFlows();
      setTimeout(() => setSaveMode('idle'), 2000);
    } catch (err: any) {
      setSaveError(err.message ?? 'Save failed');
      setSaveMode('error');
      setTimeout(() => setSaveMode('idle'), 3000);
    }
  }, [flowId, flowName, nodes, edges, sidebarOpen, loadSavedFlows]);

  /* load flow */
  const loadFlow = (flow: SavedFlow) => {
    suppressAutoSaveRef.current = true;
    setNodes(flow.nodes ?? []);
    setEdges((flow.edges ?? []).map(e => ({ ...DEFAULT_EDGE, ...e, type: 'deletableEdge', id: e.id })));
    setFlowId(flow._id);
    setFlowName(flow.name);
    setSidebarOpen(false);
    setTimeout(() => {
      suppressAutoSaveRef.current = false;
      rfInstance?.fitView({ padding: 0.15 });
    }, 300);
  };

  /* delete saved flow */
  const deleteSavedFlow = async (id: string) => {
    await fetch(`/api/flows/${id}`, { method: 'DELETE' });
    setSavedFlows(fs => fs.filter(f => f._id !== id));
    if (flowId === id) { setFlowId(null); }
  };

  const clearCanvas = () => {
    suppressAutoSaveRef.current = true;
    setNodes([]); setEdges([]); setFlowId(null); setFlowName('My Flow');
    setTimeout(() => { suppressAutoSaveRef.current = false; }, 300);
  };

  /* ── render ─────────────────────────────────────────────────── */
  return (
    <div className="flex h-full bg-[#0b141a] overflow-hidden">

      {/* ── Left panel ────────────────────────────────────────── */}
      <aside className="w-[268px] shrink-0 border-r border-white/8 flex flex-col bg-[#111b21] overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-[#25D366]/15 rounded-md flex items-center justify-center">
              <GitBranch size={13} className="text-[#25D366]" />
            </div>
            <h2 className="text-white font-semibold text-sm">Flow Builder</h2>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
              className="w-full bg-[#1f2c34] border border-white/10 rounded-lg pl-8 pr-3 py-2 text-white text-[11px] placeholder:text-white/25 focus:outline-none focus:border-[#25D366]/50 transition-colors"
            />
          </div>
        </div>

        {cats.length > 1 && (
          <div className="px-4 py-2 border-b border-white/8 flex gap-1 flex-wrap shrink-0">
            <button onClick={() => setActiveCat(null)}
              className={`text-[10px] px-2 py-1 rounded-full font-medium transition-colors ${!activeCat ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-white/5 text-white/40 hover:text-white/70'}`}>
              All
            </button>
            {cats.map(cat => (
              <button key={cat} onClick={() => setActiveCat(c => c === cat ? null : cat)}
                className={`text-[10px] px-2 py-1 rounded-full font-medium transition-colors ${activeCat === cat ? 'bg-[#25D366]/20 text-[#25D366]' : 'bg-white/5 text-white/40 hover:text-white/70'}`}>
                {cat}
              </button>
            ))}
          </div>
        )}

        <div className="mx-4 my-2.5 bg-[#25D366]/5 border border-[#25D366]/10 rounded-lg px-3 py-2 flex gap-2 items-start shrink-0">
          <Info size={11} className="text-[#25D366]/50 shrink-0 mt-0.5" />
          <p className="text-[#25D366]/60 text-[9px] leading-relaxed">
            Drag templates → canvas. Use toolbar nodes for conditions &amp; branching. Click edge then press Delete to remove it.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 min-h-0">
          {tmplLoading ? (
            [...Array(5)].map((_, i) => <div key={i} className="h-[72px] bg-[#1f2c34] rounded-xl animate-pulse" />)
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-white/20 text-xs">
              {search ? 'No templates match your search' : 'No approved templates'}
            </div>
          ) : (
            filtered.map(t => <DraggableTemplateCard key={t.id} template={t} />)
          )}
        </div>

        <div className="px-4 py-3 border-t border-white/8 flex items-center justify-between shrink-0">
          <span className="text-white/25 text-[10px]">
            {nodes.length} node{nodes.length !== 1 ? 's' : ''} · {edges.length} edge{edges.length !== 1 ? 's' : ''}
          </span>
          {(nodes.length > 0 || edges.length > 0) && (
            <button onClick={clearCanvas} className="flex items-center gap-1 text-[10px] text-red-400/50 hover:text-red-400 transition-colors">
              <Trash2 size={10} />
              Clear all
            </button>
          )}
        </div>
      </aside>

      {/* ── Canvas area ───────────────────────────────────────── */}
      <div ref={wrapperRef} className="flex-1 relative min-w-0">

        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={inst => setRfInstance(inst as unknown as ReactFlowInstance)}
          onDrop={onDrop} onDragOver={onDragOver}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          defaultEdgeOptions={DEFAULT_EDGE}
          deleteKeyCode="Delete"
          minZoom={0.02}
          maxZoom={50}
          fitView
          style={{ background: '#0b141a' }}
        >
          <AdaptiveGrid />

          <Controls />
          <MiniMap nodeColor={() => '#25D366'} maskColor="rgba(0,0,0,0.5)"
            style={{ background: '#1f2c34', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
          />
        </ReactFlow>

        {/* ── Floating top toolbar ───────────────────────────── */}
        <div className="absolute top-0 inset-x-0 pointer-events-none z-10">
          <div className="flex items-center justify-between px-4 pt-4 gap-3">

            {/* Node type palette — center */}
            <div className="flex-1 flex justify-center">
              <div className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 bg-[#1f2c34]/90 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl">
                <span className="text-white/25 text-[9px] uppercase tracking-widest mr-1 select-none">Add Node</span>
                <div className="w-px h-4 bg-white/8 mr-1" />
                {TOOLBAR_NODES.map(item => <ToolbarItem key={item.type} {...item} />)}
              </div>
            </div>

            {/* Save controls — right */}
            <div className="pointer-events-auto flex items-center gap-2">
              {/* Flow name + save */}
              <div className="flex items-center gap-1 bg-[#1f2c34]/90 backdrop-blur-md border border-white/10 rounded-xl px-2 py-1.5 shadow-xl">
                <input
                  value={flowName}
                  onChange={e => setFlowName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSave()}
                  placeholder="Flow name…"
                  className="bg-transparent text-white text-[11px] w-32 placeholder:text-white/25 focus:outline-none"
                />
                <div className="w-px h-4 bg-white/10 mx-1" />
                <button
                  onClick={() => doSave()}
                  disabled={saveMode === 'saving'}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                    saveMode === 'saved'   ? 'bg-[#25D366]/20 text-[#25D366]'           :
                    saveMode === 'error'   ? 'bg-red-500/20 text-red-400'               :
                    saveMode === 'saving'  ? 'bg-white/5 text-white/30'                  :
                    saveMode === 'pending' ? 'bg-amber-500/15 text-amber-300 animate-pulse' :
                    'bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25'
                  }`}
                >
                  {saveMode === 'saving'  ? <Loader2 size={11} className="animate-spin" /> :
                   saveMode === 'saved'   ? <Check size={11} />  :
                   saveMode === 'pending' ? <Save  size={11} className="animate-pulse" /> :
                                            <Save  size={11} />}
                  {saveMode === 'saved'   ? 'Saved!'    :
                   saveMode === 'error'   ? 'Error'     :
                   saveMode === 'pending' ? 'Unsaved…'  :
                   saveMode === 'saving'  ? 'Saving…'   :
                   flowId ? 'Update' : 'Save'}
                </button>
                {flowId && (
                  <button onClick={() => doSave(true)} title="Save as new flow"
                    className="px-2 py-1 rounded-lg text-[10px] text-white/30 hover:text-white/60 hover:bg-white/5 transition-all">
                    + New
                  </button>
                )}
              </div>

              {/* Saved flows toggle */}
              <button
                onClick={() => setSidebarOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-medium shadow-xl transition-all backdrop-blur-md ${
                  sidebarOpen
                    ? 'bg-[#25D366]/20 border-[#25D366]/40 text-[#25D366]'
                    : 'bg-[#1f2c34]/90 border-white/10 text-white/60 hover:text-white hover:border-white/25'
                }`}
              >
                <BookOpen size={12} />
                Saved Flows
                {savedFlows.length > 0 && (
                  <span className="bg-[#25D366]/20 text-[#25D366] text-[8px] px-1.5 py-0.5 rounded-full font-bold">
                    {savedFlows.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Save error banner */}
          {saveMode === 'error' && saveError && (
            <div className="flex justify-center mt-2">
              <div className="pointer-events-auto flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 text-red-400 text-[11px]">
                {saveError}
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar: Saved flows ─────────────────────── */}
        <div className={`absolute top-0 right-0 h-full z-20 transition-all duration-300 ease-in-out ${sidebarOpen ? 'w-[280px]' : 'w-0'} overflow-hidden`}>
          <div className="w-[280px] h-full bg-[#111b21] border-l border-white/10 flex flex-col shadow-2xl">

            {/* Sidebar header */}
            <div className="px-4 pt-4 pb-3 border-b border-white/8 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-[#25D366]" />
                <h3 className="text-white font-semibold text-sm">Saved Flows</h3>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Flow list */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
              {flowsLoading ? (
                [...Array(3)].map((_, i) => <div key={i} className="h-20 bg-[#1f2c34] rounded-xl animate-pulse" />)
              ) : savedFlows.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <BookOpen size={18} className="text-white/20" />
                  </div>
                  <p className="text-white/20 text-xs">No saved flows yet</p>
                  <p className="text-white/10 text-[10px] mt-1">Build a flow and click Save</p>
                </div>
              ) : (
                savedFlows.map(flow => (
                  <div key={flow._id}
                    className={`bg-[#1f2c34] border rounded-xl p-3 transition-all group ${
                      flowId === flow._id ? 'border-[#25D366]/40 bg-[#1d2e27]' : 'border-white/8 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          {flowId === flow._id && (
                            <span className="text-[8px] bg-[#25D366]/20 text-[#25D366] px-1.5 py-0.5 rounded-full font-medium">Active</span>
                          )}
                          <p className="text-white text-[11px] font-medium truncate">{flow.name}</p>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-white/30">
                          <span>{flow.nodeCount ?? 0} nodes</span>
                          <span>·</span>
                          <span>{flow.edgeCount ?? 0} edges</span>
                        </div>
                        {flow.updatedAt && (
                          <div className="flex items-center gap-1 text-[9px] text-white/20 mt-0.5">
                            <Clock size={8} />
                            {formatDistanceToNow(new Date(flow.updatedAt), { addSuffix: true })}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 shrink-0">
                        <button onClick={() => loadFlow(flow)}
                          className="text-[9px] px-2 py-1 rounded-lg bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25 transition-colors font-medium">
                          Load
                        </button>
                        <button onClick={() => deleteSavedFlow(flow._id)}
                          className="text-[9px] px-2 py-1 rounded-lg bg-red-500/10 text-red-400/60 hover:bg-red-500/20 hover:text-red-400 transition-colors">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Sidebar footer */}
            <div className="px-4 py-3 border-t border-white/8 shrink-0">
              <button onClick={loadSavedFlows}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 text-white/40 hover:text-white/70 text-[10px] transition-colors">
                {flowsLoading ? <Loader2 size={11} className="animate-spin" /> : <ChevronLeft size={11} />}
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* ── Sidebar toggle tab (when closed) ──────────────── */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-1/2 right-0 -translate-y-1/2 z-20 flex flex-col items-center gap-3 py-6 px-3 bg-[#25D366]/15 hover:bg-[#25D366]/25 border-l-2 border-t border-b border-[#25D366]/40 hover:border-[#25D366]/70 rounded-l-2xl text-[#25D366] transition-all shadow-2xl group"
          >
            {/* count badge */}
            {savedFlows.length > 0 && (
              <span className="absolute -top-2.5 -left-3 w-6 h-6 bg-[#25D366] rounded-full flex items-center justify-center text-[10px] font-bold text-black shadow-lg ring-2 ring-[#0b141a]">
                {savedFlows.length}
              </span>
            )}
            <BookOpen size={18} className="shrink-0" />
            <span
              className="text-[10px] font-semibold tracking-widest select-none"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              Saved Flows
            </span>
            <ChevronLeft size={14} className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
          </button>
        )}

        {/* ── Empty-state ────────────────────────────────────── */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-16">
            <div className="w-16 h-16 bg-[#25D366]/8 rounded-2xl flex items-center justify-center mb-4">
              <GitBranch size={28} className="text-[#25D366]/30" />
            </div>
            <p className="text-white/20 text-sm font-medium">Drop templates here to start</p>
            <p className="text-white/10 text-xs mt-1">Use the toolbar above to add conditions and branching</p>
          </div>
        )}
      </div>
    </div>
  );
}
