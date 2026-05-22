'use client';
import { useState } from 'react';
import { useAppSelector } from '@/hooks/redux';
import { Template } from '@/types';
import { X, Search, CheckCircle2, Layers } from 'lucide-react';

interface MPMSectionDraft {
  title: string;
  product_retailer_ids: string;
}

interface TemplateModalProps {
  onClose: () => void;
  onSelect: (template: Template, variables: Record<string, string>, mpmData?: {
    isMPMTemplate: boolean;
    thumbnailProductRetailerId: string;
    mpmSections: MPMSectionDraft[];
  }) => void;
}

export default function TemplateModal({ onClose, onSelect }: TemplateModalProps) {
  const templates = useAppSelector((s) => s.templates.templates);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Template | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [thumbnailProductId, setThumbnailProductId] = useState('');
  const [mpmSections, setMpmSections] = useState<MPMSectionDraft[]>([{ title: '', product_retailer_ids: '' }]);

  const filtered = templates.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === 'ALL' || t.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const bodyComponent = selected?.components.find((c) => c.type === 'BODY');
  const headerComponent = selected?.components.find((c) => c.type === 'HEADER' && c.format === 'TEXT');
  const footerComponent = selected?.components.find((c) => c.type === 'FOOTER');
  const buttonsComponent = selected?.components.find((c) => c.type === 'BUTTONS');
  const isMPMTemplate = !!selected?.components.some(
    (c) => c.type === 'BUTTONS' && (c as any).buttons?.some((b: any) => b.type?.toUpperCase() === 'MPM')
  );
  const canSend = !!selected;
  const hasMPMData = isMPMTemplate &&
    thumbnailProductId.trim().length > 0 &&
    mpmSections.some((s) => s.title.trim() && s.product_retailer_ids.trim());

  const getVariablePlaceholders = (text: string) => {
    const matches = text.match(/\{\{(\d+)\}\}/g) || [];
    return [...new Set(matches)];
  };

  const allPlaceholders = [
    ...(headerComponent?.text ? getVariablePlaceholders(headerComponent.text) : []),
    ...(bodyComponent?.text ? getVariablePlaceholders(bodyComponent.text) : []),
  ];

  const fillVariables = (text: string) =>
    text.replace(/\{\{(\d+)\}\}/g, (_, n) => variables[`{{${n}}}`] || `{{${n}}}`);

  const categoryColors: Record<string, string> = {
    MARKETING: 'bg-purple-100 text-purple-700',
    UTILITY: 'bg-blue-100 text-blue-700',
    AUTHENTICATION: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#2a3942] bg-gradient-to-r from-[#075E54] to-[#128C7E]">
          <div className="flex items-center gap-2">
            <Layers size={20} className="text-white" />
            <h2 className="text-lg font-semibold text-white">Message Templates</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
            <X size={18} className="text-white" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Template List */}
          <div className="w-1/2 border-r border-gray-100 dark:border-[#2a3942] flex flex-col">
            <div className="p-3 space-y-2 border-b border-gray-100 dark:border-[#2a3942]">
              <div className="flex items-center bg-gray-50 dark:bg-[#2a3942] rounded-lg px-3 gap-2 border border-gray-200 dark:border-[#3a4a52]">
                <Search size={14} className="text-gray-400 dark:text-[#667781]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="flex-1 py-2 text-sm bg-transparent outline-none text-gray-700 dark:text-[#e9edef] placeholder:text-gray-400 dark:placeholder:text-[#667781]"
                />
              </div>
              <div className="flex gap-1">
                {['ALL', 'MARKETING', 'UTILITY', 'AUTHENTICATION'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`text-[10px] px-2 py-1 rounded-full font-medium transition-colors ${
                      categoryFilter === cat ? 'bg-[#075E54] text-white' : 'bg-gray-100 dark:bg-[#2a3942] text-gray-600 dark:text-[#8696a0] hover:bg-gray-200 dark:hover:bg-[#3a4a52]'
                    }`}
                  >
                    {cat === 'ALL' ? 'All' : cat.charAt(0) + cat.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  onClick={() => { setSelected(t); setVariables({}); setThumbnailProductId(''); setMpmSections([{ title: '', product_retailer_ids: '' }]); }}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2a3942] transition-colors border-b border-gray-50 dark:border-[#2a3942] ${
                    selected?.id === t.id ? 'bg-[#f0f9ff] dark:bg-[#1a3a2a] border-l-2 border-l-[#25D366]' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-[#111b21] dark:text-[#e9edef] truncate">{t.name.replace(/_/g, ' ')}</span>
                      {selected?.id === t.id && <CheckCircle2 size={14} className="text-[#25D366] flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${categoryColors[t.category]}`}>
                        {t.category.toLowerCase()}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-[#667781]">• {t.language}</span>
                      <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                        t.status === 'APPROVED' ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {t.status.toLowerCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview + Variables */}
          <div className="w-1/2 flex flex-col">
            {selected ? (
              <>
                <div className="p-4 flex-1 overflow-y-auto">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-[#8696a0] mb-3">Preview</h3>
                  {/* Phone mockup */}
                  <div className="bg-[#e8f5e9] dark:bg-[#0d2a1a] rounded-xl p-3 mb-4 min-h-[120px]">
                    <div className="bg-white dark:bg-[#1f2c34] rounded-xl shadow-sm p-3 max-w-[220px] ml-auto">
                      {headerComponent?.text && (
                        <p className="text-sm font-bold text-[#111b21] dark:text-[#e9edef] mb-1">{fillVariables(headerComponent.text)}</p>
                      )}
                      {bodyComponent?.text && (
                        <p className="text-xs text-[#111b21] dark:text-[#e9edef] leading-relaxed mb-1">{fillVariables(bodyComponent.text)}</p>
                      )}
                      {footerComponent?.text && (
                        <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-1 border-t border-gray-100 dark:border-[#2a3942] pt-1">{footerComponent.text}</p>
                      )}
                    </div>
                    {buttonsComponent?.buttons && (
                      <div className="mt-2 space-y-1">
                        {buttonsComponent.buttons.map((btn, i) => (
                          <div key={i} className="bg-white dark:bg-[#1f2c34] rounded-lg py-1.5 text-center text-xs text-[#00a5f4] font-medium shadow-sm">
                            {btn.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Variable inputs */}
                  {allPlaceholders.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-[#8696a0] mb-2">Fill Variables</h3>
                      <div className="space-y-2">
                        {allPlaceholders.map((placeholder) => (
                          <div key={placeholder}>
                            <label className="text-xs text-gray-500 dark:text-[#8696a0] mb-1 block">Variable {placeholder}</label>
                            <input
                              value={variables[placeholder] || ''}
                              onChange={(e) => setVariables({ ...variables, [placeholder]: e.target.value })}
                              placeholder={`Enter value for ${placeholder}`}
                              className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#25D366] transition-colors"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* MPM fields */}
                  {isMPMTemplate && (
                    <div className="mt-4 space-y-3">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-[#8696a0]">Catalog Configuration</h3>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-[#8696a0] mb-1 block">Thumbnail Product Retailer ID *</label>
                        <input
                          value={thumbnailProductId}
                          onChange={(e) => setThumbnailProductId(e.target.value)}
                          placeholder="e.g. SKU-001"
                          className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#25D366] transition-colors"
                        />
                      </div>
                      {mpmSections.map((section, idx) => (
                        <div key={idx} className="border border-gray-200 dark:border-[#2a3942] rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-600 dark:text-[#8696a0]">Section {idx + 1}</span>
                            {mpmSections.length > 1 && (
                              <button
                                onClick={() => setMpmSections(mpmSections.filter((_, i) => i !== idx))}
                                className="text-xs text-red-400 hover:text-red-600"
                              >Remove</button>
                            )}
                          </div>
                          <input
                            value={section.title}
                            onChange={(e) => setMpmSections(mpmSections.map((s, i) => i === idx ? { ...s, title: e.target.value } : s))}
                            placeholder="Section title"
                            className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#25D366] transition-colors"
                          />
                          <input
                            value={section.product_retailer_ids}
                            onChange={(e) => setMpmSections(mpmSections.map((s, i) => i === idx ? { ...s, product_retailer_ids: e.target.value } : s))}
                            placeholder="Product IDs (comma separated)"
                            className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#25D366] transition-colors"
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => setMpmSections([...mpmSections, { title: '', product_retailer_ids: '' }])}
                        className="text-xs text-[#25D366] hover:text-[#22c55e] font-medium"
                      >+ Add Section</button>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100 dark:border-[#2a3942] p-4">
                  <button
                    onClick={() => onSelect(selected, variables, hasMPMData ? { isMPMTemplate: true, thumbnailProductRetailerId: thumbnailProductId, mpmSections } : undefined)}
                    disabled={!canSend}
                    className="w-full bg-[#25D366] hover:bg-[#22c55e] text-white font-semibold py-2.5 rounded-xl transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send Template
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-[#667781] p-8">
                <Layers size={40} className="mb-3 opacity-40" />
                <p className="text-sm font-medium">Select a template</p>
                <p className="text-xs text-center mt-1">Choose a template from the list to preview and send it</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
