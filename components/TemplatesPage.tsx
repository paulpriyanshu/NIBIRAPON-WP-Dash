'use client';
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';
import { fetchTemplates } from '@/store/slices/templatesSlice';
import { Template } from '@/types';
import { CheckCircle2, Clock, XCircle, Plus, Send, X, Phone, AlertCircle, ShoppingBag, Trash2, GripVertical, Pencil, Info } from 'lucide-react';
import CreateTemplateModal from './CreateTemplateModal';
import TemplateHistory from './templates/TemplateHistory';
import { TemplateGridSkeleton } from '@/components/ui/Skeletons';

const MAX_PRODUCTS = 30;
const MAX_SECTIONS = 10;

const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  MARKETING: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  UTILITY: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  AUTHENTICATION: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
};

const statusIcons: Record<string, { icon: any; color: string }> = {
  APPROVED: { icon: CheckCircle2, color: 'text-green-500' },
  PENDING: { icon: Clock, color: 'text-yellow-500' },
  REJECTED: { icon: XCircle, color: 'text-red-500' },
};

// ─── Send Modal ───────────────────────────────────────────────────────────────

function getVariables(text: string) {
  return [...new Set(text.match(/\{\{(\d+)\}\}/g) || [])];
}

function UseTemplateModal({ template, onClose }: { template: Template; onClose: () => void }) {
  // Dissect template components
  const headerComp  = template.components.find((c) => c.type === 'HEADER');
  const bodyComp    = template.components.find((c) => c.type === 'BODY');
  const footerComp  = template.components.find((c) => c.type === 'FOOTER');
  const buttonsComp = template.components.find((c) => c.type === 'BUTTONS');

  // What the header needs
  const headerIsMedia  = headerComp?.format === 'IMAGE' || headerComp?.format === 'VIDEO' || headerComp?.format === 'DOCUMENT';
  const headerIsText   = headerComp?.format === 'TEXT';
  const headerMediaType = (headerComp?.format?.toLowerCase() || 'image') as 'image' | 'video' | 'document';

  // Variable detection
  const headerTextVars = headerIsText && headerComp?.text ? getVariables(headerComp.text) : [];
  const bodyVars       = bodyComp?.text ? getVariables(bodyComp.text) : [];

  // URL buttons that have a dynamic suffix {{1}}
  const urlButtons = (buttonsComp?.buttons || []).filter((b) => b.type === 'URL' && b.url?.includes('{{1}}'));
  const isCatalog  = buttonsComp?.buttons?.some((b) => b.type === 'CATALOG') ?? false;

  const hasAnyParams = headerIsMedia || headerTextVars.length > 0 || bodyVars.length > 0 || urlButtons.length > 0;

  const [phone,          setPhone]          = useState('');
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [headerText,     setHeaderText]     = useState('');
  const [bodyValues,     setBodyValues]     = useState<string[]>(bodyVars.map(() => ''));
  const [buttonValues,   setButtonValues]   = useState<string[]>(urlButtons.map(() => ''));
  const [sending,        setSending]        = useState(false);
  const [result,         setResult]         = useState<{ ok: boolean; msg: string } | null>(null);

  const fill = (text: string) =>
    text.replace(/\{\{(\d+)\}\}/g, (_, n) => bodyValues[parseInt(n, 10) - 1] || `{{${n}}}`);
  const fillHeader = (text: string) =>
    text.replace(/\{\{1\}\}/g, headerText || '{{1}}');

  async function handleSend() {
    if (!phone.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:               phone.trim(),
          templateName:     template.name,
          language:         template.language,
          bodyParams:       bodyValues,
          headerParam:      headerIsText ? headerText : '',
          headerMediaUrl:   headerIsMedia ? headerMediaUrl : '',
          headerMediaType,
          buttonParams:     buttonValues,
          isCatalogTemplate: isCatalog,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult({ ok: true, msg: 'Message sent successfully!' });
      // Save to template history
      fetch('/api/template-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: template.name,
          language: template.language,
          bodyParams: bodyValues.filter(Boolean),
          headerParam: headerIsText ? headerText : '',
          headerMediaUrl: headerIsMedia ? headerMediaUrl : '',
          recipients: [phone.trim()],
          source: 'template_tab',
        }),
      }).catch(() => {});
    } catch (err: any) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-linear-to-r from-wp-dark to-wp-teal">
          <div>
            <p className="text-xs text-white/70 uppercase tracking-wide font-medium">Use Template</p>
            <h2 className="text-base font-semibold text-white">{template.name.replace(/_/g, ' ')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
            <X size={18} className="text-white" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Preview */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide mb-2">Preview</p>
            <div className="bg-[#e8f5e9] dark:bg-[#0d2a1a] rounded-xl p-3">
              <div className="bg-white dark:bg-[#1f2c34] rounded-xl shadow-sm p-3 max-w-65 ml-auto">
                {headerIsMedia && (
                  headerMediaUrl
                    ? <img src={headerMediaUrl} alt="header" className="w-full rounded-lg mb-2 object-cover max-h-32" onError={() => {}} />
                    : <div className="h-16 bg-gray-100 rounded-lg mb-2 flex items-center justify-center text-gray-300 text-xs uppercase">{headerComp?.format}</div>
                )}
                {headerIsText && headerComp?.text && (
                  <p className="text-sm font-bold text-[#111b21] dark:text-[#e9edef] mb-1">{fillHeader(headerComp.text)}</p>
                )}
                {bodyComp?.text && (
                  <p className="text-[11px] text-[#111b21] dark:text-[#e9edef] leading-relaxed whitespace-pre-wrap">{fill(bodyComp.text)}</p>
                )}
                {footerComp?.text && (
                  <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-1 border-t dark:border-[#2a3942] pt-1">{footerComp.text}</p>
                )}
              </div>
              {buttonsComp?.buttons && (
                <div className="mt-2 space-y-1 max-w-65 ml-auto">
                  {buttonsComp.buttons.map((btn, i) => (
                    <div key={i} className="bg-white dark:bg-[#1f2c34] rounded-lg py-1.5 text-center text-xs text-[#00a5f4] font-medium shadow-sm">
                      {btn.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Parameters */}
          {hasAnyParams && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide">Fill Parameters</p>

              {/* Header media URL */}
              {headerIsMedia && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-[#8696a0] mb-1 block">
                    Header {headerComp?.format?.toLowerCase()} URL <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={headerMediaUrl}
                    onChange={(e) => setHeaderMediaUrl(e.target.value)}
                    placeholder={`https://… (${headerComp?.format?.toLowerCase()} link)`}
                    className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-2 text-sm outline-none focus:border-wp-green transition-colors"
                  />
                </div>
              )}

              {/* Header text variable */}
              {headerTextVars.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-[#8696a0] mb-1 block">Header text <span className="text-red-400">*</span></label>
                  <input
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    placeholder="Header value"
                    className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-2 text-sm outline-none focus:border-wp-green transition-colors"
                  />
                </div>
              )}

              {/* Body variables */}
              {bodyVars.map((v, i) => (
                <div key={v}>
                  <label className="text-xs text-gray-500 dark:text-[#8696a0] mb-1 block">Body variable {v}</label>
                  <input
                    value={bodyValues[i] || ''}
                    onChange={(e) => { const next = [...bodyValues]; next[i] = e.target.value; setBodyValues(next); }}
                    placeholder={`Value for ${v}`}
                    className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-2 text-sm outline-none focus:border-wp-green transition-colors"
                  />
                </div>
              ))}

              {/* URL button suffix variables */}
              {urlButtons.map((btn, i) => (
                <div key={i}>
                  <label className="text-xs text-gray-500 dark:text-[#8696a0] mb-1 block">
                    Button "{btn.text}" — URL suffix
                  </label>
                  <input
                    value={buttonValues[i] || ''}
                    onChange={(e) => { const next = [...buttonValues]; next[i] = e.target.value; setButtonValues(next); }}
                    placeholder="URL suffix appended to button link"
                    className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-2 text-sm outline-none focus:border-wp-green transition-colors"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Phone */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide mb-2">Send To</p>
            <div className="flex items-center gap-2 border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] rounded-lg px-3 focus-within:border-wp-green transition-colors">
              <Phone size={15} className="text-gray-400 dark:text-[#667781] shrink-0" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="919876543210 (with country code, no +)"
                className="flex-1 py-2.5 text-sm outline-none bg-transparent text-gray-700 dark:text-[#e9edef] placeholder-gray-400 dark:placeholder-[#667781]"
              />
            </div>
            <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-1">Include country code — e.g. 919876543210 for India</p>
          </div>

          {/* Result */}
          {result && (
            <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
              result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {result.ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
              {result.msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-[#2a3942] px-5 py-4">
          <button
            onClick={handleSend}
            disabled={!phone.trim() || sending || result?.ok}
            className="w-full flex items-center justify-center gap-2 bg-wp-green hover:bg-[#22c55e] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {sending ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send size={15} />
            )}
            {sending ? 'Sending…' : result?.ok ? 'Sent!' : 'Send Message'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MPM Template Modal ───────────────────────────────────────────────────────

interface MPMProduct { id: string; retailerId: string }
interface MPMSectionDraft { id: string; title: string; products: MPMProduct[] }

function makeSectionId() { return `s_${Math.random().toString(36).slice(2, 8)}`; }
function makeProductId()  { return `p_${Math.random().toString(36).slice(2, 8)}`; }

function MPMTemplateModal({ template, onClose }: { template: Template; onClose: () => void }) {
  const headerComp   = template.components.find((c) => c.type === 'HEADER');
  const headerHasVar = headerComp?.format === 'TEXT' && !!headerComp.text?.includes('{{1}}');
  const bodyComp     = template.components.find((c) => c.type === 'BODY');
  const bodyVars     = bodyComp?.text ? getVariables(bodyComp.text) : [];

  const [phone,        setPhone]        = useState('');
  const [heading,      setHeading]      = useState('');
  const [bodyValues,   setBodyValues]   = useState<string[]>(bodyVars.map(() => ''));
  const [sections,     setSections]     = useState<MPMSectionDraft[]>([
    { id: makeSectionId(), title: 'Section 1', products: [{ id: makeProductId(), retailerId: '' }] },
  ]);
  const [thumbOverride, setThumbOverride] = useState('');
  const [sending,  setSending]  = useState(false);
  const [result,   setResult]   = useState<{ ok: boolean; msg: string } | null>(null);

  const totalProducts = sections.reduce((n, s) => n + s.products.length, 0);
  const firstRetailerId = sections[0]?.products[0]?.retailerId || '';
  const thumbnailId = thumbOverride || firstRetailerId;

  function addSection() {
    if (sections.length >= MAX_SECTIONS) return;
    setSections((prev) => [...prev, { id: makeSectionId(), title: `Section ${prev.length + 1}`, products: [{ id: makeProductId(), retailerId: '' }] }]);
  }

  function removeSection(sid: string) {
    setSections((prev) => prev.filter((s) => s.id !== sid));
  }

  function updateSectionTitle(sid: string, title: string) {
    setSections((prev) => prev.map((s) => s.id === sid ? { ...s, title } : s));
  }

  function addProduct(sid: string) {
    if (totalProducts >= MAX_PRODUCTS) return;
    setSections((prev) => prev.map((s) => s.id === sid ? { ...s, products: [...s.products, { id: makeProductId(), retailerId: '' }] } : s));
  }

  function removeProduct(sid: string, pid: string) {
    setSections((prev) => prev.map((s) =>
      s.id === sid ? { ...s, products: s.products.filter((p) => p.id !== pid) } : s
    ));
  }

  function updateProduct(sid: string, pid: string, value: string) {
    setSections((prev) => prev.map((s) =>
      s.id === sid ? { ...s, products: s.products.map((p) => p.id === pid ? { ...p, retailerId: value } : p) } : s
    ));
  }

  async function handleSend() {
    if (!phone.trim()) return;
    const allFilled = sections.every((s) => s.products.every((p) => p.retailerId.trim()));
    if (!allFilled || !thumbnailId) return;
    setSending(true);
    setResult(null);
    try {
      const mpmSections = sections.map((s) => ({
        title: s.title,
        product_items: s.products.map((p) => ({ product_retailer_id: p.retailerId.trim() })),
      }));
      const res = await fetch('/api/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone.trim(),
          templateName: template.name,
          language: template.language,
          headerParam: headerHasVar ? (heading.trim() || undefined) : undefined,
          bodyParams: bodyValues,
          isMPMTemplate: true,
          mpmSections,
          thumbnailProductRetailerId: thumbnailId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult({ ok: true, msg: 'MPM message sent successfully!' });
    } catch (err: any) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setSending(false);
    }
  }

  const canSend = phone.trim() && thumbnailId &&
    sections.length > 0 &&
    sections.every((s) =>
      s.title.trim() &&
      s.products.length > 0 &&
      s.products.every((p) => p.retailerId.trim())
    ) &&
    !sending && !result?.ok;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-linear-to-r from-wp-dark to-wp-teal shrink-0">
          <div>
            <p className="text-xs text-white/70 uppercase tracking-wide font-medium">Multi-Product Message</p>
            <h2 className="text-base font-semibold text-white">{template.name.replace(/_/g, ' ')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
            <X size={18} className="text-white" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Phone */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide mb-2">Send To</p>
            <div className="flex items-center gap-2 border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] rounded-lg px-3 focus-within:border-wp-green transition-colors">
              <Phone size={15} className="text-gray-400 dark:text-[#667781] shrink-0" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="919876543210 (with country code, no +)"
                className="flex-1 py-2.5 text-sm outline-none bg-transparent text-gray-700 dark:text-[#e9edef] placeholder-gray-400 dark:placeholder-[#667781]"
              />
            </div>
          </div>

          {/* Custom heading — only shown when template header has {{1}} */}
          {headerHasVar ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide mb-2">Message Heading</p>
              <input
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                placeholder="e.g. New Arrivals, Summer Collection…"
                className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors"
              />
            </div>
          ) : headerComp?.text ? (
            <div className="bg-gray-50 dark:bg-[#1f2c34] rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-[10px] text-gray-400 dark:text-[#667781] uppercase font-semibold tracking-wide shrink-0">Heading</span>
              <span className="text-sm text-[#111b21] dark:text-[#e9edef] font-medium">{headerComp.text}</span>
              <span className="text-[10px] text-gray-400 dark:text-[#667781] ml-auto">Fixed in template</span>
            </div>
          ) : null}

          {/* Body params */}
          {bodyVars.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide">Message Variables</p>
              {bodyVars.map((v, i) => (
                <div key={v}>
                  <label className="text-xs text-gray-500 dark:text-[#8696a0] mb-1 block">Variable {v}</label>
                  <input
                    value={bodyValues[i] || ''}
                    onChange={(e) => { const next = [...bodyValues]; next[i] = e.target.value; setBodyValues(next); }}
                    placeholder={`Value for ${v}`}
                    className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-2 text-sm outline-none focus:border-wp-green transition-colors"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Product counter banner */}
          <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-medium ${
            totalProducts >= MAX_PRODUCTS ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-[#e8f5e9] text-wp-dark border border-wp-green/20'
          }`}>
            <div className="flex items-center gap-2">
              <ShoppingBag size={15} />
              <span>{totalProducts} / {MAX_PRODUCTS} products</span>
            </div>
            <span className="text-xs opacity-70">{sections.length} section{sections.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Sections */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide">Product Sections</p>

            {sections.map((section) => (
              <div key={section.id} className="border border-gray-200 dark:border-[#2a3942] rounded-xl overflow-hidden">
                {/* Section header */}
                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-[#1f2c34] border-b border-gray-200 dark:border-[#2a3942]">
                  <GripVertical size={14} className="text-gray-300 dark:text-[#3a4a52] shrink-0" />
                  <div className="flex-1 flex flex-col gap-0.5">
                    <span className="text-[9px] text-gray-400 dark:text-[#667781] uppercase tracking-wide font-semibold leading-none">Subheading</span>
                    <input
                      value={section.title}
                      onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                      placeholder="e.g. Silk Sarees, Bestsellers… (required)"
                      className={`text-sm font-medium bg-transparent outline-none w-full placeholder-gray-400 dark:placeholder-[#667781] ${
                        !section.title.trim() ? 'text-red-500 placeholder-red-300' : 'text-[#111b21] dark:text-[#e9edef]'
                      }`}
                    />
                  </div>
                  {sections.length > 1 && (
                    <button onClick={() => removeSection(section.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Products */}
                <div className="p-3 space-y-2 dark:bg-[#111b21]">
                  {section.products.map((product, pi) => (
                    <div key={product.id} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 dark:text-[#667781] w-4 text-right shrink-0">{pi + 1}.</span>
                      <input
                        value={product.retailerId}
                        onChange={(e) => updateProduct(section.id, product.id, e.target.value)}
                        placeholder="Content ID (e.g. cp1jy4995r)"
                        className="flex-1 border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-wp-green transition-colors font-mono"
                      />
                      {section.products.length > 1 && (
                        <button onClick={() => removeProduct(section.id, product.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors shrink-0">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    onClick={() => addProduct(section.id)}
                    disabled={totalProducts >= MAX_PRODUCTS}
                    className="flex items-center gap-1.5 text-xs text-wp-dark hover:underline disabled:opacity-40 disabled:cursor-not-allowed mt-1 px-1"
                  >
                    <Plus size={12} /> Add product
                  </button>
                </div>
              </div>
            ))}

            {sections.length < MAX_SECTIONS && (
              <button
                onClick={addSection}
                disabled={totalProducts >= MAX_PRODUCTS}
                className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-200 dark:border-[#2a3942] rounded-xl text-xs text-gray-500 dark:text-[#8696a0] hover:border-wp-green hover:text-wp-dark dark:hover:text-wp-green transition-colors disabled:opacity-40"
              >
                <Plus size={13} /> Add Section
              </button>
            )}
          </div>

          {/* Thumbnail override */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide mb-2">Thumbnail Product</p>
            <p className="text-[10px] text-gray-400 dark:text-[#667781] mb-2">
              The product shown in the message preview. Defaults to first product ({firstRetailerId || '—'}).
            </p>
            <input
              value={thumbOverride}
              onChange={(e) => setThumbOverride(e.target.value)}
              placeholder={firstRetailerId || 'Content ID for thumbnail'}
              className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-wp-green transition-colors"
            />
          </div>

          {/* Result */}
          {result && (
            <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
              result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {result.ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
              {result.msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-[#2a3942] px-5 py-4 shrink-0">
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full flex items-center justify-center gap-2 bg-wp-green hover:bg-[#22c55e] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {sending ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={15} />}
            {sending ? 'Sending…' : result?.ok ? 'Sent!' : `Send to ${totalProducts} Product${totalProducts !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({ template, onUse, onEdit }: { template: Template; onUse: (t: Template) => void; onEdit: (t: Template) => void }) {
  const catStyle    = categoryColors[template.category] || categoryColors.UTILITY;
  const statusConf  = statusIcons[template.status]      || statusIcons.PENDING;
  const StatusIcon  = statusConf.icon;

  const bodyText   = template.components.find((c) => c.type === 'BODY')?.text    || '';
  const headerText = template.components.find((c) => c.type === 'HEADER' && c.format === 'TEXT')?.text;
  const buttons    = template.components.find((c) => c.type === 'BUTTONS')?.buttons || [];

  return (
    <div className="bg-white dark:bg-[#111b21] rounded-2xl border border-gray-100 dark:border-[#2a3942] shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="p-4 border-b border-gray-50 dark:border-[#2a3942]">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <StatusIcon size={14} className={statusConf.color} />
            <h3 className="font-semibold text-sm text-[#111b21] dark:text-[#e9edef]">{template.name.replace(/_/g, ' ')}</h3>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
            {template.category.toLowerCase()}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-[#667781]">
          <span className="capitalize">{template.status.toLowerCase()}</span>
          <span>•</span>
          <span>{template.language.toUpperCase()}</span>
        </div>
      </div>

      {/* Preview */}
      <div className="p-4 bg-[#e8f5e9] dark:bg-[#0d2a1a]">
        <div className="bg-white dark:bg-[#1f2c34] rounded-xl shadow-sm p-3 max-w-55 ml-auto">
          {headerText && <p className="text-xs font-bold text-[#111b21] dark:text-[#e9edef] mb-1">{headerText}</p>}
          {!headerText && template.components.find((c) => c.type === 'HEADER' && c.format !== 'TEXT') && (
            <div className="h-16 bg-gray-100 dark:bg-[#2a3942] rounded-lg mb-2 flex items-center justify-center text-gray-300 dark:text-[#667781] text-xs">
              {template.components.find((c) => c.type === 'HEADER')?.format}
            </div>
          )}
          <p className="text-[11px] text-[#111b21] dark:text-[#e9edef] leading-relaxed line-clamp-4">{bodyText}</p>
          {buttons.length > 0 && (
            <div className="border-t border-gray-100 dark:border-[#2a3942] mt-2 pt-2 space-y-1">
              {buttons.map((btn, i) => (
                <div key={i} className="text-center text-[10px] text-[#00a5f4] font-medium py-0.5">{btn.text}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 flex gap-2">
        <button
          onClick={() => onUse(template)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-wp-green text-white text-xs font-medium rounded-lg hover:bg-[#22c55e] transition-colors"
        >
          <Send size={12} /> Use Template
        </button>
        <button
          onClick={() => onEdit(template)}
          className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 dark:border-[#2a3942] text-gray-500 dark:text-[#8696a0] text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-[#1f2c34] transition-colors"
        >
          <Pencil size={11} /> Edit
        </button>
      </div>
    </div>
  );
}

// ─── Edit Template Modal ──────────────────────────────────────────────────────

function EditTemplateModal({ template, onClose, onSaved }: {
  template: Template;
  onClose: () => void;
  onSaved: () => void;
}) {
  const headerComp = template.components.find((c) => c.type === 'HEADER');
  const bodyComp   = template.components.find((c) => c.type === 'BODY');
  const footerComp = template.components.find((c) => c.type === 'FOOTER');
  const btnsComp   = template.components.find((c) => c.type === 'BUTTONS');

  const [headerText, setHeaderText] = useState(headerComp?.text ?? '');
  const [bodyText,   setBodyText]   = useState(bodyComp?.text   ?? '');
  const [footerText, setFooterText] = useState(footerComp?.text ?? '');
  const [saving,     setSaving]     = useState(false);
  const [result,     setResult]     = useState<{ ok: boolean; msg: string } | null>(null);

  const headerIsText = headerComp?.format === 'TEXT';

  async function handleSave() {
    setSaving(true);
    setResult(null);
    try {
      // Rebuild components array preserving structure
      const components: object[] = [];
      if (headerComp) {
        if (headerIsText) {
          components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
        } else {
          components.push({ type: 'HEADER', format: headerComp.format });
        }
      }
      if (bodyComp)   components.push({ type: 'BODY',   text: bodyText });
      if (footerComp) components.push({ type: 'FOOTER', text: footerText });
      if (btnsComp)   components.push(btnsComp);

      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ components }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult({ ok: true, msg: 'Template updated — status reset to Pending review by Meta.' });
      onSaved();
    } catch (e: any) {
      setResult({ ok: false, msg: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">

        <div className="flex items-center justify-between px-5 py-4 bg-linear-to-r from-wp-dark to-wp-teal shrink-0">
          <div>
            <p className="text-xs text-white/70 uppercase tracking-wide font-medium">Edit Template</p>
            <h2 className="text-base font-semibold text-white">{template.name.replace(/_/g, ' ')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
            <X size={18} className="text-white" />
          </button>
        </div>

        {/* Warning banner */}
        <div className="flex items-start gap-2 mx-5 mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>Editing content will reset this template to <strong>Pending</strong> until Meta re-approves it (usually a few minutes).</span>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Header text */}
          {headerIsText && (
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">
                Message Heading
                <span className="ml-1.5 text-[10px] font-normal text-gray-400 dark:text-[#667781] normal-case">(shown at the top of the WhatsApp message)</span>
              </label>
              <input
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors"
              />
            </div>
          )}

          {/* Body */}
          {bodyComp && (
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">Body Text</label>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={4}
                maxLength={1024}
                className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors resize-none"
              />
            </div>
          )}

          {/* Footer */}
          {footerComp && (
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">Footer</label>
              <input
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                maxLength={60}
                className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors"
              />
            </div>
          )}

          {/* Media header note */}
          {headerComp && !headerIsText && (
            <div className="bg-gray-50 dark:bg-[#1f2c34] rounded-xl px-4 py-3 text-xs text-gray-500 dark:text-[#8696a0] flex items-center gap-2">
              <Info size={13} className="shrink-0" />
              The header uses a <strong>{headerComp.format?.toLowerCase()}</strong> — media cannot be changed here. Use Meta Business Manager to swap the header format.
            </div>
          )}

          {result && (
            <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${result.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
              {result.ok ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <AlertCircle size={15} className="shrink-0 mt-0.5" />}
              {result.msg}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-[#2a3942] px-5 py-4 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving || result?.ok}
            className="w-full flex items-center justify-center gap-2 bg-wp-dark hover:bg-[#064e45] disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Pencil size={14} />}
            {saving ? 'Saving…' : result?.ok ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMPMTemplate(t: Template): boolean {
  const buttons = t.components.find((c) => c.type === 'BUTTONS')?.buttons || [];
  return buttons.some((b) => b.type === 'MPM') || t.name.toLowerCase().includes('mpm');
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const dispatch = useAppDispatch();
  const { templates, loading } = useAppSelector((s) => s.templates);
  const [activeTemplate,  setActiveTemplate]  = useState<Template | null>(null);
  const [editTemplate,    setEditTemplate]    = useState<Template | null>(null);
  const [showCreate,      setShowCreate]      = useState(false);
  const [tab,             setTab]             = useState<'templates' | 'history'>('templates');

  useEffect(() => {
    dispatch(fetchTemplates());
  }, [dispatch]);

  const approved = templates.filter((t) => t.status === 'APPROVED');
  const pending  = templates.filter((t) => t.status === 'PENDING');

  return (
    <div className="flex-1 overflow-y-auto bg-[#f0f2f5] dark:bg-[#0b141a]">
      {activeTemplate && isMPMTemplate(activeTemplate) && (
        <MPMTemplateModal template={activeTemplate} onClose={() => setActiveTemplate(null)} />
      )}
      {activeTemplate && !isMPMTemplate(activeTemplate) && (
        <UseTemplateModal template={activeTemplate} onClose={() => setActiveTemplate(null)} />
      )}
      {showCreate && (
        <CreateTemplateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); dispatch(fetchTemplates()); }}
        />
      )}
      {editTemplate && (
        <EditTemplateModal
          template={editTemplate}
          onClose={() => setEditTemplate(null)}
          onSaved={() => { setEditTemplate(null); dispatch(fetchTemplates()); }}
        />
      )}

      <div className="sticky top-0 z-10 bg-white dark:bg-[#111b21] border-b border-gray-200 dark:border-[#2a3942] px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-[#111b21] dark:text-[#e9edef]">Message Templates</h1>
            <p className="text-sm text-gray-500 dark:text-[#8696a0]">{approved.length} approved • {pending.length} pending</p>
          </div>
          {tab === 'templates' && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-wp-dark text-white text-sm font-medium rounded-xl hover:bg-[#064e45] transition-colors"
            >
              <Plus size={16} />
              Create Template
            </button>
          )}
        </div>
        {/* Tabs */}
        <div className="flex gap-1">
          {(['templates', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-wp-dark text-white'
                  : 'text-gray-500 dark:text-[#8696a0] hover:bg-gray-100 dark:hover:bg-[#2a3942]'
              }`}
            >
              {t === 'templates' ? 'Templates' : 'Recents'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {tab === 'history' ? (
          <TemplateHistory />
        ) : loading ? (
          <TemplateGridSkeleton count={6} />
        ) : (
          <>
            {approved.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 size={16} className="text-green-500" />
                  <h2 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Approved Templates</h2>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{approved.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {approved.map((t) => <TemplateCard key={t.id} template={t} onUse={setActiveTemplate} onEdit={setEditTemplate} />)}
                </div>
              </div>
            )}
            {pending.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} className="text-yellow-500" />
                  <h2 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Pending Review</h2>
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{pending.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pending.map((t) => <TemplateCard key={t.id} template={t} onUse={setActiveTemplate} onEdit={setEditTemplate} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
