'use client';
import { useState, useCallback } from 'react';
import {
  X, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle,
  Image as ImageIcon, FileText, Video, FileIcon, Type,
  Plus, Trash2, MessageSquare, ShoppingBag, Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2;
type Category = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
type TemplateType = 'default' | 'mpm';
type HeaderFormat = 'NONE' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT';

interface QRButton  { type: 'QUICK_REPLY';   text: string }
interface UrlButton { type: 'URL';            text: string; url: string; urlExample: string }
interface PhButton  { type: 'PHONE_NUMBER';   text: string; phone: string }
type DraftButton = QRButton | UrlButton | PhButton;

interface Form {
  name: string;
  language: string;
  category: Category;
  templateType: TemplateType;
  headerFormat: HeaderFormat;
  headerText: string;
  headerTextIsVar: boolean;
  bodyText: string;
  bodyExamples: string[];
  footerText: string;
  buttons: DraftButton[];
  mpmButtonText: string;
}

const INITIAL: Form = {
  name: '',
  language: 'en',
  category: 'MARKETING',
  templateType: 'default',
  headerFormat: 'NONE',
  headerText: '',
  headerTextIsVar: false,
  bodyText: '',
  bodyExamples: [],
  footerText: '',
  buttons: [],
  mpmButtonText: 'View items',
};

const LANGUAGES = [
  { code: 'en',    label: 'English' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'hi',    label: 'Hindi' },
  { code: 'ta',    label: 'Tamil' },
  { code: 'te',    label: 'Telugu' },
  { code: 'mr',    label: 'Marathi' },
  { code: 'bn',    label: 'Bengali' },
  { code: 'gu',    label: 'Gujarati' },
  { code: 'kn',    label: 'Kannada' },
  { code: 'ml',    label: 'Malayalam' },
];

// Extract {{n}} variable placeholders from text
function extractVars(text: string): string[] {
  return [...new Set(text.match(/\{\{(\d+)\}\}/g) || [])].sort();
}

// ─── Step 1: Setup ────────────────────────────────────────────────────────────

function StepSetup({ form, set }: { form: Form; set: (p: Partial<Form>) => void }) {
  const types: { id: TemplateType; icon: any; label: string; desc: string }[] = [
    {
      id: 'default',
      icon: MessageSquare,
      label: 'Default',
      desc: 'Send messages with media and customised buttons to engage customers',
    },
    {
      id: 'mpm',
      icon: ShoppingBag,
      label: 'Catalog / MPM',
      desc: 'Send up to 30 catalog products organised in sections in a single message',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Name */}
      <div>
        <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">
          Template Name <span className="text-red-400">*</span>
        </label>
        <input
          value={form.name}
          onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
          placeholder="e.g. new_arrivals_mpm"
          className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors font-mono"
        />
        <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-1">Lowercase letters, numbers and underscores only</p>
      </div>

      {/* Language + Category row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">Language</label>
          <select
            value={form.language}
            onChange={(e) => set({ language: e.target.value })}
            className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors bg-white"
          >
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">Category</label>
          <select
            value={form.category}
            onChange={(e) => set({ category: e.target.value as Category })}
            className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors bg-white"
          >
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utility</option>
            <option value="AUTHENTICATION">Authentication</option>
          </select>
        </div>
      </div>

      {/* Template Type */}
      <div>
        <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-2">Template Type</label>
        <div className="space-y-2">
          {types.map(({ id, icon: Icon, label, desc }) => (
            <button
              key={id}
              onClick={() => set({ templateType: id })}
              className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                form.templateType === id
                  ? 'border-wp-green bg-[#e8f5e9] dark:bg-[#1a3a2a]'
                  : 'border-gray-200 dark:border-[#2a3942] hover:border-gray-300 dark:hover:border-[#3a4a52] bg-white dark:bg-[#1f2c34]'
              }`}
            >
              <div className={`mt-0.5 p-2 rounded-lg ${form.templateType === id ? 'bg-wp-green/10' : 'bg-gray-100 dark:bg-[#2a3942]'}`}>
                <Icon size={16} className={form.templateType === id ? 'text-wp-dark' : 'text-gray-500 dark:text-[#8696a0]'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${form.templateType === id ? 'text-wp-dark' : 'text-[#111b21] dark:text-[#e9edef]'}`}>{label}</span>
                  {id === 'mpm' && (
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">Multi-Product</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-[#8696a0] mt-0.5">{desc}</p>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
                form.templateType === id ? 'border-wp-green bg-wp-green' : 'border-gray-300'
              }`}>
                {form.templateType === id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Edit ─────────────────────────────────────────────────────────────

function StepEdit({ form, set }: { form: Form; set: (p: Partial<Form>) => void }) {
  const bodyVars   = extractVars(form.bodyText);
  const headerFmts: { id: HeaderFormat; icon: any; label: string }[] = [
    { id: 'NONE',     icon: X,         label: 'None' },
    { id: 'IMAGE',    icon: ImageIcon, label: 'Image' },
    { id: 'VIDEO',    icon: Video,     label: 'Video' },
    { id: 'DOCUMENT', icon: FileIcon,  label: 'Document' },
    { id: 'TEXT',     icon: Type,      label: 'Text' },
  ];

  // Sync example slots with variable count
  function handleBodyChange(text: string) {
    const vars = extractVars(text);
    const next = vars.map((_, i) => form.bodyExamples[i] || '');
    set({ bodyText: text, bodyExamples: next });
  }

  function addButton(type: DraftButton['type']) {
    if (form.buttons.length >= 3) return;
    const btn: DraftButton =
      type === 'QUICK_REPLY'   ? { type, text: '' } :
      type === 'URL'           ? { type, text: '', url: '', urlExample: '' } :
                                 { type, text: '', phone: '' };
    set({ buttons: [...form.buttons, btn] });
  }

  function updateButton(i: number, patch: Partial<DraftButton>) {
    const next = [...form.buttons];
    next[i] = { ...next[i], ...patch } as DraftButton;
    set({ buttons: next });
  }

  function removeButton(i: number) {
    set({ buttons: form.buttons.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-2">Header <span className="text-gray-400 font-normal">(optional)</span></label>
        <div className="flex gap-2 flex-wrap">
          {headerFmts.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => set({ headerFormat: id, headerText: '', headerTextIsVar: false })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                form.headerFormat === id
                  ? 'border-wp-green bg-[#e8f5e9] dark:bg-[#1a3a2a] text-wp-dark'
                  : 'border-gray-200 dark:border-[#2a3942] text-gray-600 dark:text-[#8696a0] hover:border-gray-300 dark:hover:border-[#3a4a52]'
              }`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {form.headerFormat === 'TEXT' && (
          <div className="mt-3 space-y-2">
            <input
              value={form.headerText}
              onChange={(e) => set({ headerText: e.target.value })}
              placeholder='Header text (use {{1}} for a variable)'
              className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors"
            />
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={form.headerTextIsVar}
                onChange={(e) => set({ headerTextIsVar: e.target.checked, headerText: e.target.checked ? '{{1}}' : '' })}
                className="rounded"
              />
              Make heading dynamic (use variable <code className="bg-gray-100 dark:bg-[#2a3942] dark:text-[#e9edef] px-1 rounded">{'{{1}}'}</code>)
            </label>
          </div>
        )}

        {(form.headerFormat === 'IMAGE' || form.headerFormat === 'VIDEO' || form.headerFormat === 'DOCUMENT') && (
          <p className="mt-2 text-[11px] text-gray-400 dark:text-[#8696a0] bg-gray-50 dark:bg-[#1f2c34] rounded-lg px-3 py-2">
            {form.headerFormat === 'IMAGE' ? '📷' : form.headerFormat === 'VIDEO' ? '🎬' : '📄'} Media URL will be provided when sending the template
          </p>
        )}
      </div>

      {/* Body */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide">Body Text <span className="text-red-400">*</span></label>
          <span className="text-[10px] text-gray-400 dark:text-[#667781]">{form.bodyText.length}/1024</span>
        </div>
        <textarea
          value={form.bodyText}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder={'Write your message. Use {{1}}, {{2}} for dynamic values.\ne.g. Hello {{1}}, check out our latest collection!'}
          rows={4}
          maxLength={1024}
          className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors resize-none"
        />
        <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-1">
          Use <code className="bg-gray-100 dark:bg-[#2a3942] dark:text-[#e9edef] px-1 rounded">{'{{1}}'}</code> <code className="bg-gray-100 dark:bg-[#2a3942] dark:text-[#e9edef] px-1 rounded">{'{{2}}'}</code> for personalised values
        </p>

        {/* Body variable examples */}
        {bodyVars.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-500 dark:text-[#8696a0] font-medium">Sample values for review (required by Meta)</p>
            {bodyVars.map((v, i) => (
              <div key={v} className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 dark:text-[#667781] w-8 shrink-0 font-mono">{v}</span>
                <input
                  value={form.bodyExamples[i] || ''}
                  onChange={(e) => {
                    const next = [...form.bodyExamples];
                    next[i] = e.target.value;
                    set({ bodyExamples: next });
                  }}
                  placeholder={`Example for ${v}`}
                  className="flex-1 border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-wp-green transition-colors"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer — default only */}
      {form.templateType === 'default' && (
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">Footer <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            value={form.footerText}
            onChange={(e) => set({ footerText: e.target.value })}
            placeholder="e.g. Reply STOP to unsubscribe"
            maxLength={60}
            className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors"
          />
        </div>
      )}

      {/* MPM button text */}
      {form.templateType === 'mpm' && (
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide block mb-1.5">
            View Catalog Button Text
          </label>
          <input
            value={form.mpmButtonText}
            onChange={(e) => set({ mpmButtonText: e.target.value })}
            placeholder="View items"
            maxLength={20}
            className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-wp-green transition-colors"
          />
          <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-1">
            This opens the product catalog. Sections &amp; products are added when sending.
          </p>
        </div>
      )}

      {/* Buttons — default only */}
      {form.templateType === 'default' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide">Buttons <span className="text-gray-400 dark:text-[#667781] font-normal">(optional, max 3)</span></label>
          </div>

          <div className="space-y-2">
            {form.buttons.map((btn, i) => (
              <div key={i} className="border border-gray-200 dark:border-[#2a3942] dark:bg-[#111b21] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    btn.type === 'QUICK_REPLY'   ? 'bg-green-100 text-green-700' :
                    btn.type === 'URL'           ? 'bg-blue-100 text-blue-700' :
                                                   'bg-orange-100 text-orange-700'
                  }`}>{btn.type.replace('_', ' ')}</span>
                  <button onClick={() => removeButton(i)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
                <input
                  value={btn.text}
                  onChange={(e) => updateButton(i, { text: e.target.value })}
                  placeholder="Button label"
                  maxLength={25}
                  className="w-full border border-gray-100 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-wp-green transition-colors"
                />
                {btn.type === 'URL' && (
                  <>
                    <input
                      value={(btn as UrlButton).url}
                      onChange={(e) => updateButton(i, { url: e.target.value } as any)}
                      placeholder="https://yoursite.com/{{1}}"
                      className="w-full border border-gray-100 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-wp-green transition-colors font-mono"
                    />
                    {(btn as UrlButton).url.includes('{{1}}') && (
                      <input
                        value={(btn as UrlButton).urlExample}
                        onChange={(e) => updateButton(i, { urlExample: e.target.value } as any)}
                        placeholder="Example URL suffix for review"
                        className="w-full border border-gray-100 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-wp-green transition-colors"
                      />
                    )}
                  </>
                )}
                {btn.type === 'PHONE_NUMBER' && (
                  <input
                    value={(btn as PhButton).phone}
                    onChange={(e) => updateButton(i, { phone: e.target.value } as any)}
                    placeholder="+91 98765 43210"
                    className="w-full border border-gray-100 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-wp-green transition-colors"
                  />
                )}
              </div>
            ))}
          </div>

          {form.buttons.length < 3 && (
            <div className="flex gap-2 mt-2">
              {(['QUICK_REPLY', 'URL', 'PHONE_NUMBER'] as DraftButton['type'][]).map((t) => (
                <button
                  key={t}
                  onClick={() => addButton(t)}
                  className="flex items-center gap-1 text-xs text-gray-500 dark:text-[#8696a0] hover:text-wp-dark border border-dashed border-gray-300 dark:border-[#2a3942] hover:border-wp-green dark:hover:border-wp-green rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  <Plus size={10} /> {t === 'QUICK_REPLY' ? 'Quick Reply' : t === 'URL' ? 'URL' : 'Phone'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Preview ──────────────────────────────────────────────────────────

function PreviewBubble({ form }: { form: Form }) {
  const fill = (text: string) =>
    text.replace(/\{\{(\d+)\}\}/g, (_, n) => form.bodyExamples[parseInt(n, 10) - 1] || `{{${n}}}`);

  const headerIconMap: Record<string, string> = { IMAGE: '🖼️ Image', VIDEO: '🎬 Video', DOCUMENT: '📄 Document' };

  return (
    <div className="bg-[#e8f5e9] dark:bg-[#0d2a1a] rounded-2xl p-4">
      <p className="text-[10px] text-gray-500 dark:text-[#8696a0] font-medium uppercase tracking-wide mb-3 text-center">WhatsApp Preview</p>
      <div className="bg-white dark:bg-[#1f2c34] rounded-2xl shadow-md max-w-64 mx-auto overflow-hidden">
        {/* Header */}
        {form.headerFormat !== 'NONE' && (
          <div className={`${form.headerFormat === 'TEXT' ? 'px-3 pt-3' : ''}`}>
            {form.headerFormat === 'TEXT' ? (
              <p className="font-bold text-sm text-[#111b21] dark:text-[#e9edef]">
                {form.headerTextIsVar ? (form.bodyExamples[0] || 'Header Text') : (form.headerText || 'Header Text')}
              </p>
            ) : (
              <div className="h-28 bg-gray-100 dark:bg-[#2a3942] flex items-center justify-center text-gray-400 dark:text-[#667781] text-sm">
                {headerIconMap[form.headerFormat] || form.headerFormat}
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="px-3 py-2">
          <p className="text-[12px] text-[#111b21] dark:text-[#e9edef] leading-relaxed whitespace-pre-wrap">
            {fill(form.bodyText) || <span className="text-gray-400 dark:text-[#667781] italic">Your message body…</span>}
          </p>
          {form.footerText && (
            <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-1.5 border-t border-gray-100 dark:border-[#2a3942] pt-1.5">{form.footerText}</p>
          )}
          <p className="text-[10px] text-gray-400 dark:text-[#667781] text-right mt-1">11:59 ✓✓</p>
        </div>

        {/* Buttons */}
        {form.templateType === 'mpm' ? (
          <div className="border-t border-gray-100 dark:border-[#2a3942] px-3 py-2 text-center text-xs text-[#00a5f4] font-medium flex items-center justify-center gap-1">
            <ShoppingBag size={12} /> {form.mpmButtonText || 'View items'}
          </div>
        ) : form.buttons.length > 0 ? (
          <div className="border-t border-gray-100 dark:border-[#2a3942] divide-y divide-gray-100 dark:divide-[#2a3942]">
            {form.buttons.map((btn, i) => (
              <div key={i} className="px-3 py-1.5 text-center text-xs text-[#00a5f4] font-medium">{btn.text || 'Button'}</div>
            ))}
          </div>
        ) : null}
      </div>

      {/* MPM sections note */}
      {form.templateType === 'mpm' && (
        <div className="mt-3 bg-white/70 dark:bg-[#1f2c34]/70 rounded-xl p-3 text-[10px] text-gray-500 dark:text-[#8696a0] space-y-1.5">
          <p className="font-semibold text-gray-600 dark:text-[#8696a0]">When sending, you'll define:</p>
          <div className="space-y-1 pl-2">
            <p>📌 <span className="font-medium">Section subheadings</span> — e.g. "New Arrivals", "Bestsellers"</p>
            <p>🛍️ <span className="font-medium">Product Content IDs</span> — up to 30 products across 10 sections</p>
            <p>🖼️ <span className="font-medium">Thumbnail product</span> — shown in the message preview</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Build components payload ─────────────────────────────────────────────────

function buildComponents(form: Form): object[] {
  const comps: object[] = [];

  // HEADER
  if (form.headerFormat !== 'NONE') {
    if (form.headerFormat === 'TEXT') {
      const comp: Record<string, any> = { type: 'HEADER', format: 'TEXT', text: form.headerText || '{{1}}' };
      if (form.headerTextIsVar) comp.example = { header_text: [form.bodyExamples[0] || 'Example'] };
      comps.push(comp);
    } else {
      comps.push({ type: 'HEADER', format: form.headerFormat });
    }
  }

  // BODY
  const bodyComp: Record<string, any> = { type: 'BODY', text: form.bodyText };
  const bodyVars = extractVars(form.bodyText);
  if (bodyVars.length > 0) {
    bodyComp.example = { body_text: [bodyVars.map((_, i) => form.bodyExamples[i] || `example${i + 1}`)] };
  }
  comps.push(bodyComp);

  // FOOTER
  if (form.footerText.trim()) {
    comps.push({ type: 'FOOTER', text: form.footerText });
  }

  // BUTTONS
  if (form.templateType === 'mpm') {
    comps.push({
      type: 'BUTTONS',
      buttons: [{ type: 'MPM', text: form.mpmButtonText || 'View items' }],
    });
  } else if (form.buttons.length > 0) {
    comps.push({
      type: 'BUTTONS',
      buttons: form.buttons.map((btn) => {
        if (btn.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: btn.text };
        if (btn.type === 'URL') {
          const b: Record<string, any> = { type: 'URL', text: btn.text, url: btn.url };
          if (btn.url.includes('{{1}}') && btn.urlExample) b.example = [btn.urlExample];
          return b;
        }
        return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phone };
      }),
    });
  }

  return comps;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(form: Form, step: Step): string | null {
  if (step === 0) {
    if (!form.name.trim()) return 'Template name is required';
    if (!/^[a-z0-9_]+$/.test(form.name)) return 'Name must be lowercase letters, numbers and underscores';
  }
  if (step === 1) {
    if (!form.bodyText.trim()) return 'Body text is required';
    const vars = extractVars(form.bodyText);
    if (vars.some((_, i) => !form.bodyExamples[i]?.trim())) return 'Fill in all sample values for body variables';
    if (form.templateType === 'mpm' && !form.mpmButtonText.trim()) return 'Button text is required';
  }
  return null;
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

const STEP_LABELS = ['Set up', 'Edit template', 'Submit for review'];

export default function CreateTemplateModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [step,    setStep]    = useState<Step>(0);
  const [form,    setFormRaw] = useState<Form>(INITIAL);
  const [error,   setError]   = useState('');
  const [sending, setSending] = useState(false);
  const [done,    setDone]    = useState(false);

  const set = useCallback((patch: Partial<Form>) => setFormRaw((f) => ({ ...f, ...patch })), []);

  function next() {
    const err = validate(form, step);
    if (err) { setError(err); return; }
    setError('');
    setStep((s) => Math.min(s + 1, 2) as Step);
  }

  function back() {
    setError('');
    setStep((s) => Math.max(s - 1, 0) as Step);
  }

  async function submit() {
    const err = validate(form, 1);
    if (err) { setError(err); return; }
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       form.name,
          language:   form.language,
          category:   form.category,
          components: buildComponents(form),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDone(true);
      onCreated?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden max-h-[92vh]">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#2a3942] shrink-0">
          <h2 className="font-bold text-[#111b21] dark:text-[#e9edef] text-base">Create Message Template</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-[#1f2c34] transition-colors">
            <X size={18} className="text-gray-500 dark:text-[#8696a0]" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-gray-100 dark:border-[#2a3942] shrink-0">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i < step ? 'bg-wp-green text-white' :
                  i === step ? 'bg-wp-dark text-white' :
                  'bg-gray-200 dark:bg-[#2a3942] text-gray-400 dark:text-[#667781]'
                }`}>
                  {i < step ? <CheckCircle2 size={14} /> : i + 1}
                </div>
                <span className={`text-sm font-medium ${i === step ? 'text-wp-dark' : i < step ? 'text-wp-green' : 'text-gray-400 dark:text-[#667781]'}`}>
                  {label}
                </span>
              </div>
              {i < 2 && <ChevronRight size={14} className="text-gray-300 dark:text-[#2a3942] mx-3" />}
            </div>
          ))}
        </div>

        {/* Body — split layout on step 1+2 */}
        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 size={32} className="text-green-500" />
            </div>
            <h3 className="text-lg font-bold text-[#111b21] dark:text-[#e9edef] mb-1">Template submitted!</h3>
            <p className="text-sm text-gray-500 dark:text-[#8696a0] mb-6 max-w-sm">
              <strong>{form.name}</strong> has been submitted to Meta for review. It typically takes a few minutes to a few hours to get approved.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-wp-green text-white text-sm font-semibold rounded-xl hover:bg-[#22c55e] transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className={`flex-1 flex overflow-hidden ${step >= 1 ? 'flex-row' : 'flex-col'}`}>
            {/* Left / main form */}
            <div className="flex-1 overflow-y-auto p-6">
              {step === 0 && <StepSetup form={form} set={set} />}
              {step === 1 && <StepEdit  form={form} set={set} />}
              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-[#8696a0]">
                    Review your template below. Once submitted, Meta will review it — approval usually takes a few minutes.
                  </p>
                  <div className="bg-gray-50 dark:bg-[#1f2c34] rounded-xl p-4 space-y-2 text-sm">
                    <Row label="Name"     value={form.name} />
                    <Row label="Category" value={form.category} />
                    <Row label="Language" value={form.language} />
                    <Row label="Type"     value={form.templateType === 'mpm' ? 'Catalog / Multi-Product Message' : 'Default'} />
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-start gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>

            {/* Right preview panel — visible on step 1 & 2 */}
            {step >= 1 && (
              <div className="w-80 border-l border-gray-100 dark:border-[#2a3942] overflow-y-auto p-5 bg-[#f9fafb] dark:bg-[#0b141a] shrink-0">
                <PreviewBubble form={form} />
              </div>
            )}
          </div>
        )}

        {/* Footer nav */}
        {!done && (
          <div className="border-t border-gray-100 dark:border-[#2a3942] px-6 py-4 flex items-center justify-between shrink-0">
            <button
              onClick={back}
              disabled={step === 0}
              className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 dark:text-[#8696a0] hover:text-gray-900 dark:hover:text-[#e9edef] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={15} /> Back
            </button>

            {step < 2 ? (
              <button
                onClick={next}
                className="flex items-center gap-1.5 px-5 py-2 bg-wp-dark text-white text-sm font-semibold rounded-xl hover:bg-[#064e45] transition-colors"
              >
                Next <ChevronRight size={15} />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={sending}
                className="flex items-center gap-2 px-5 py-2 bg-wp-green text-white text-sm font-semibold rounded-xl hover:bg-[#22c55e] disabled:opacity-50 transition-colors"
              >
                {sending ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Zap size={15} />}
                {sending ? 'Submitting…' : 'Submit for Review'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-400 dark:text-[#667781] text-xs w-20 shrink-0">{label}</span>
      <span className="font-medium text-[#111b21] dark:text-[#e9edef]">{value}</span>
    </div>
  );
}
