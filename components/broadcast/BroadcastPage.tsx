'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';
import { fetchTemplates } from '@/store/slices/templatesSlice';
import { Template } from '@/types';
import {
  Send, ChevronRight, ChevronLeft, CheckCircle2, Clock, XCircle,
  Users, Layers, Sliders, Eye, History, Plus, Upload,
  Megaphone, Trash2, RefreshCw, X, AlertCircle, Edit2, Bookmark, BookmarkCheck,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { BroadcastHistorySkeleton, TemplateGridSkeleton } from '@/components/ui/Skeletons';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveProgress {
  campaignId: string;
  total: number;
  sentCount: number;
  failedCount: number;
  log: { phone: string; status: 'sent' | 'failed'; error?: string }[];
  done: boolean;
  deliveredCount: number;
  readCount: number;
}

interface Campaign {
  id: string;
  name: string;
  templateName: string;
  language: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  undeliveredCount: number;
  bodyParams: string[];
  headerParams: string[];
  headerMediaUrl: string | null;
  createdAt: string;
  recipients: { phone: string; status: string }[];
}

// ─── Helper: extract {{n}} placeholders ───────────────────────────────────────
function extractPlaceholders(text: string): string[] {
  return [...new Set((text.match(/\{\{\d+\}\}/g) || []))].sort();
}

function fillTemplate(text: string, params: Record<string, string>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => params[`{{${n}}}`] || `{{${n}}}`);
}

function checkIsMPM(template: Template): boolean {
  return template.components.some(
    (c) => c.type === 'BUTTONS' && c.buttons?.some((b: any) => b.type?.toUpperCase() === 'MPM')
  );
}

interface MPMSectionDraft {
  title: string;
  productIds: string;
}

const STEPS = ['Select Template', 'Fill Parameters', 'Add Recipients', 'Preview & Send'];

