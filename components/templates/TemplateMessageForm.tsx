'use client';
import { useState } from 'react';
import { X, Plus, Trash2, Check, Loader2, ShoppingBag } from 'lucide-react';
import type { Template } from '@/types';
import { specFromTemplate } from '@/lib/flow-engine';
import { renderTemplateMessage, type TemplateMessageConfig, type TemplateMessage } from '@/lib/templates';

const MAX_SECTIONS = 10;

const inputCls =
  'w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-2 text-sm outline-none focus:border-wp-green transition-colors';
const labelCls = 'text-xs text-gray-500 dark:text-[#8696a0] mb-1 block';
const sectionLabel = 'text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide';

interface Props {
  templates: Template[];
  initial?: TemplateMessage | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function TemplateMessageForm({ templates, initial, onClose, onSaved }: Props) {
  const [name, setName]                 = useState(initial?.name ?? '');
  const [templateName, setTemplateName] = useState(initial?.templateName ?? '');
  const [cfg, setCfg]                   = useState<TemplateMessageConfig>(initial?.config ?? {});
  const [agentDescription, setAgentDescription] = useState(initial?.agentDescription ?? '');
  const [whenToSend, setWhenToSend]     = useState(initial?.whenToSend ?? '');
  const [saving, setSaving]             = useState(false);
  const [err, setErr]                   = useState('');

  const sorted = [...templates].sort((a, b) => (a.status === 'APPROVED' ? -1 : 1) - (b.status === 'APPROVED' ? -1 : 1));
  const selected = templates.find(t => t.name === templateName) || null;
  const spec = selected ? specFromTemplate(selected) : null;

  const urlButtons = (selected?.components.find(c => c.type === 'BUTTONS')?.buttons ?? [])
    .filter(b => b.type === 'URL' && b.url?.includes('{{1}}'));

  const onPick = (tn: string) => {
    setTemplateName(tn);
    const t = templates.find(x => x.name === tn);
    const s = t ? specFromTemplate(t) : null;
    setCfg({
      bodyParams:       Array.from({ length: s?.bodyParams ?? 0 }, () => ''),
      headerParam:      '',
      headerMediaUrl:   '',
      headerMediaType:  s?.headerFormat && s.headerFormat !== 'TEXT' ? (s.headerFormat.toLowerCase() as 'image' | 'video' | 'document') : undefined,
      buttonParams:     [],
      thumbnailProductRetailerId: '',
      mpmSections:      s?.isMPM ? [{ title: 'Section 1', productIds: '' }] : undefined,
      isMPM:            s?.isMPM,
      isCatalog:        s?.isCatalog,
    });
  };

  const setBody    = (i: number, v: string) => setCfg(c => ({ ...c, bodyParams: (c.bodyParams ?? []).map((x, idx) => idx === i ? v : x) }));
  const setBtn     = (i: number, v: string) => setCfg(c => { const arr = [...(c.buttonParams ?? [])]; arr[i] = v; return { ...c, buttonParams: arr }; });
  const setSection = (i: number, patch: Partial<{ title: string; productIds: string }>) =>
    setCfg(c => ({ ...c, mpmSections: (c.mpmSections ?? []).map((s, idx) => idx === i ? { ...s, ...patch } : s) }));
  const addSection = () => setCfg(c => ({ ...c, mpmSections: [...(c.mpmSections ?? []), { title: `Section ${(c.mpmSections?.length ?? 0) + 1}`, productIds: '' }] }));
  const removeSection = (i: number) => setCfg(c => ({ ...c, mpmSections: (c.mpmSections ?? []).filter((_, idx) => idx !== i) }));

  const preview = selected ? renderTemplateMessage(selected, cfg) : '';

  const save = async () => {
    if (!name.trim())          { setErr('Give this message a name'); return; }
    if (!selected || !spec)    { setErr('Pick a template'); return; }
    if (spec.bodyParams > 0 && (cfg.bodyParams ?? []).some(x => !x.trim()))             { setErr('Fill all body variables'); return; }
    if (spec.headerTextParams > 0 && !cfg.headerParam?.trim())                          { setErr('Fill the header text'); return; }
    if (spec.needsHeaderMedia && !cfg.headerMediaUrl?.trim())                           { setErr('Add the header media URL'); return; }
    if (spec.isMPM && (!cfg.thumbnailProductRetailerId?.trim() || !(cfg.mpmSections ?? []).some(m => m.productIds.trim()))) { setErr('Add a thumbnail and at least one product'); return; }
    if (spec.isCatalog && !cfg.thumbnailProductRetailerId?.trim())                      { setErr('Add the thumbnail product ID'); return; }

    setErr('');
    setSaving(true);
    const cleanCfg: TemplateMessageConfig = {
      bodyParams: (cfg.bodyParams ?? []).slice(0, spec.bodyParams),
      ...(spec.headerTextParams ? { headerParam: cfg.headerParam } : {}),
      ...(spec.needsHeaderMedia ? { headerMediaUrl: cfg.headerMediaUrl, headerMediaType: cfg.headerMediaType } : {}),
      ...(urlButtons.length ? { buttonParams: (cfg.buttonParams ?? []).slice(0, urlButtons.length) } : {}),
      ...((spec.isMPM || spec.isCatalog) ? { thumbnailProductRetailerId: cfg.thumbnailProductRetailerId } : {}),
      ...(spec.isMPM ? { mpmSections: (cfg.mpmSections ?? []).filter(s => s.productIds.trim()) } : {}),
      isMPM: spec.isMPM, isCatalog: spec.isCatalog,
    };
    const payload = {
      name: name.trim(),
      templateName,
      language: selected.language || 'en',
      config: cleanCfg,
      preview: renderTemplateMessage(selected, cleanCfg),
      agentDescription: agentDescription.trim(),
      whenToSend: whenToSend.trim(),
    };
    const url = initial ? `/api/template-messages/${initial.id}` : '/api/template-messages';
    const res = await fetch(url, {
      method: initial ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else setErr((await res.json().catch(() => ({})))?.error || 'Save failed');
  };

  const sectionCount = cfg.mpmSections?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-linear-to-r from-wp-dark to-wp-teal shrink-0">
          <div>
            <p className="text-xs text-white/70 uppercase tracking-wide font-medium">{initial ? 'Edit Message' : 'New Message'}</p>
            <h2 className="text-base font-semibold text-white">Compose a template message</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
            <X size={18} className="text-white" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Name */}
          <div>
            <p className={`${sectionLabel} mb-2`}>Message name</p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Diwali offer — silk sarees" className={inputCls} />
          </div>

          {/* Agent guidance — helps Riya pick the right template (names don't match content) */}
          <div className="rounded-xl border border-purple-300/40 dark:border-purple-400/20 bg-purple-50/60 dark:bg-purple-500/5 p-3 space-y-3">
            <p className="text-[11px] text-purple-700 dark:text-purple-300/80 leading-relaxed">
              These help the AI agent know what this template is and when to use it — the template name alone often doesn't say.
            </p>
            <div>
              <label className={labelCls}>Agent description — what is this template?</label>
              <textarea value={agentDescription} onChange={e => setAgentDescription(e.target.value)} rows={2}
                placeholder="e.g. Showcase of our Cotton Sarees — product list with prices for the Cotton category"
                className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className={labelCls}>When should the agent send it?</label>
              <textarea value={whenToSend} onChange={e => setWhenToSend(e.target.value)} rows={2}
                placeholder="e.g. When the customer picks the Cotton category or asks to see cotton sarees"
                className={`${inputCls} resize-none`} />
            </div>
          </div>

          {/* Template picker */}
          <div>
            <p className={`${sectionLabel} mb-2`}>Template</p>
            <select value={templateName} onChange={e => onPick(e.target.value)} className={inputCls}>
              <option value="">Select a template…</option>
              {sorted.map(t => (
                <option key={t.id} value={t.name} disabled={t.status !== 'APPROVED'}>
                  {t.name.replace(/_/g, ' ')}{t.status !== 'APPROVED' ? ` (${t.status.toLowerCase()})` : ''}
                </option>
              ))}
            </select>
            {selected && selected.status !== 'APPROVED' && (
              <p className="text-amber-500 text-[11px] mt-1">This template isn&apos;t approved yet — WhatsApp may reject it when sent.</p>
            )}
          </div>

          {/* Live preview */}
          {selected && (
            <div>
              <p className={`${sectionLabel} mb-2`}>Preview</p>
              <div className="bg-[#e8f5e9] dark:bg-[#0d2a1a] rounded-xl p-3">
                <div className="bg-white dark:bg-[#1f2c34] rounded-xl shadow-sm p-3">
                  <p className="text-[12px] text-[#111b21] dark:text-[#e9edef] leading-relaxed whitespace-pre-wrap">
                    {preview || 'Fill the parameters below to see the message.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Parameters */}
          {spec && (
            <div className="space-y-4">
              {spec.bodyParams === 0 && spec.headerTextParams === 0 && !spec.needsHeaderMedia && !spec.isMPM && !spec.isCatalog && urlButtons.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-[#667781]">This template needs no parameters — just name and save it.</p>
              )}

              {/* Header text */}
              {spec.headerTextParams > 0 && (
                <div>
                  <p className={`${sectionLabel} mb-2`}>Header</p>
                  <input value={cfg.headerParam ?? ''} onChange={e => setCfg(c => ({ ...c, headerParam: e.target.value }))} placeholder="Header text {{1}}" className={inputCls} />
                </div>
              )}

              {/* Header media */}
              {spec.needsHeaderMedia && (
                <div>
                  <p className={`${sectionLabel} mb-2`}>Header {(spec.headerFormat ?? 'media').toLowerCase()}</p>
                  <input value={cfg.headerMediaUrl ?? ''} onChange={e => setCfg(c => ({ ...c, headerMediaUrl: e.target.value }))} placeholder="https://… media URL" className={inputCls} />
                </div>
              )}

              {/* Body variables */}
              {spec.bodyParams > 0 && (
                <div className="space-y-3">
                  <p className={sectionLabel}>Message variables</p>
                  {Array.from({ length: spec.bodyParams }).map((_, i) => (
                    <div key={i}>
                      <label className={labelCls}>Variable {`{{${i + 1}}}`}</label>
                      <input value={cfg.bodyParams?.[i] ?? ''} onChange={e => setBody(i, e.target.value)} placeholder={`Value for {{${i + 1}}}`} className={inputCls} />
                    </div>
                  ))}
                </div>
              )}

              {/* URL button suffixes */}
              {urlButtons.length > 0 && (
                <div className="space-y-3">
                  <p className={sectionLabel}>Button link values</p>
                  {urlButtons.map((b, i) => (
                    <div key={i}>
                      <label className={labelCls}>{b.text} — URL suffix {`{{1}}`}</label>
                      <input value={cfg.buttonParams?.[i] ?? ''} onChange={e => setBtn(i, e.target.value)} placeholder="e.g. SUMMER25" className={inputCls} />
                    </div>
                  ))}
                </div>
              )}

              {/* MPM / catalog thumbnail */}
              {(spec.isMPM || spec.isCatalog) && (
                <div>
                  <p className={`${sectionLabel} mb-2`}>Thumbnail product</p>
                  <p className="text-[10px] text-gray-400 dark:text-[#667781] mb-2">The product shown in the message preview thumbnail.</p>
                  <input value={cfg.thumbnailProductRetailerId ?? ''} onChange={e => setCfg(c => ({ ...c, thumbnailProductRetailerId: e.target.value }))} placeholder="Content ID (e.g. cp1jy4995r)" className={`${inputCls} font-mono`} />
                </div>
              )}

              {/* MPM sections */}
              {spec.isMPM && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ShoppingBag size={14} className="text-wp-dark dark:text-wp-green" />
                    <p className={sectionLabel}>Product sections</p>
                  </div>
                  {(cfg.mpmSections ?? []).map((sec, i) => (
                    <div key={i} className="border border-gray-200 dark:border-[#2a3942] rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-[#1f2c34] border-b border-gray-200 dark:border-[#2a3942]">
                        <div className="flex-1 flex flex-col gap-0.5">
                          <span className="text-[9px] text-gray-400 dark:text-[#667781] uppercase tracking-wide font-semibold leading-none">Subheading</span>
                          <input
                            value={sec.title}
                            onChange={e => setSection(i, { title: e.target.value })}
                            placeholder="e.g. Silk Sarees, Bestsellers… (required)"
                            className="text-sm font-medium bg-transparent outline-none w-full text-[#111b21] dark:text-[#e9edef] placeholder-gray-400 dark:placeholder-[#667781]"
                          />
                        </div>
                        {sectionCount > 1 && (
                          <button onClick={() => removeSection(i)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      <div className="p-3 dark:bg-[#111b21]">
                        <label className={labelCls}>Product IDs (comma separated)</label>
                        <input
                          value={sec.productIds}
                          onChange={e => setSection(i, { productIds: e.target.value })}
                          placeholder="cp1jy4995r, ab2kx882, …"
                          className={`${inputCls} font-mono text-xs`}
                        />
                        <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-1">
                          {sec.productIds ? sec.productIds.split(',').filter(s => s.trim()).length : 0} product(s) · max 30 total across all sections
                        </p>
                      </div>
                    </div>
                  ))}
                  {sectionCount < MAX_SECTIONS && (
                    <button onClick={addSection} className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-200 dark:border-[#2a3942] rounded-xl text-xs text-gray-500 dark:text-[#8696a0] hover:border-wp-green hover:text-wp-dark dark:hover:text-wp-green transition-colors">
                      <Plus size={13} /> Add another section
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {err && <p className="text-red-500 text-[12px]">{err}</p>}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-[#2a3942] px-5 py-4 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-500 dark:text-[#8696a0] hover:bg-gray-100 dark:hover:bg-[#1f2c34] transition-colors">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !name.trim() || !templateName}
            className="flex items-center gap-2 bg-wp-green hover:bg-[#22c55e] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2 rounded-xl transition-colors text-sm"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Save message'}
          </button>
        </div>
      </div>
    </div>
  );
}
