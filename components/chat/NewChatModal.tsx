'use client';
import { useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';
import { fetchTemplates } from '@/store/slices/templatesSlice';
import { fetchConversations, selectConversation } from '@/store/slices/conversationsSlice';
import { Template } from '@/types';
import { X, Phone, Layers, CheckCircle2, Send, ChevronDown, AlertCircle, RefreshCw } from 'lucide-react';

function extractPlaceholders(text: string): string[] {
  return [...new Set((text.match(/\{\{(\d+)\}\}/g) || []))].sort();
}

function fillTemplate(text: string, params: Record<string, string>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => params[`{{${n}}}`] || `{{${n}}}`);
}

interface NewChatModalProps {
  onClose: () => void;
}

export default function NewChatModal({ onClose }: NewChatModalProps) {
  const dispatch = useAppDispatch();
  const { templates, loading: templatesLoading } = useAppSelector((s) => s.templates);

  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [params, setParams] = useState<Record<string, string>>({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dispatch(fetchTemplates());
  }, [dispatch]);

  const approvedTemplates = templates.filter((t) => t.status === 'APPROVED');

  const validatePhone = (p: string) => {
    const clean = p.replace(/[\s\-\(\)\+]/g, '');
    if (clean.length < 10 || !/^\d+$/.test(clean)) return 'Enter a valid phone number with country code (e.g. 918448157940)';
    return '';
  };

  const handleSend = async () => {
    const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
    const err = validatePhone(cleanPhone);
    if (err) { setPhoneError(err); return; }
    if (!selectedTemplate) { setError('Please select a template to initiate the conversation'); return; }

    setSending(true);
    setError('');
    try {
      const body = selectedTemplate.components.find((c) => c.type === 'BODY');
      const header = selectedTemplate.components.find((c) => c.type === 'HEADER');
      const isMediaHeader = header && header.format !== 'TEXT' && header.format !== undefined;
      const bodyPlaceholders = body?.text ? extractPlaceholders(body.text) : [];
      const bodyParams = bodyPlaceholders.map((ph) => params[ph] || '');
      const headerPlaceholders = header?.text ? extractPlaceholders(header.text) : [];
      const headerParam = headerPlaceholders.length > 0 ? (params[headerPlaceholders[0]] || '') : '';

      // Use the broadcast endpoint with a single recipient
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Chat with +${cleanPhone}`,
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
          language: selectedTemplate.language,
          bodyParams,
          headerParam,
          headerMediaUrl: isMediaHeader ? headerMediaUrl : '',
          headerMediaType: isMediaHeader ? (header?.format?.toLowerCase() || 'image') : 'image',
          recipients: [cleanPhone],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start conversation');

      // Refresh conversations and open the new one
      await dispatch(fetchConversations());

      // Small delay for DB to settle then try to select the new conversation
      setTimeout(async () => {
        const convsRes = await fetch('/api/conversations');
        const convs = await convsRes.json();
        const newConv = convs.find((c: any) => c.contact.phone === cleanPhone);
        if (newConv) dispatch(selectConversation(newConv.id));
      }, 800);

      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const body = selectedTemplate?.components.find((c) => c.type === 'BODY');
  const header = selectedTemplate?.components.find((c) => c.type === 'HEADER');
  const footer = selectedTemplate?.components.find((c) => c.type === 'FOOTER');
  const buttons = selectedTemplate?.components.find((c) => c.type === 'BUTTONS');
  const isMediaHeader = header && header.format !== 'TEXT' && header.format !== undefined;
  const allPlaceholders = [
    ...(header?.text ? extractPlaceholders(header.text) : []),
    ...(body?.text ? extractPlaceholders(body.text) : []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-[#075E54] to-[#128C7E]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Send size={16} className="text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-base">New Conversation</h2>
              <p className="text-white/70 text-xs">Send a template to start a chat</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
            <X size={16} className="text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Phone number */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-[#8696a0] mb-1.5 flex items-center gap-1.5">
              <Phone size={12} /> Recipient Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
              placeholder="918448157940  (country code + number, no +)"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none font-mono transition-colors dark:text-[#e9edef] dark:placeholder-[#667781] ${
                phoneError ? 'border-red-300 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] focus:border-[#25D366]'
              }`}
            />
            {phoneError && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} />{phoneError}</p>
            )}
            <p className="text-[11px] text-gray-400 dark:text-[#667781] mt-1">
              WhatsApp only allows businesses to initiate conversations via approved templates.
            </p>
          </div>

          {/* Template selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-[#8696a0] mb-1.5 flex items-center gap-1.5">
              <Layers size={12} /> Select Template
            </label>
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 dark:border-[#2a3942] rounded-xl hover:border-[#25D366] transition-colors text-sm bg-white dark:bg-[#1f2c34]"
            >
              <span className={selectedTemplate ? 'text-[#111b21] dark:text-[#e9edef] font-medium' : 'text-gray-400 dark:text-[#667781]'}>
                {selectedTemplate ? selectedTemplate.name.replace(/_/g, ' ') : 'Choose an approved template...'}
              </span>
              <ChevronDown size={15} className={`text-gray-400 dark:text-[#667781] transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
            </button>

            {showTemplates && (
              <div className="mt-1 border border-gray-200 dark:border-[#2a3942] rounded-xl overflow-hidden shadow-lg bg-white dark:bg-[#111b21] max-h-44 overflow-y-auto">
                {templatesLoading ? (
                  <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin" /></div>
                ) : approvedTemplates.length === 0 ? (
                  <p className="text-center py-6 text-sm text-gray-400 dark:text-[#667781]">No approved templates found</p>
                ) : (
                  approvedTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTemplate(t); setShowTemplates(false); setParams({}); }}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-[#2a3942] text-left transition-colors border-b border-gray-50 dark:border-[#2a3942] last:border-0 ${
                        selectedTemplate?.id === t.id ? 'bg-[#e8f5e9] dark:bg-[#1a3a2a]' : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-[#111b21] dark:text-[#e9edef]">{t.name.replace(/_/g, ' ')}</span>
                          {selectedTemplate?.id === t.id && <CheckCircle2 size={13} className="text-[#25D366]" />}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-0.5 inline-block ${
                          t.category === 'MARKETING' ? 'bg-purple-100 text-purple-700' :
                          t.category === 'UTILITY' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {t.category.toLowerCase()}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Parameters */}
          {selectedTemplate && (
            <>
              {isMediaHeader && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-[#8696a0] mb-1.5">
                    {header?.format} Header URL
                  </label>
                  <input
                    type="url"
                    value={headerMediaUrl}
                    onChange={(e) => setHeaderMediaUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#25D366]"
                  />
                </div>
              )}

              {allPlaceholders.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-600 dark:text-[#8696a0]">Template Variables</p>
                  {allPlaceholders.map((ph) => {
                    const isH = header?.text?.includes(ph);
                    return (
                      <div key={ph}>
                        <label className="block text-[11px] text-gray-400 dark:text-[#667781] mb-1">
                          {isH ? '📌 Header —' : '📝 Body —'} Variable {ph}
                        </label>
                        <input
                          type="text"
                          value={params[ph] || ''}
                          onChange={(e) => setParams({ ...params, [ph]: e.target.value })}
                          placeholder={`Value for ${ph}`}
                          className="w-full border border-gray-200 dark:border-[#2a3942] dark:bg-[#1f2c34] dark:text-[#e9edef] dark:placeholder-[#667781] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#25D366]"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Live preview */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] mb-2">Preview</p>
                <div className="bg-[#e8f5e9] dark:bg-[#0d2a1a] rounded-xl p-3">
                  <div className="bg-white dark:bg-[#1f2c34] rounded-xl shadow-sm p-3 max-w-xs ml-auto">
                    {isMediaHeader && headerMediaUrl && (
                      <div className="h-20 bg-gray-100 dark:bg-[#2a3942] rounded-lg mb-2 overflow-hidden">
                        <img src={headerMediaUrl} alt="hdr" className="w-full h-full object-cover" />
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
                  {buttons?.buttons && (
                    <div className="mt-1.5 space-y-1">
                      {buttons.buttons.map((btn, i) => (
                        <div key={i} className="bg-white dark:bg-[#1f2c34] rounded-lg py-1.5 text-center text-[11px] text-[#00a5f4] font-medium shadow-sm">{btn.text}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-[#2a3942] px-5 py-4 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 dark:border-[#2a3942] rounded-xl text-sm text-gray-600 dark:text-[#8696a0] hover:bg-gray-50 dark:hover:bg-[#1f2c34] transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !phone || !selectedTemplate}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#25D366] text-white rounded-xl text-sm font-semibold hover:bg-[#22c55e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? <><RefreshCw size={14} className="animate-spin" /> Starting…</> : <><Send size={14} /> Start Chat</>}
          </button>
        </div>
      </div>
    </div>
  );
}