// ─── Live Progress Screen ─────────────────────────────────────────────────────
function LiveProgressScreen({
  progress,
  onNewCampaign,
  onViewHistory,
}: {
  progress: LiveProgress;
  onNewCampaign: () => void;
  onViewHistory: () => void;
}) {
  const processed   = progress.sentCount + progress.failedCount;
  const pct         = progress.total > 0 ? Math.round((processed / progress.total) * 100) : 0;
  const deliverPct  = progress.sentCount > 0 ? Math.round((progress.deliveredCount / progress.sentCount) * 100) : 0;
  const readPct     = progress.sentCount > 0 ? Math.round((progress.readCount / progress.sentCount) * 100) : 0;
  const pending     = progress.total - processed;

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#0b141a] p-8">
      <div className="bg-white dark:bg-[#111b21] rounded-3xl shadow-xl p-8 max-w-lg w-full">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
            progress.done ? 'bg-[#e8f5e9] dark:bg-[#1a3a2a]' : 'bg-blue-50 dark:bg-blue-900/20'
          }`}>
            {progress.done
              ? <CheckCircle2 size={26} className="text-wp-green" />
              : <RefreshCw size={22} className="text-blue-500 animate-spin" />
            }
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#111b21] dark:text-[#e9edef]">
              {progress.done ? 'Broadcast Complete' : 'Broadcasting…'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-[#8696a0]">
              {processed} of {progress.total} recipients processed
            </p>
          </div>
        </div>

        {/* Progress bar (while sending) */}
        {!progress.done && (
          <div className="mb-5">
            <div className="flex justify-between text-xs text-gray-400 dark:text-[#667781] mb-1.5">
              <span>{processed} sent so far</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 dark:bg-[#2a3942] rounded-full overflow-hidden">
              <div
                className="h-full bg-wp-green rounded-full transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Count grid */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Sent',    val: progress.sentCount,   color: 'text-wp-green',  bg: 'bg-[#e8f5e9] dark:bg-[#1a3a2a]' },
            { label: 'Failed',  val: progress.failedCount, color: 'text-red-500',   bg: 'bg-red-50 dark:bg-red-900/20' },
            { label: 'Pending', val: Math.max(0, pending), color: 'text-gray-400 dark:text-[#667781]', bg: 'bg-gray-50 dark:bg-[#1f2c34]' },
          ].map(({ label, val, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
              <p className={`text-2xl font-bold ${color}`}>{val}</p>
              <p className="text-xs text-gray-400 dark:text-[#667781] font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Delivery tracking — shown after done */}
        {progress.done && progress.sentCount > 0 && (
          <div className="mb-5 bg-[#f0f2f5] dark:bg-[#0b141a] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-500 dark:text-[#667781] uppercase tracking-wide">
                Live Delivery Tracking
              </p>
              <span className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-[#667781]">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                auto-refreshing every 5s
              </span>
            </div>

            {[
              { label: 'Delivered', val: progress.deliveredCount, pct: deliverPct, bar: 'bg-[#34B7F1]', text: 'text-[#34B7F1]' },
              { label: 'Seen',      val: progress.readCount,      pct: readPct,    bar: 'bg-purple-400', text: 'text-purple-500' },
            ].map(({ label, val, pct: p, bar, text }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600 dark:text-[#8696a0]">{label}</span>
                  <span className={`font-semibold ${text}`}>
                    {val}
                    <span className="text-gray-400 dark:text-[#667781] font-normal"> / {progress.sentCount} ({p}%)</span>
                  </span>
                </div>
                <div className="h-2 bg-white dark:bg-[#1f2c34] rounded-full overflow-hidden">
                  <div className={`h-full ${bar} rounded-full transition-all duration-700`} style={{ width: `${p}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Live send log */}
        {progress.log.length > 0 && (
          <div className="mb-5 border border-gray-100 dark:border-[#2a3942] rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 dark:bg-[#1f2c34] border-b border-gray-100 dark:border-[#2a3942]">
              <p className="text-[10px] font-semibold text-gray-400 dark:text-[#667781] uppercase tracking-wide">
                Send Log — {progress.log.length} entr{progress.log.length === 1 ? 'y' : 'ies'}
              </p>
            </div>
            <div className="max-h-44 overflow-y-auto divide-y divide-gray-50 dark:divide-[#2a3942]">
              {progress.log.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  {entry.status === 'sent'
                    ? <CheckCircle2 size={12} className="text-wp-green shrink-0" />
                    : <XCircle size={12} className="text-red-400 shrink-0" />
                  }
                  <span className="text-xs font-mono text-[#111b21] dark:text-[#e9edef] flex-1">+{entry.phone}</span>
                  {entry.error && (
                    <span className="text-[10px] text-red-400 truncate max-w-35">{entry.error}</span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    entry.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions (after done) */}
        {progress.done && (
          <div className="flex gap-2">
            <button
              onClick={onViewHistory}
              className="flex-1 py-2.5 border border-gray-200 dark:border-[#2a3942] text-gray-600 dark:text-[#8696a0] rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-[#1f2c34] transition-colors"
            >
              View History
            </button>
            <button
              onClick={onNewCampaign}
              className="flex-1 py-2.5 bg-wp-green text-white rounded-xl text-sm font-semibold hover:bg-[#22c55e] transition-colors"
            >
              New Campaign
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 1: Template Selector ────────────────────────────────────────────────
function StepTemplate({
  templates,
  loading,
  selected,
  onSelect,
}: {
  templates: Template[];
  loading: boolean;
  selected: Template | null;
  onSelect: (t: Template) => void;
}) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('ALL');
  const cats = ['ALL', 'MARKETING', 'UTILITY', 'AUTHENTICATION'];
  const catColors: Record<string, string> = {
    MARKETING: 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400',
    UTILITY: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
    AUTHENTICATION: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400',
  };

  const filtered = templates.filter((t) => {
    const matchS = t.name.toLowerCase().includes(search.toLowerCase());
    const matchC = cat === 'ALL' || t.category === cat;
    return matchS && matchC && t.status === 'APPROVED';
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 dark:border-[#2a3942] space-y-3">
        <div className="flex items-center bg-gray-50 dark:bg-[#1f2c34] rounded-xl border border-gray-200 dark:border-[#2a3942] px-3 gap-2">
          <Layers size={14} className="text-gray-400 dark:text-[#667781]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search approved templates..."
            className="flex-1 py-2.5 text-sm bg-transparent outline-none text-gray-700 dark:text-[#e9edef] placeholder-gray-400 dark:placeholder-[#667781]"
          />
        </div>
        <div className="flex gap-1.5">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${
                cat === c ? 'bg-wp-dark text-white' : 'bg-gray-100 dark:bg-[#2a3942] text-gray-600 dark:text-[#8696a0] hover:bg-gray-200 dark:hover:bg-[#3b4a54]'
              }`}
            >
              {c === 'ALL' ? 'All' : c.charAt(0) + c.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-[#2a3942]">
        {loading && templates.length === 0 && (
          <div className="p-4"><TemplateGridSkeleton count={4} /></div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 dark:text-[#667781]">
            <Layers size={32} className="mb-2 opacity-30" />
            <p className="text-sm">No approved templates found</p>
          </div>
        )}
        {filtered.map((t) => {
          const body = t.components.find((c) => c.type === 'BODY')?.text || '';
          const isSelected = selected?.id === t.id;
          return (
            <div
              key={t.id}
              onClick={() => onSelect(t)}
              className={`flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1f2c34] transition-colors ${
                isSelected ? 'bg-[#e8f5e9] dark:bg-[#1a3a2a] border-l-2 border-wp-green' : ''
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isSelected ? 'bg-wp-green' : 'bg-gray-100 dark:bg-[#2a3942]'
              }`}>
                <Layers size={16} className={isSelected ? 'text-white' : 'text-gray-500 dark:text-[#8696a0]'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm text-[#111b21] dark:text-[#e9edef]">{t.name.replace(/_/g, ' ')}</span>
                  {isSelected && <CheckCircle2 size={14} className="text-wp-green" />}
                </div>
                <p className="text-xs text-gray-500 dark:text-[#8696a0] line-clamp-2">{body}</p>
                <div className="flex gap-1.5 mt-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${catColors[t.category] || 'bg-gray-100 dark:bg-[#2a3942] text-gray-600 dark:text-[#8696a0]'}`}>
                    {t.category.toLowerCase()}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-[#667781]">{t.language.toUpperCase()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2: Fill Parameters ──────────────────────────────────────────────────
function StepParams({
  template,
  params,
  onParams,
  headerMediaUrl,
  onHeaderMedia,
  thumbnailProductId,
  onThumbnailProductId,
  mpmSections,
  onMpmSections,
}: {
  template: Template;
  params: Record<string, string>;
  onParams: (p: Record<string, string>) => void;
  headerMediaUrl: string;
  onHeaderMedia: (url: string) => void;
  thumbnailProductId: string;
  onThumbnailProductId: (id: string) => void;
  mpmSections: MPMSectionDraft[];
  onMpmSections: (s: MPMSectionDraft[]) => void;
}) {
  const isMPM = checkIsMPM(template);
  const header = template.components.find((c) => c.type === 'HEADER');
  const body = template.components.find((c) => c.type === 'BODY');
  const footer = template.components.find((c) => c.type === 'FOOTER');
  const buttons = template.components.find((c) => c.type === 'BUTTONS');

  const headerPlaceholders = header?.text ? extractPlaceholders(header.text) : [];
  const bodyPlaceholders = body?.text ? extractPlaceholders(body.text) : [];
  const allPlaceholders = [...new Set([...headerPlaceholders, ...bodyPlaceholders])];
  const isMediaHeader = header && header.format !== 'TEXT' && header.format !== undefined;

  const addSection = () => onMpmSections([...mpmSections, { title: '', productIds: '' }]);
  const removeSection = (i: number) => onMpmSections(mpmSections.filter((_, idx) => idx !== i));
  const updateSection = (i: number, patch: Partial<MPMSectionDraft>) => {
    const next = [...mpmSections];
    next[i] = { ...next[i], ...patch };
    onMpmSections(next);
  };

  return (
    <div className="flex gap-5 h-full overflow-y-auto p-1">
      {/* Inputs */}
      <div className="flex-1 space-y-4">
        {isMediaHeader && !isMPM && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/40 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-2">
              📎 {header?.format} Header — Enter media URL
            </p>
            <input
              type="url"
              value={headerMediaUrl}
              onChange={(e) => onHeaderMedia(e.target.value)}
              placeholder="https://example.com/banner.jpg"
              className="w-full border border-blue-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
        )}

        {allPlaceholders.length === 0 && !isMediaHeader && !isMPM && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/40 rounded-xl p-4 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-500" />
            <p className="text-sm text-green-700 dark:text-green-400">This template has no parameters — ready to send!</p>
          </div>
        )}

        {allPlaceholders.map((ph) => {
          const isHeader = headerPlaceholders.includes(ph);
          return (
            <div key={ph}>
              <label className="block text-xs font-semibold text-gray-600 dark:text-[#8696a0] mb-1.5">
                {isHeader ? '📌 Header — ' : '📝 Body — '}Variable {ph}
              </label>
              <input
                type="text"
                value={params[ph] || ''}
                onChange={(e) => onParams({ ...params, [ph]: e.target.value })}
                placeholder={`Enter value for ${ph}`}
                className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors"
              />
            </div>
          );
        })}

        {isMPM && (
          <div className="space-y-4">
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700/40 rounded-xl p-3 flex items-start gap-2">
              <span className="text-purple-600 dark:text-purple-400 text-sm">🛍️</span>
              <p className="text-xs text-purple-700 dark:text-purple-400 font-medium">
                Multi-Product Message — fill in your catalog sections and product IDs below.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-[#8696a0] mb-1.5">
                🖼️ Thumbnail Product Retailer ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={thumbnailProductId}
                onChange={(e) => onThumbnailProductId(e.target.value)}
                placeholder="e.g. SKU-001"
                className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors font-mono"
              />
              <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-1">
                The product shown in the message preview thumbnail
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-600 dark:text-[#8696a0]">
                  📦 Product Sections <span className="text-red-400">*</span>
                </label>
                <button
                  onClick={addSection}
                  disabled={mpmSections.length >= 10}
                  className="flex items-center gap-1 text-xs text-wp-dark dark:text-wp-green border border-wp-dark/30 dark:border-wp-green/30 rounded-lg px-2.5 py-1 hover:bg-wp-dark/5 dark:hover:bg-wp-green/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={11} /> Add Section
                </button>
              </div>
              <div className="space-y-3">
                {mpmSections.map((sec, i) => (
                  <div key={i} className="border border-gray-200 dark:border-[#2a3942] rounded-xl p-3 space-y-2 bg-white dark:bg-[#111b21]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 dark:text-[#8696a0]">Section {i + 1}</span>
                      {mpmSections.length > 1 && (
                        <button
                          onClick={() => removeSection(i)}
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <input
                      value={sec.title}
                      onChange={(e) => updateSection(i, { title: e.target.value })}
                      placeholder='Section title — e.g. "New Arrivals"'
                      className="w-full border border-gray-100 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-wp-green transition-colors"
                    />
                    <div>
                      <textarea
                        value={sec.productIds}
                        onChange={(e) => updateSection(i, { productIds: e.target.value })}
                        placeholder={'Product IDs, comma-separated:\nSKU-001, SKU-002, SKU-003'}
                        rows={2}
                        className="w-full border border-gray-100 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-wp-green transition-colors resize-none font-mono"
                      />
                      <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-0.5">
                        {sec.productIds ? sec.productIds.split(',').filter((s) => s.trim()).length : 0} product(s) · max 30 total across all sections
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live preview */}
      <div className="w-52 shrink-0">
        <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] mb-2 uppercase tracking-wide">Live Preview</p>
        <div className="bg-[#e8f5e9] dark:bg-[#0d2a1a] rounded-2xl p-3">
          <div className="bg-white dark:bg-[#1f2c34] rounded-xl shadow-sm p-3">
            {isMediaHeader && headerMediaUrl && (
              <div className="h-20 bg-gray-100 dark:bg-[#2a3942] rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                <img src={headerMediaUrl} alt="header" className="w-full h-full object-cover rounded-lg" onError={(e) => (e.currentTarget.style.display = 'none')} />
              </div>
            )}
            {!isMediaHeader && header?.text && (
              <p className="text-xs font-bold text-[#111b21] dark:text-[#e9edef] mb-1">{fillTemplate(header.text, params)}</p>
            )}
            {body?.text && (
              <p className="text-[11px] text-[#111b21] dark:text-[#e9edef] leading-relaxed">{fillTemplate(body.text, params)}</p>
            )}
            {footer?.text && (
              <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-1.5 border-t border-gray-100 dark:border-[#2a3942] pt-1.5">{footer.text}</p>
            )}
          </div>
          {isMPM ? (
            <div className="mt-1.5 space-y-1">
              <div className="bg-white dark:bg-[#1f2c34] rounded-lg py-1.5 text-center text-[11px] text-[#00a5f4] font-medium shadow-sm flex items-center justify-center gap-1">
                <span>🛍️</span>
                {buttons?.buttons?.[0]?.text || 'View items'}
              </div>
              {mpmSections.filter((s) => s.title || s.productIds).length > 0 && (
                <div className="bg-white/80 dark:bg-[#1f2c34]/80 rounded-lg p-2 space-y-1">
                  {mpmSections.filter((s) => s.title || s.productIds).map((s, i) => (
                    <div key={i} className="text-[9px] text-gray-500 dark:text-[#8696a0]">
                      <span className="font-semibold">{s.title || `Section ${i + 1}`}</span>
                      {' · '}
                      {s.productIds.split(',').filter((p) => p.trim()).length} product(s)
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            buttons?.buttons && (
              <div className="mt-1.5 space-y-1">
                {buttons.buttons.map((btn, i) => (
                  <div key={i} className="bg-white dark:bg-[#1f2c34] rounded-lg py-1.5 text-center text-[11px] text-[#00a5f4] font-medium shadow-sm">
                    {btn.text}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Phone normalizer ─────────────────────────────────────────────────────────
function normalizePhone(raw: string): string {
  // Strip formatting only — no country-code prefix added
  const p = raw.replace(/[\s\-\(\)\.]/g, '').replace(/^\+/, '');
  // if (/^\d{10}$/.test(p)) return '91' + p;   // uncomment to auto-prefix Indian 10-digit
  // if (/^0\d{10}$/.test(p)) return '91' + p.slice(1);  // uncomment to strip leading 0 + prefix
  return p;
}

interface PendingBatch {
  normalized:  string[];
  prefixed:    string[];
  dupeInBatch: string[];
  dupeInList:  string[];
  fresh:       string[];
}

function buildBatch(raw: string, existing: string[]): PendingBatch | null {
  const tokens = raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  if (tokens.length === 0) return null;

  const normalized: string[] = [];
  const prefixed: string[] = [];

  for (const t of tokens) {
    const orig = t.replace(/[\s\-\(\)\.]/g, '').replace(/^\+/, '');
    const norm = normalizePhone(t);
    if (norm.length < 10) continue;
    normalized.push(norm);
    if (norm !== orig) prefixed.push(norm);
  }

  const seen = new Set<string>();
  const dupeInBatch: string[] = [];
  const unique: string[] = [];
  for (const n of normalized) {
    if (seen.has(n)) { dupeInBatch.push(n); } else { seen.add(n); unique.push(n); }
  }

  const existingSet = new Set(existing);
  const dupeInList = unique.filter((n) => existingSet.has(n));
  const fresh = unique.filter((n) => !existingSet.has(n));

  return { normalized: unique, prefixed, dupeInBatch, dupeInList, fresh };
}

// ─── Step 3: Recipients ────────────────────────────────────────────────────────
function StepRecipients({ phones, onPhones }: { phones: string[]; onPhones: (p: string[]) => void }) {
  const [input, setInput]     = useState('');
  const [error, setError]     = useState('');
  const [pending, setPending] = useState<PendingBatch | null>(null);

  const preview = (raw: string) => {
    const batch = buildBatch(raw, phones);
    if (!batch || batch.normalized.length === 0) {
      setError('No valid phone numbers found. Use one per line or comma-separated.');
      setPending(null);
      return;
    }
    setError('');
    setPending(batch);
  };

  const confirmAdd = () => {
    if (!pending) return;
    onPhones([...phones, ...pending.fresh]);
    setInput('');
    setPending(null);
  };

  const remove = (ph: string) => onPhones(phones.filter((p) => p !== ph));

  const handleCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setInput(text.trim());
      const batch = buildBatch(text, phones);
      if (batch && batch.normalized.length > 0) { setError(''); setPending(batch); }
      else setError('No valid numbers found in file.');
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4 h-full overflow-y-auto">
      {!pending && (
        <div className="bg-gray-50 dark:bg-[#1f2c34] rounded-xl border border-gray-200 dark:border-[#2a3942] p-4">
          <label className="block text-xs font-semibold text-gray-600 dark:text-[#8696a0] mb-2">
            Enter phone numbers — one per line or comma-separated
          </label>
          <textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            placeholder={'9876543210\n919876543210\n+918765432109'}
            rows={4}
            className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#111b21] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green resize-none font-mono"
          />
          <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-1">Numbers are broadcast as entered. Duplicates are removed automatically.</p>
          {error && <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => preview(input)}
              disabled={!input.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-wp-dark text-white text-xs font-semibold rounded-xl hover:bg-[#064e45] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={13} /> Preview & Verify
            </button>
            <label className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 dark:bg-[#2a3942] text-gray-600 dark:text-[#8696a0] text-xs font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-[#3b4a54] transition-colors cursor-pointer">
              <Upload size={13} /> Upload CSV / TXT
              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCsv} />
            </label>
          </div>
        </div>
      )}

      {pending && (
        <div className="bg-white dark:bg-[#111b21] rounded-xl border border-gray-200 dark:border-[#2a3942] overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/30 flex items-center gap-2">
            <AlertCircle size={15} className="text-amber-500 shrink-0" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Review before adding</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Valid numbers', val: pending.normalized.length, color: 'text-[#111b21] dark:text-[#e9edef]', bg: 'bg-gray-50 dark:bg-[#1f2c34]' },
                { label: 'New to add',    val: pending.fresh.length,      color: 'text-green-600',                     bg: 'bg-green-50 dark:bg-green-900/20' },
                { label: '91 prefixed',   val: pending.prefixed.length,   color: 'text-blue-600',                      bg: 'bg-blue-50 dark:bg-blue-900/20' },
                { label: 'Duplicates',    val: pending.dupeInBatch.length + pending.dupeInList.length, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
              ].map(({ label, val, color, bg }) => (
                <div key={label} className={`${bg} rounded-lg p-2.5 text-center`}>
                  <p className={`text-xl font-bold ${color}`}>{val}</p>
                  <p className="text-[10px] text-gray-500 dark:text-[#8696a0] mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {pending.prefixed.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-lg px-3 py-2 flex items-start gap-2">
                <CheckCircle2 size={13} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  <strong>{pending.prefixed.length}</strong> number{pending.prefixed.length > 1 ? 's' : ''} auto-prefixed with <strong>91</strong>
                  {' '}(e.g. {pending.prefixed.slice(0, 2).join(', ')}{pending.prefixed.length > 2 ? '…' : ''})
                </p>
              </div>
            )}
            {(pending.dupeInBatch.length + pending.dupeInList.length) > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-lg px-3 py-2 flex items-start gap-2">
                <X size={13} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 dark:text-red-400">
                  {pending.dupeInBatch.length > 0 && <><strong>{pending.dupeInBatch.length}</strong> duplicate{pending.dupeInBatch.length > 1 ? 's' : ''} in this batch removed. </>}
                  {pending.dupeInList.length > 0 && <><strong>{pending.dupeInList.length}</strong> already in your list, skipped.</>}
                </p>
              </div>
            )}
            {pending.fresh.length === 0 && (
              <div className="bg-gray-50 dark:bg-[#1f2c34] border border-gray-200 dark:border-[#2a3942] rounded-lg px-3 py-2 text-xs text-gray-500 dark:text-[#8696a0] text-center">
                All numbers are already in your list — nothing new to add.
              </div>
            )}
            {pending.fresh.length > 0 && (
              <div className="border border-gray-100 dark:border-[#2a3942] rounded-lg overflow-hidden">
                <div className="px-3 py-1.5 bg-gray-50 dark:bg-[#1f2c34] border-b border-gray-100 dark:border-[#2a3942]">
                  <p className="text-[10px] font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide">Numbers that will be added</p>
                </div>
                <div className="max-h-36 overflow-y-auto divide-y divide-gray-50 dark:divide-[#2a3942]">
                  {pending.fresh.map((p) => (
                    <div key={p} className="flex items-center gap-2 px-3 py-1.5">
                      <CheckCircle2 size={11} className="text-green-400 shrink-0" />
                      <span className="text-xs font-mono text-[#111b21] dark:text-[#e9edef]">{p}</span>
                      {pending.prefixed.includes(p) && (
                        <span className="text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1 rounded font-medium">91 added</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={() => setPending(null)}
              className="flex-1 py-2 border border-gray-200 dark:border-[#2a3942] text-gray-600 dark:text-[#8696a0] text-xs font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-[#1f2c34] transition-colors"
            >
              Back to Edit
            </button>
            <button
              onClick={confirmAdd}
              disabled={pending.fresh.length === 0}
              className="flex-1 py-2 bg-wp-dark text-white text-xs font-semibold rounded-xl hover:bg-[#064e45] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 size={13} /> Confirm & Add {pending.fresh.length > 0 ? `${pending.fresh.length} number${pending.fresh.length > 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      )}

      {phones.length > 0 && (
        <div className="bg-white dark:bg-[#111b21] rounded-xl border border-gray-200 dark:border-[#2a3942] overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-[#2a3942] flex items-center justify-between bg-[#f8fafb] dark:bg-[#1f2c34]">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-wp-dark dark:text-wp-green" />
              <span className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef]">{phones.length} recipient{phones.length > 1 ? 's' : ''} confirmed</span>
            </div>
            <button onClick={() => onPhones([])} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
              <Trash2 size={11} /> Clear all
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-gray-50 dark:divide-[#2a3942]">
            {phones.map((phone) => (
              <div key={phone} className="flex items-center justify-between px-4 py-2.5 group hover:bg-gray-50 dark:hover:bg-[#1f2c34]">
                <div className="flex items-center gap-2.5">
                  <Avatar name={phone} size="sm" />
                  <span className="text-sm font-mono text-[#111b21] dark:text-[#e9edef]">{phone}</span>
                </div>
                <button onClick={() => remove(phone)} className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                  <X size={12} className="text-red-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Preview & Confirm ────────────────────────────────────────────────
function StepPreview({
  template, params, headerMediaUrl, phones, campaignName, onName,
}: {
  template: Template;
  params: Record<string, string>;
  headerMediaUrl: string;
  phones: string[];
  campaignName: string;
  onName: (n: string) => void;
}) {
  const body = template.components.find((c) => c.type === 'BODY');
  const header = template.components.find((c) => c.type === 'HEADER');
  const footer = template.components.find((c) => c.type === 'FOOTER');
  const buttons = template.components.find((c) => c.type === 'BUTTONS');
  const isMediaHeader = header && header.format !== 'TEXT' && header.format !== undefined;

  return (
    <div className="space-y-4 overflow-y-auto h-full">
      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-[#8696a0] mb-1.5">Campaign Name</label>
        <input
          value={campaignName}
          onChange={(e) => onName(e.target.value)}
          className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green"
          placeholder="e.g. Summer Sale Blast"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Template',   value: template.name.replace(/_/g, ' ') },
          { label: 'Recipients', value: phones.length },
          { label: 'Category',   value: template.category.toLowerCase() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#f8fafb] dark:bg-[#1f2c34] rounded-xl p-3 border border-gray-100 dark:border-[#2a3942]">
            <p className="text-[10px] text-gray-400 dark:text-[#667781] font-medium uppercase tracking-wide">{label}</p>
            <p className="text-base font-bold text-[#111b21] dark:text-[#e9edef] mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] mb-2 uppercase tracking-wide">Message Preview</p>
        <div className="bg-[#e8f5e9] dark:bg-[#0d2a1a] rounded-2xl p-4">
          <div className="bg-white dark:bg-[#1f2c34] rounded-xl shadow-sm p-4 max-w-sm mx-auto">
            {isMediaHeader && headerMediaUrl && (
              <div className="h-28 bg-gray-100 dark:bg-[#2a3942] rounded-lg mb-2 overflow-hidden">
                <img src={headerMediaUrl} alt="header" className="w-full h-full object-cover" />
              </div>
            )}
            {isMediaHeader && !headerMediaUrl && (
              <div className="h-16 bg-gray-100 dark:bg-[#2a3942] rounded-lg mb-2 flex items-center justify-center text-gray-400 dark:text-[#667781] text-xs">{header?.format} Header</div>
            )}
            {!isMediaHeader && header?.text && (
              <p className="text-sm font-bold text-[#111b21] dark:text-[#e9edef] mb-1">{fillTemplate(header.text, params)}</p>
            )}
            {body?.text && (
              <p className="text-sm text-[#111b21] dark:text-[#e9edef] leading-relaxed">{fillTemplate(body.text, params)}</p>
            )}
            {footer?.text && (
              <p className="text-xs text-gray-400 dark:text-[#667781] mt-2 pt-2 border-t dark:border-[#2a3942]">{footer.text}</p>
            )}
          </div>
          {buttons?.buttons && (
            <div className="mt-2 space-y-1 max-w-sm mx-auto">
              {buttons.buttons.map((btn, i) => (
                <div key={i} className="bg-white dark:bg-[#2a3942] rounded-lg py-1.5 text-center text-sm text-[#00a5f4] font-medium shadow-sm">{btn.text}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-xl p-3 flex items-start gap-2">
        <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          This will send the template to <strong>{phones.length}</strong> recipient{phones.length > 1 ? 's' : ''} via WhatsApp Cloud API v25.0.
          A <strong>3–6 second delay</strong> is applied between each send to avoid rate-limiting.
        </p>
      </div>
    </div>
  );
}

// ─── Campaign History ─────────────────────────────────────────────────────────

interface InlineEditState {
  name: string;
  bodyParams: string[];
  headerMediaUrl: string;
  phonesText: string;
}

function CampaignHistory({
  campaigns, loading, onRepeat, onRetry, onBroadcastNew,
}: {
  campaigns: Campaign[];
  loading: boolean;
  onRepeat: (c: Campaign) => void;
  onRetry: (campaignId: string) => void;
  onBroadcastNew: (data: { name: string; templateName: string; language: string; bodyParams: string[]; headerMediaUrl: string; phones: string[] }) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForms, setEditForms] = useState<Record<string, InlineEditState>>({});

  const startEdit = (c: Campaign) => {
    setEditingId(c.id);
    setExpanded(null);
    setEditForms((prev) => ({
      ...prev,
      [c.id]: {
        name: c.name,
        bodyParams: [...(c.bodyParams || [])],
        headerMediaUrl: c.headerMediaUrl || '',
        phonesText: c.recipients.map((r) => r.phone).join('\n'),
      },
    }));
  };

  const cancelEdit = () => setEditingId(null);

  const broadcastNew = (c: Campaign) => {
    const form = editForms[c.id];
    if (!form) return;
    const phones = form.phonesText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    onBroadcastNew({
      name: form.name,
      templateName: c.templateName,
      language: c.language,
      bodyParams: form.bodyParams,
      headerMediaUrl: form.headerMediaUrl,
      phones,
    });
    setEditingId(null);
  };

  const statusConfig: Record<string, { icon: any; cls: string; badge: string }> = {
    completed: { icon: CheckCircle2, cls: 'text-green-500',                          badge: 'bg-green-100 text-green-700' },
    sending:   { icon: Clock,        cls: 'text-yellow-500 animate-pulse',            badge: 'bg-yellow-100 text-yellow-700' },
    failed:    { icon: XCircle,      cls: 'text-red-500',                             badge: 'bg-red-100 text-red-700' },
    draft:     { icon: Sliders,      cls: 'text-gray-400',                            badge: 'bg-gray-100 text-gray-600' },
  };

  if (loading) return <BroadcastHistorySkeleton count={3} />;

  if (campaigns.length === 0) return (
    <div className="flex flex-col items-center justify-center h-40 text-gray-400">
      <Megaphone size={32} className="mb-2 opacity-30" />
      <p className="text-sm">No campaigns yet — send your first broadcast!</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {campaigns.map((c) => {
        const cfg  = statusConfig[c.status] || statusConfig.draft;
        const Icon = cfg.icon;
        const sent = c.sentCount || 0;
        const pct  = (n: number) => sent > 0 ? Math.round(n / sent * 100) : 0;
        const isExpanded = expanded === c.id;

        return (
          <div key={c.id} className="bg-white dark:bg-[#111b21] rounded-2xl border border-gray-100 dark:border-[#2a3942] shadow-sm overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Icon size={14} className={cfg.cls} />
                    <h3 className="font-semibold text-sm text-[#111b21] dark:text-[#e9edef] truncate">{c.name}</h3>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-[#667781]">
                    {c.templateName.replace(/_/g, ' ')} · {new Date(c.createdAt).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${cfg.badge}`}>
                    {c.status}
                  </span>
                  {(c.undeliveredCount > 0 || c.failedCount > 0) && c.status === 'completed' && (
                    <button
                      onClick={() => onRetry(c.id)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 text-white text-[10px] font-semibold rounded-lg hover:bg-amber-600 transition-colors"
                    >
                      <RefreshCw size={10} />
                      Retry {(c.undeliveredCount ?? 0) + c.failedCount}
                    </button>
                  )}
                  <button
                    onClick={() => onRepeat(c)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-wp-dark text-white text-[10px] font-semibold rounded-lg hover:bg-[#064e45] transition-colors"
                  >
                    <RefreshCw size={10} /> Repeat
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: 'Sent',         val: sent,                       color: 'text-wp-green',                             bg: 'bg-green-50 dark:bg-green-900/20'   },
                  { label: 'Delivered',    val: c.deliveredCount ?? 0,      color: 'text-[#34B7F1]',                            bg: 'bg-blue-50 dark:bg-blue-900/20'     },
                  { label: 'Seen',         val: c.readCount      ?? 0,      color: 'text-purple-600',                           bg: 'bg-purple-50 dark:bg-purple-900/20' },
                  { label: 'Replied',      val: c.repliedCount   ?? 0,      color: 'text-orange-600',                           bg: 'bg-orange-50 dark:bg-orange-900/20' },
                  { label: 'Failed',       val: c.failedCount    ?? 0,      color: 'text-red-500',                              bg: 'bg-red-50 dark:bg-red-900/20'       },
                  { label: 'Undelivered',  val: c.undeliveredCount ?? 0,    color: 'text-amber-500',                            bg: 'bg-amber-50 dark:bg-amber-900/20'   },
                ].map(({ label, val, color, bg }) => (
                  <div key={label} className={`${bg} rounded-xl p-2.5 text-center`}>
                    <p className={`text-lg font-bold ${color}`}>{val}</p>
                    <p className="text-[10px] text-gray-400 dark:text-[#667781] font-medium">{label}</p>
                  </div>
                ))}
              </div>

              {/* Undelivered recipients list — shown inline when expanded */}
              {(c.undeliveredCount ?? 0) > 0 && c.status === 'completed' && (
                <div className="mb-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle size={13} className="text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      <strong>{c.undeliveredCount}</strong> message{c.undeliveredCount !== 1 ? 's' : ''} sent but not yet delivered to recipient devices
                    </p>
                  </div>
                  <button
                    onClick={() => onRetry(c.id)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold rounded-lg transition-colors"
                  >
                    <RefreshCw size={11} /> Retry {c.undeliveredCount + (c.failedCount ?? 0)}
                  </button>
                </div>
              )}

              {sent > 0 && (
                <div className="space-y-1.5">
                  {[
                    { label: 'Delivered', rate: pct(c.deliveredCount ?? 0), color: 'bg-[#34B7F1]' },
                    { label: 'Seen',      rate: pct(c.readCount      ?? 0), color: 'bg-purple-400' },
                    { label: 'Replied',   rate: pct(c.repliedCount   ?? 0), color: 'bg-orange-400' },
                  ].map(({ label, rate, color }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 w-14 shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-[#2a3942] rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${rate}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500 dark:text-[#8696a0] w-7 text-right shrink-0">{rate}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setExpanded(isExpanded ? null : c.id)}
              className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-[#1f2c34] border-t border-gray-100 dark:border-[#2a3942] text-xs text-gray-500 dark:text-[#8696a0] hover:bg-gray-100 dark:hover:bg-[#2a3942] transition-colors"
            >
              <span className="font-medium">{c.recipients.length} recipient{c.recipients.length !== 1 ? 's' : ''}</span>
              <ChevronRight size={14} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 dark:border-[#2a3942] max-h-48 overflow-y-auto divide-y divide-gray-50 dark:divide-[#2a3942]">
                {c.recipients.map((r) => (
                  <div key={r.phone} className="flex items-center justify-between px-4 py-2">
                    <span className="text-xs font-mono text-[#111b21] dark:text-[#e9edef]">+{r.phone}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      r.status === 'sent'      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'    :
                      r.status === 'delivered' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'        :
                      r.status === 'read'      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400':
                      r.status === 'failed'    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'            :
                      'bg-gray-100 dark:bg-[#2a3942] text-gray-500 dark:text-[#8696a0]'
                    }`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main BroadcastPage ────────────────────────────────────────────────────────
export default function BroadcastPage() {
  const dispatch = useAppDispatch();
  const { templates, loading: templatesLoading } = useAppSelector((s) => s.templates);

  const [step, setStep] = useState(0);
  const [tab, setTab] = useState<'compose' | 'history'>('compose');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [thumbnailProductId, setThumbnailProductId] = useState('');
  const [mpmSections, setMpmSections] = useState<MPMSectionDraft[]>([{ title: '', productIds: '' }]);
  const [phones, setPhones] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState('');
  const [sending, setSending] = useState(false);
  const [liveProgress, setLiveProgress] = useState<LiveProgress | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    dispatch(fetchTemplates());
  }, [dispatch]);

  // Poll delivered/read counts after broadcast completes
  useEffect(() => {
    if (!liveProgress?.done || !liveProgress.campaignId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/broadcast?id=${liveProgress.campaignId}`);
        if (!res.ok) return;
        const data = await res.json();
        setLiveProgress((prev) =>
          prev ? { ...prev, deliveredCount: data.deliveredCount ?? 0, readCount: data.readCount ?? 0 } : prev
        );
      } catch { /* network hiccup — retry next tick */ }
    };

    poll();
    pollingRef.current = setInterval(poll, 5000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [liveProgress?.done, liveProgress?.campaignId]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/broadcast');
      if (res.ok) setCampaigns(await res.json());
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleBroadcastNew = useCallback((data: {
    name: string; templateName: string; language: string;
    bodyParams: string[]; headerMediaUrl: string; phones: string[];
  }) => {
    const tpl = templates.find((t) => t.name === data.templateName) || null;
    const paramMap: Record<string, string> = {};
    data.bodyParams.forEach((v, i) => { paramMap[`{{${i + 1}}}`] = v; });
    setSelectedTemplate(tpl);
    setParams(paramMap);
    setHeaderMediaUrl(data.headerMediaUrl);
    setPhones(data.phones);
    setCampaignName(`${data.name} (Copy)`);
    setMpmSections([{ title: '', productIds: '' }]);
    setThumbnailProductId('');
    setLiveProgress(null);
    setError('');
    setStep(tpl ? 3 : 0);
    setTab('compose');
  }, [templates]);

  const handleRepeat = useCallback((campaign: Campaign) => {
    const tpl = templates.find((t) => t.name === campaign.templateName) || null;
    const paramMap: Record<string, string> = {};
    (campaign.bodyParams || []).forEach((v, i) => { paramMap[`{{${i + 1}}}`] = v; });

    setSelectedTemplate(tpl);
    setParams(paramMap);
    setHeaderMediaUrl(campaign.headerMediaUrl || '');
    setThumbnailProductId('');
    setMpmSections([{ title: '', productIds: '' }]);
    setPhones(campaign.recipients.map((r) => r.phone));
    setCampaignName(`Repeat: ${campaign.name}`);
    setLiveProgress(null);
    setError('');
    setStep(tpl ? 1 : 0);
    setTab('compose');
  }, [templates]);

  const handleRetry = useCallback(async (campaignId: string) => {
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/broadcast/${campaignId}`, { method: 'POST' });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: 'Retry failed' }));
        throw new Error(data.error || 'Retry failed');
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'start') {
              setLiveProgress({ campaignId: event.campaignId, total: event.total, sentCount: 0, failedCount: 0, log: [], done: false, deliveredCount: 0, readCount: 0 });
              setSending(false);
            } else if (event.type === 'progress') {
              setLiveProgress((prev) => prev ? {
                ...prev,
                sentCount: event.sentCount,
                failedCount: event.failedCount,
                log: [{ phone: event.phone, status: event.status, error: event.error }, ...prev.log].slice(0, 60),
              } : prev);
            } else if (event.type === 'done') {
              setLiveProgress((prev) => prev ? { ...prev, done: true, sentCount: event.sent, failedCount: event.failed } : prev);
            }
          } catch { /* malformed event */ }
        }
      }
    } catch (err: any) {
      setError(err.message);
      setSending(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'history') fetchHistory();
  }, [tab, fetchHistory]);

  const canProceed = () => {
    if (step === 0) return !!selectedTemplate;
    if (step === 1 && selectedTemplate && checkIsMPM(selectedTemplate)) {
      const hasThumb = thumbnailProductId.trim().length > 0;
      const hasSections = mpmSections.some(
        (s) => s.title.trim() && s.productIds.split(',').some((id) => id.trim())
      );
      return hasThumb && hasSections;
    }
    if (step === 2) return phones.length > 0;
    return true;
  };

  const handleSend = async () => {
    if (!selectedTemplate || phones.length === 0) return;
    setSending(true);
    setError('');

    try {
      const isMPM = checkIsMPM(selectedTemplate);
      const header = selectedTemplate.components.find((c) => c.type === 'HEADER');
      const body   = selectedTemplate.components.find((c) => c.type === 'BODY');
      const isMediaHeader = header && header.format !== 'TEXT' && header.format !== undefined;

      const bodyPlaceholders  = body?.text ? extractPlaceholders(body.text) : [];
      const bodyParams        = bodyPlaceholders.map((ph) => params[ph] || '');
      const headerPlaceholders = header?.text ? extractPlaceholders(header.text) : [];
      const headerParam        = headerPlaceholders.length > 0 ? (params[headerPlaceholders[0]] || '') : '';
      const buttonsComp        = selectedTemplate.components.find((c) => c.type === 'BUTTONS');
      const isCatalogTemplate  = !isMPM && (buttonsComp?.buttons?.some((b: any) => b.type === 'CATALOG') ?? false);

      const mpmSectionsPayload = isMPM
        ? mpmSections
            .filter((s) => s.title.trim() || s.productIds.trim())
            .map((s) => ({
              title: s.title,
              product_items: s.productIds
                .split(',')
                .map((id) => ({ product_retailer_id: id.trim() }))
                .filter((item) => item.product_retailer_id),
            }))
        : [];

      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName || `Campaign ${new Date().toLocaleString('en-IN')}`,
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
          language: selectedTemplate.language,
          bodyParams,
          headerParam,
          headerMediaUrl: isMediaHeader && !isMPM ? headerMediaUrl : '',
          headerMediaType: isMediaHeader && !isMPM ? (header?.format?.toLowerCase() || 'image') : 'image',
          isCatalogTemplate,
          isMPMTemplate: isMPM,
          mpmSections: mpmSectionsPayload,
          thumbnailProductRetailerId: isMPM ? thumbnailProductId : '',
          recipients: phones,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: 'Broadcast failed' }));
        throw new Error(data.error || 'Broadcast failed');
      }

      // Stream SSE events
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'start') {
              setLiveProgress({
                campaignId:    event.campaignId,
                total:         event.total,
                sentCount:     0,
                failedCount:   0,
                log:           [],
                done:          false,
                deliveredCount: 0,
                readCount:     0,
              });
              setSending(false);

            } else if (event.type === 'progress') {
              setLiveProgress((prev) => prev ? {
                ...prev,
                sentCount:   event.sentCount,
                failedCount: event.failedCount,
                log: [
                  { phone: event.phone, status: event.status, error: event.error },
                  ...prev.log,
                ].slice(0, 60),
              } : prev);

            } else if (event.type === 'done') {
              setLiveProgress((prev) => prev ? {
                ...prev,
                done:        true,
                sentCount:   event.sent,
                failedCount: event.failed,
              } : prev);
            }
          } catch { /* malformed event — skip */ }
        }
      }

    } catch (err: any) {
      setError(err.message);
      setSending(false);
    }
  };

  const resetForm = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setStep(0);
    setSelectedTemplate(null);
    setParams({});
    setHeaderMediaUrl('');
    setThumbnailProductId('');
    setMpmSections([{ title: '', productIds: '' }]);
    setPhones([]);
    setCampaignName('');
    setLiveProgress(null);
    setError('');
  };

  // ── Live progress screen ────────────────────────────────────────────────────
  if (liveProgress) {
    return (
      <LiveProgressScreen
        progress={liveProgress}
        onNewCampaign={resetForm}
        onViewHistory={() => { resetForm(); setTab('history'); fetchHistory(); }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f2f5] dark:bg-[#0b141a]">
      {/* Page header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-[#111b21] border-b border-gray-200 dark:border-[#2a3942] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-wp-dark rounded-xl flex items-center justify-center">
            <Megaphone size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#111b21] dark:text-[#e9edef]">Broadcast</h1>
            <p className="text-xs text-gray-500 dark:text-[#8696a0]">Send marketing templates to individual or mass recipients</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 dark:bg-[#1f2c34] rounded-xl p-1">
            {([['compose', 'Compose', Send], ['history', 'History', History]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tab === id ? 'bg-white dark:bg-[#2a3942] text-wp-dark dark:text-[#e9edef] shadow-sm' : 'text-gray-500 dark:text-[#8696a0] hover:text-gray-700 dark:hover:text-[#e9edef]'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
          {tab === 'history' && (
            <button onClick={fetchHistory} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-[#1f2c34] transition-colors">
              <RefreshCw size={15} className={`text-gray-500 dark:text-[#8696a0] ${historyLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {tab === 'history' ? (
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl w-full mx-auto">
          <CampaignHistory campaigns={campaigns} loading={historyLoading} onRepeat={handleRepeat} onRetry={handleRetry} onBroadcastNew={handleBroadcastNew} />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Stepper sidebar */}
          <div className="w-52 bg-white dark:bg-[#111b21] border-r border-gray-200 dark:border-[#2a3942] flex flex-col pt-6 px-4 shrink-0">
            {STEPS.map((label, i) => (
              <button
                key={label}
                onClick={() => step > i && setStep(i)}
                className={`flex items-center gap-3 mb-2 p-2.5 rounded-xl text-left transition-colors ${
                  i === step ? 'bg-[#e8f5e9] dark:bg-[#1a3a2a]' : step > i ? 'hover:bg-gray-50 dark:hover:bg-[#1f2c34] cursor-pointer' : 'cursor-default'
                }`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  i === step ? 'bg-wp-green text-white' :
                  step > i ? 'bg-wp-dark text-white' : 'bg-gray-100 dark:bg-[#2a3942] text-gray-400 dark:text-[#667781]'
                }`}>
                  {step > i ? <CheckCircle2 size={14} /> : i + 1}
                </div>
                <div>
                  <p className={`text-xs font-semibold ${i === step ? 'text-wp-dark dark:text-wp-green' : step > i ? 'text-[#111b21] dark:text-[#e9edef]' : 'text-gray-400 dark:text-[#667781]'}`}>
                    {label}
                  </p>
                  {i === 0 && selectedTemplate && (
                    <p className="text-[10px] text-gray-400 dark:text-[#667781] truncate w-24">{selectedTemplate.name.replace(/_/g, ' ')}</p>
                  )}
                  {i === 2 && phones.length > 0 && (
                    <p className="text-[10px] text-wp-green font-medium">{phones.length} added</p>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Step content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden p-6">
              <div className="h-full max-w-2xl">
                {step === 0 && (
                  <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2a3942] h-full overflow-hidden flex flex-col">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-[#2a3942]">
                      <h2 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Choose a Template</h2>
                      <p className="text-xs text-gray-400 dark:text-[#667781]">Only approved templates can be used for broadcast</p>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <StepTemplate templates={templates} loading={templatesLoading} selected={selectedTemplate} onSelect={(t) => {
                        if (t.id !== selectedTemplate?.id) {
                          setParams({});
                          setHeaderMediaUrl('');
                          setThumbnailProductId('');
                          setMpmSections([{ title: '', productIds: '' }]);
                        }
                        setSelectedTemplate(t);
                      }} />
                    </div>
                  </div>
                )}

                {step === 1 && selectedTemplate && (
                  <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2a3942] p-5 h-full overflow-hidden flex flex-col">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h2 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Fill Template Parameters</h2>
                        <p className="text-xs text-gray-400 dark:text-[#667781]">These values will be sent to all recipients</p>
                      </div>
                      <button
                        onClick={() => setStep(0)}
                        className="flex items-center gap-1 text-xs text-wp-dark hover:underline border border-wp-dark/30 rounded-full px-3 py-1"
                      >
                        <span className="font-medium">{selectedTemplate.name.replace(/_/g, ' ')}</span>
                        <span className="text-gray-400 ml-1">· Change</span>
                      </button>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <StepParams
                        template={selectedTemplate}
                        params={params}
                        onParams={setParams}
                        headerMediaUrl={headerMediaUrl}
                        onHeaderMedia={setHeaderMediaUrl}
                        thumbnailProductId={thumbnailProductId}
                        onThumbnailProductId={setThumbnailProductId}
                        mpmSections={mpmSections}
                        onMpmSections={setMpmSections}
                      />
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2a3942] p-5 h-full overflow-hidden flex flex-col">
                    <div className="mb-4">
                      <h2 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Add Recipients</h2>
                      <p className="text-xs text-gray-400 dark:text-[#667781]">Enter phone numbers with country code (no + prefix)</p>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <StepRecipients phones={phones} onPhones={setPhones} />
                    </div>
                  </div>
                )}

                {step === 3 && selectedTemplate && (
                  <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2a3942] p-5 h-full overflow-hidden flex flex-col">
                    <div className="mb-4">
                      <h2 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Preview & Send</h2>
                      <p className="text-xs text-gray-400 dark:text-[#667781]">Review before sending — this cannot be undone</p>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <StepPreview
                        template={selectedTemplate}
                        params={params}
                        headerMediaUrl={headerMediaUrl}
                        phones={phones}
                        campaignName={campaignName}
                        onName={setCampaignName}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation */}
            <div className="border-t border-gray-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] px-6 py-4 flex items-center justify-between">
              <button
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 dark:text-[#8696a0] hover:text-gray-900 dark:hover:text-[#e9edef] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} /> Back
              </button>

              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-wp-green' : i < step ? 'w-3 bg-wp-dark' : 'w-3 bg-gray-200 dark:bg-[#2a3942]'}`} />
                ))}
              </div>

              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed()}
                  className="flex items-center gap-1.5 px-5 py-2 bg-wp-dark text-white text-sm font-semibold rounded-xl hover:bg-[#064e45] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={sending || phones.length === 0 || !selectedTemplate}
                  className="flex items-center gap-2 px-6 py-2 bg-wp-green text-white text-sm font-bold rounded-xl hover:bg-[#22c55e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-md"
                >
                  {sending ? (
                    <><RefreshCw size={15} className="animate-spin" /> Starting…</>
                  ) : (
                    <><Send size={15} /> Send to {phones.length} recipient{phones.length > 1 ? 's' : ''}</>
                  )}
                </button>
              )}
            </div>

            {error && (
              <div className="mx-6 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl px-4 py-3 flex items-center gap-2">
                <AlertCircle size={14} className="text-red-500 shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
