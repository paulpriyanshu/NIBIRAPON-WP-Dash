'use client';
import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Paperclip, Smile, Send, Mic, Layers, Image, FileText, X, Loader2, MessageSquareMore, List, MousePointerClick } from 'lucide-react';
import TemplateModal from './TemplateModal';
import { Template, Message } from '@/types';
import { customMessageOptions, renderCustomPreview, type CustomMessage } from '@/lib/custom-messages';

interface TemplateSendData {
  bodyParams: string[];
  isMPMTemplate: boolean;
  mpmSections: { title: string; product_items: { product_retailer_id: string }[] }[];
  thumbnailProductRetailerId: string;
}

interface MessageInputProps {
  onSend: (text: string, type?: string, templateName?: string, mediaId?: string, filename?: string, mimeType?: string, previewUrl?: string, replyToId?: string, templateData?: TemplateSendData) => void;
  onSendCustom?: (customMessageId: string) => void;
  disabled?: boolean;
  replyTo?: Message | null;
  onCancelReply?: () => void;
}

const EMOJI_QUICK = ['😊', '👍', '❤️', '😂', '🙏', '✅', '🎉', '😍', '🔥', '💯'];
const CUSTOM_ICON: Record<string, any> = { list: List, buttons: MousePointerClick };

export default function MessageInput({ onSend, onSendCustom, disabled, replyTo, onCancelReply }: MessageInputProps) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customMsgs, setCustomMsgs] = useState<CustomMessage[]>([]);

  useEffect(() => {
    if (!showCustom || customMsgs.length) return;
    fetch('/api/custom-messages').then(r => r.ok ? r.json() : []).then(setCustomMsgs).catch(() => {});
  }, [showCustom, customMsgs.length]);
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim(), 'text', undefined, undefined, undefined, undefined, undefined, replyTo?.id);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setShowEmoji(false);
    onCancelReply?.();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const handleTemplateSelect = (
    template: Template,
    variables: Record<string, string>,
    mpmData?: { isMPMTemplate: boolean; thumbnailProductRetailerId: string; mpmSections: { title: string; product_retailer_ids: string }[] }
  ) => {
    const bodyComp = template.components.find((c) => c.type === 'BODY');
    let bodyText = bodyComp?.text || template.name;
    Object.entries(variables).forEach(([k, v]) => {
      bodyText = bodyText.replace(k, v);
    });

    const bodyParams = Object.keys(variables)
      .sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')))
      .map((k) => variables[k])
      .filter(Boolean);

    const mpmSections = mpmData?.mpmSections.map((s) => ({
      title: s.title,
      product_items: s.product_retailer_ids.split(',').map((id) => id.trim()).filter(Boolean).map((id) => ({ product_retailer_id: id })),
    })) ?? [];

    onSend(bodyText, 'template', template.name, undefined, undefined, undefined, undefined, replyTo?.id, {
      bodyParams,
      isMPMTemplate: mpmData?.isMPMTemplate ?? false,
      mpmSections,
      thumbnailProductRetailerId: mpmData?.thumbnailProductRetailerId ?? '',
    });
    setShowTemplate(false);
  };

  // Upload + send several files in order (each photo is its own WhatsApp message —
  // the Cloud API has no multi-image album, so we send them serially).
  const handleFilesSelect = async (files: File[], fileType: 'image' | 'document' | 'audio') => {
    setShowAttach(false);
    for (const file of files) {
      await handleFileSelect(file, fileType);
    }
  };

  const handleFileSelect = async (file: File, fileType: 'image' | 'document' | 'audio') => {
    setShowAttach(false);
    setUploading(true);
    const previewUrl = fileType === 'image' ? URL.createObjectURL(file) : undefined;
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload-media', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      const { mediaId, mimeType, filename } = await res.json();
      onSend('', fileType, undefined, mediaId, filename, mimeType, previewUrl);
    } catch (err: any) {
      console.error('File upload error:', err.message);
    } finally {
      setUploading(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    }
  };

  return (
    <>
      {showTemplate && (
        <TemplateModal onClose={() => setShowTemplate(false)} onSelect={handleTemplateSelect} />
      )}

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) handleFilesSelect(fs, 'image'); }}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f, 'document'); e.target.value = ''; }}
      />

      <div className="bg-[#f0f2f5] dark:bg-[#1f2c34] border-t border-gray-200 dark:border-[#2a3942]">
        {/* Quick emoji bar */}
        {showEmoji && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-[#2a3942] bg-white dark:bg-[#1f2c34]">
            <div className="flex items-center gap-1 flex-wrap">
              {EMOJI_QUICK.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => { setText((p) => p + emoji); textareaRef.current?.focus(); }}
                  className="text-xl hover:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
              <button onClick={() => setShowEmoji(false)} className="ml-auto text-gray-400 dark:text-[#667781] hover:text-gray-600 dark:hover:text-[#8696a0]">
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Uploading indicator */}
        {uploading && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-[#2a3942] bg-white dark:bg-[#1f2c34] flex items-center gap-2 text-sm text-gray-500 dark:text-[#8696a0]">
            <Loader2 size={14} className="animate-spin text-[#25D366]" />
            Uploading file…
          </div>
        )}

        {/* Attachment options */}
        {showAttach && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-[#2a3942] bg-white dark:bg-[#1f2c34]">
            <div className="flex gap-3">
              <button
                className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                onClick={() => imageInputRef.current?.click()}
              >
                <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                  <Image size={18} className="text-white" />
                </div>
                <span className="text-[10px] text-gray-600 dark:text-[#8696a0]">Photo</span>
              </button>
              <button
                className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                onClick={() => docInputRef.current?.click()}
              >
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                  <FileText size={18} className="text-white" />
                </div>
                <span className="text-[10px] text-gray-600 dark:text-[#8696a0]">Document</span>
              </button>
              <button
                className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                onClick={() => setShowAttach(false)}
              >
                <div className="w-10 h-10 bg-[#25D366] rounded-full flex items-center justify-center">
                  <Mic size={18} className="text-white" />
                </div>
                <span className="text-[10px] text-gray-600 dark:text-[#8696a0]">Audio</span>
              </button>
              <button
                className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                onClick={() => { setShowTemplate(true); setShowAttach(false); }}
              >
                <div className="w-10 h-10 bg-[#075E54] rounded-full flex items-center justify-center">
                  <Layers size={18} className="text-white" />
                </div>
                <span className="text-[10px] text-gray-600 dark:text-[#8696a0]">Template</span>
              </button>
            </div>
          </div>
        )}

        {/* Custom message picker */}
        {showCustom && onSendCustom && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-[#2a3942] bg-white dark:bg-[#1f2c34] max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-500 dark:text-[#8696a0]">Send a custom message</p>
              <button onClick={() => setShowCustom(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-[#8696a0]"><X size={14} /></button>
            </div>
            {customMsgs.length === 0 ? (
              <p className="text-[11px] text-gray-400 dark:text-[#667781] py-3 text-center">No custom messages. Create them in Messages → Custom.</p>
            ) : (
              <div className="space-y-1">
                {customMsgs.map((m) => {
                  const Icon = CUSTOM_ICON[m.type] || MessageSquareMore;
                  const opts = customMessageOptions(m);
                  return (
                    <button key={m.id}
                      onClick={() => { onSendCustom(m.id); setShowCustom(false); }}
                      className="w-full text-left p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2a3942] transition-colors">
                      <div className="flex items-center gap-2">
                        <Icon size={13} className="text-[#25D366] shrink-0" />
                        <span className="text-xs font-medium text-[#111b21] dark:text-[#e9edef] truncate">{m.name}</span>
                        {opts.length > 0 && <span className="text-[9px] text-gray-400 ml-auto shrink-0">{opts.length} option{opts.length !== 1 ? 's' : ''}</span>}
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-0.5 line-clamp-1 whitespace-pre-wrap">{renderCustomPreview(m)}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Reply quote strip */}
        {replyTo && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-[#2a3942] bg-white dark:bg-[#1f2c34] flex items-center gap-2">
            <div className="flex-1 border-l-4 border-[#25D366] pl-2 min-w-0">
              <p className="text-[11px] font-semibold text-[#25D366]">
                {replyTo.isOutgoing ? 'You' : 'Customer'}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-[#8696a0] truncate">
                {replyTo.text || (replyTo.type === 'image' ? '📷 Photo' : replyTo.type === 'document' ? '📄 Document' : replyTo.type === 'audio' ? '🎙️ Voice message' : replyTo.type === 'template' ? '📋 Template' : '💬 Message')}
              </p>
            </div>
            <button onClick={onCancelReply} className="text-gray-400 dark:text-[#667781] hover:text-gray-600 dark:hover:text-[#8696a0] flex-shrink-0">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Main input row */}
        <div className="flex items-end gap-2 px-3 py-2">
          <button
            onClick={() => { setShowEmoji(!showEmoji); setShowAttach(false); }}
            className={`p-2 rounded-full flex-shrink-0 transition-colors ${showEmoji ? 'text-[#25D366]' : 'text-[#54656f] hover:bg-gray-200 dark:hover:bg-[#2a3942]'}`}
          >
            <Smile size={22} />
          </button>

          <button
            onClick={() => { setShowAttach(!showAttach); setShowEmoji(false); setShowCustom(false); }}
            className={`p-2 rounded-full flex-shrink-0 transition-colors ${showAttach ? 'text-[#25D366]' : 'text-[#54656f] hover:bg-gray-200 dark:hover:bg-[#2a3942]'}`}
          >
            <Paperclip size={22} />
          </button>

          {onSendCustom && (
            <button
              onClick={() => { setShowCustom(!showCustom); setShowEmoji(false); setShowAttach(false); }}
              disabled={disabled}
              title="Send a custom message"
              className={`p-2 rounded-full flex-shrink-0 transition-colors ${showCustom ? 'text-[#25D366]' : 'text-[#54656f] hover:bg-gray-200 dark:hover:bg-[#2a3942]'}`}
            >
              <MessageSquareMore size={22} />
            </button>
          )}

          <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-3xl border border-gray-200 dark:border-[#3a4a52] flex items-end px-4 py-2 shadow-sm">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder={disabled ? 'Select a conversation' : 'Type a message'}
              disabled={disabled}
              rows={1}
              className="flex-1 resize-none outline-none text-sm text-[#111b21] dark:text-[#e9edef] placeholder-[#8696a0] bg-transparent leading-relaxed"
              style={{ maxHeight: '120px' }}
            />
          </div>

          {text.trim() ? (
            <button
              onClick={handleSend}
              disabled={disabled}
              className="p-2.5 bg-[#25D366] hover:bg-[#22c55e] text-white rounded-full flex-shrink-0 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          ) : (
            <button
              onMouseDown={() => setIsRecording(true)}
              onMouseUp={() => setIsRecording(false)}
              className={`p-2.5 rounded-full flex-shrink-0 transition-all ${
                isRecording ? 'bg-red-500 text-white scale-110' : 'bg-[#25D366] hover:bg-[#22c55e] text-white'
              }`}
            >
              <Mic size={18} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
