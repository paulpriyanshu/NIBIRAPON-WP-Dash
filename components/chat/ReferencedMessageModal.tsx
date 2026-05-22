'use client';
import { useEffect, useState } from 'react';
import { X, FileText, Film, Music, Loader2 } from 'lucide-react';

interface ReferencedMsg {
  id: string;
  type: string;
  text?: string | null;
  isOutgoing: boolean;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaFilename?: string | null;
  mediaCaption?: string | null;
  templateName?: string | null;
  templateData?: Record<string, any> | null;
  templateComponents?: any[];
  sentAt?: string;
}

interface Props {
  messageId: string;
  onClose: () => void;
}

export default function ReferencedMessageModal({ messageId, onClose }: Props) {
  const [msg, setMsg]       = useState<ReferencedMsg | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/messages/${encodeURIComponent(messageId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError('This message is not available — it may have been sent before message history began.');
        else setMsg(data);
      })
      .catch(() => setError('Failed to load message.'))
      .finally(() => setLoading(false));
  }, [messageId]);

  // Pull header component from template for image/video preview
  const headerComp = msg?.templateComponents?.find((c: any) => c.type === 'HEADER');
  const bodyComp   = msg?.templateComponents?.find((c: any) => c.type === 'BODY');
  const footerComp = msg?.templateComponents?.find((c: any) => c.type === 'FOOTER');
  const buttonsComp = msg?.templateComponents?.find((c: any) => c.type === 'BUTTONS');

  // Resolve header media URL: prefer stored mediaUrl, then template example handle
  const headerMediaUrl =
    msg?.mediaUrl ||
    (msg?.templateData as any)?.headerMediaUrl ||
    headerComp?.example?.header_handle?.[0] ||
    null;
  const headerFormat = headerComp?.format || '';   // TEXT | IMAGE | VIDEO | DOCUMENT

  const renderHeader = () => {
    if (!headerComp) return null;
    if (headerFormat === 'IMAGE' && headerMediaUrl) {
      return (
        <div className="rounded-xl overflow-hidden mb-3 bg-gray-100">
          <img src={headerMediaUrl} alt="header" className="w-full max-h-64 object-cover" />
        </div>
      );
    }
    if (headerFormat === 'VIDEO' && headerMediaUrl) {
      return (
        <div className="rounded-xl overflow-hidden mb-3 bg-gray-900 relative">
          <video src={headerMediaUrl} controls className="w-full max-h-64" />
        </div>
      );
    }
    if (headerFormat === 'DOCUMENT') {
      return (
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-[#2a3942] rounded-xl p-3 mb-3">
          <div className="w-10 h-10 bg-[#25D366] rounded-lg flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#111b21] dark:text-[#e9edef]">{headerComp.text || 'Document'}</p>
          </div>
        </div>
      );
    }
    if (headerFormat === 'TEXT' && headerComp.text) {
      return <p className="font-bold text-[#111b21] dark:text-[#e9edef] text-sm mb-2">{headerComp.text}</p>;
    }
    return null;
  };

  const renderPlainContent = () => {
    if (msg?.type === 'image' && msg.mediaUrl) {
      return <img src={msg.mediaUrl} alt="photo" className="w-full max-h-64 object-cover rounded-xl mb-3" />;
    }
    if (msg?.type === 'video' && msg.mediaUrl) {
      return <video src={msg.mediaUrl} controls className="w-full max-h-64 rounded-xl mb-3" />;
    }
    if (msg?.type === 'audio') {
      return (
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-[#2a3942] rounded-xl p-3 mb-3">
          <Music size={20} className="text-[#25D366]" />
          <span className="text-sm text-gray-600 dark:text-[#8696a0]">Voice message</span>
        </div>
      );
    }
    if (msg?.type === 'document') {
      return (
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-[#2a3942] rounded-xl p-3 mb-3">
          <FileText size={20} className="text-[#25D366]" />
          <span className="text-sm text-gray-600 dark:text-[#8696a0]">{msg.mediaFilename || 'Document'}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#075E54]">
          <p className="text-white text-sm font-semibold">Referenced Message</p>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition-colors">
            <X size={16} className="text-white" />
          </button>
        </div>

        <div className="p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 size={28} className="text-[#25D366] animate-spin" />
              <p className="text-sm text-gray-400 dark:text-[#667781]">Loading message…</p>
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-sm text-gray-500 dark:text-[#8696a0]">{error}</p>
            </div>
          )}

          {!loading && msg && (
            <>
              {/* Direction badge */}
              <div className="mb-3 flex items-center gap-1.5">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  msg.isOutgoing ? 'bg-[#e8f5e9] text-[#2e7d32]' : 'bg-blue-50 text-blue-700'
                }`}>
                  {msg.isOutgoing ? '↑ Sent by you' : '↓ Received'}
                </span>
                {msg.templateName && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                    📋 Template
                  </span>
                )}
              </div>

              {/* Template content */}
              {msg.type === 'template' ? (
                <div className="bg-gray-50 dark:bg-[#1f2c34] rounded-xl p-3 border border-gray-100 dark:border-[#2a3942]">
                  {renderHeader()}
                  {bodyComp?.text && (
                    <p className="text-sm text-[#111b21] dark:text-[#e9edef] leading-relaxed whitespace-pre-wrap">
                      {bodyComp.text}
                    </p>
                  )}
                  {!bodyComp && msg.text && (
                    <p className="text-sm text-[#111b21] dark:text-[#e9edef] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  )}
                  {footerComp?.text && (
                    <p className="text-[11px] text-gray-400 dark:text-[#667781] mt-2 pt-2 border-t border-gray-200 dark:border-[#2a3942]">{footerComp.text}</p>
                  )}
                  {buttonsComp?.buttons && (
                    <div className="mt-2 space-y-1 border-t border-gray-200 dark:border-[#2a3942] pt-2">
                      {buttonsComp.buttons.map((btn: any, i: number) => (
                        <div key={i} className="text-center text-[12px] text-[#00a5f4] font-medium py-1 border-t border-gray-100 dark:border-[#2a3942] first:border-0">
                          {btn.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-[#1f2c34] rounded-xl p-3 border border-gray-100 dark:border-[#2a3942]">
                  {renderPlainContent()}
                  {msg.text && <p className="text-sm text-[#111b21] dark:text-[#e9edef] leading-relaxed whitespace-pre-wrap">{msg.text}</p>}
                </div>
              )}

              {msg.sentAt && (
                <p className="text-[10px] text-gray-400 dark:text-[#667781] mt-2 text-right">
                  {new Date(msg.sentAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
