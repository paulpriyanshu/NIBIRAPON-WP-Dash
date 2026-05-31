'use client';
import { Message, MessageStatus } from '@/types';
import { formatMessageTime } from '@/lib/utils';
import StatusTick from '@/components/ui/StatusTick';
import { Star, Reply, MoreVertical, FileText, Music, Film, MapPin, User, MousePointerClick, ShoppingCart, ChevronRight } from 'lucide-react';
import { useAppSelector } from '@/hooks/redux';

interface MessageBubbleProps {
  message: Message;
  isFirst?: boolean;
  onQuoteClick?: (messageId: string) => void;
  onReply?: (message: Message) => void;
}

// ─── WhatsApp-style reply quote ───────────────────────────────────────────────
function ReplyQuote({
  replyTo,
  isOutgoing,
  contextMsgId,
  onQuoteClick,
}: {
  replyTo?: NonNullable<Message['replyTo']>;
  isOutgoing: boolean;
  contextMsgId?: string;
  onQuoteClick?: (messageId: string) => void;
}) {
  const clickableId = replyTo?.id || contextMsgId;
  const handleClick = () => { if (clickableId && onQuoteClick) onQuoteClick(clickableId); };

  // Case 1: full reply data available (message exists in our DB)
  if (replyTo) {
    const label   = replyTo.isOutgoing ? 'You' : 'Customer';
    const preview = replyTo.text
      ? replyTo.text.slice(0, 100) + (replyTo.text.length > 100 ? '…' : '')
      : replyTo.type === 'image'    ? '📷 Photo'
      : replyTo.type === 'video'    ? '🎥 Video'
      : replyTo.type === 'audio'    ? '🎙️ Voice message'
      : replyTo.type === 'document' ? '📄 Document'
      : replyTo.type === 'sticker'  ? '🎭 Sticker'
      : replyTo.type === 'location' ? '📍 Location'
      : replyTo.type === 'template' ? '📋 Template message'
      : '💬 Message';

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        className={`rounded-lg mb-1.5 overflow-hidden flex cursor-pointer hover:brightness-95 transition-all ${isOutgoing ? 'bg-[#b2f0ab]' : 'bg-gray-100'}`}
      >
        <div className={`w-1 flex-shrink-0 ${replyTo.isOutgoing ? 'bg-[#25D366]' : 'bg-[#34B7F1]'}`} />
        <div className="flex-1 px-2.5 py-1.5 min-w-0 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-semibold ${replyTo.isOutgoing ? 'text-[#25D366]' : 'text-[#34B7F1]'}`}>
              {label}
            </p>
            <p className="text-[11px] text-gray-600 leading-snug truncate">{preview}</p>
          </div>
          {replyTo.mediaUrl && replyTo.type === 'image' && (
            <img src={replyTo.mediaUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
          )}
        </div>
      </div>
    );
  }

  // Case 2: context ID exists but message isn't in our DB (e.g. sent via broadcast before DB existed)
  if (contextMsgId) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        className={`rounded-lg mb-1.5 overflow-hidden flex cursor-pointer hover:brightness-95 transition-all ${isOutgoing ? 'bg-[#b2f0ab]' : 'bg-gray-100'}`}
      >
        <div className="w-1 flex-shrink-0 bg-[#25D366]" />
        <div className="px-2.5 py-1.5 min-w-0">
          <p className="text-[11px] font-semibold text-[#25D366]">You</p>
          <p className="text-[11px] text-gray-500 leading-snug italic">📋 Template message</p>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Product reference card (catalog_message / referred_product) ──────────────
function ProductRefCard({ td, isOutgoing }: { td: Record<string, string>; isOutgoing: boolean }) {
  const contentId = td.productRetailerId || '—';

  return (
    <div className={`rounded-lg mb-2 overflow-hidden flex border ${isOutgoing ? 'bg-[#b2f0ab] border-[#25D366]/20' : 'bg-gray-50 border-gray-200'}`}>
      <div className="w-1 flex-shrink-0 bg-[#25D366]" />
      <div className="flex-1 px-2.5 py-1.5 flex items-center gap-2 min-w-0">
        <ShoppingCart size={14} className="text-[#25D366] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-[#25D366] leading-snug">Catalog product</p>
          <p className="text-[11px] text-gray-500 leading-snug">Content ID: <span className="font-medium text-[#111b21]">{contentId}</span></p>
        </div>
      </div>
    </div>
  );
}

// ─── Order-details card (checkout_template) ──────────────────────────────────
function CheckoutOrderCard({
  td, text, timestamp, status, isOutgoing, paymentCaptured,
}: {
  td: Record<string, any>;
  text: string | undefined;
  timestamp: number;
  status: MessageStatus;
  isOutgoing: boolean;
  paymentCaptured: boolean;
}) {
  const items: Array<{ retailerId: string; name: string; priceInPaise: number; quantity: number; imageUrl?: string }> =
    (() => { try { return JSON.parse(td.items || '[]'); } catch { return []; } })();
  const symbol   = td.currency === 'INR' ? '₹' : td.currency || '₹';
  const totalStr = td.totalStr || '0.00';

  return (
    <div className="-mx-3 -my-2 overflow-hidden rounded-xl min-w-[260px]" style={{ background: '#1f2c34' }}>
      {/* Order header */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-[12px] font-semibold text-gray-300">Order #{td.referenceId}</p>
      </div>

      <div className="mx-3 border-t border-dashed border-white/10" />

      {/* Product rows */}
      <div className="px-3 py-2 space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-white/10 flex items-center justify-center">
              {item.imageUrl
                ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                : <ShoppingCart size={16} className="text-white/40" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white leading-snug truncate">{item.name}</p>
              <p className="text-[11px] text-gray-400">Quantity {item.quantity}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-3 border-t border-dashed border-white/10" />

      {/* Total */}
      <div className="px-3 py-2 flex justify-between items-center">
        <p className="text-[13px] text-gray-300">Total</p>
        <p className="text-[13px] font-semibold text-white">{symbol}{totalStr}</p>
      </div>

      {/* Body + timestamp on white section */}
      <div className="bg-[#d9fdd3] px-3 py-2">
        <p className="text-[13px] text-[#111b21] leading-relaxed">{text || 'You are just one step away'}</p>
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[10px] text-gray-400">{formatMessageTime(timestamp)}</span>
          {isOutgoing && <StatusTick status={status} />}
        </div>
      </div>

      {/* CTA button */}
      <div
        className="border-t border-black/10 flex items-center justify-center gap-1 py-2.5 text-[13px] font-medium"
        style={{ background: '#d9fdd3' }}
      >
        {paymentCaptured ? (
          <span className="text-[#25D366] font-semibold">✓ Paid</span>
        ) : (
          <span className="text-[#00a5f4]">Review and Pay</span>
        )}
      </div>
    </div>
  );
}

export default function MessageBubble({ message, isFirst, onQuoteClick, onReply }: MessageBubbleProps) {
  const allTemplates = useAppSelector((s) => s.templates.templates);
  const { isOutgoing, type, text, timestamp, status, isDeleted, isStarred, reactions, media, replyTo, templateData } = message;
  const paymentCaptured = (templateData as any)?.paymentCaptured === 'true';

  // contextMsgId stored when customer tapped a button on a template
  const contextMsgId = (templateData as any)?.contextMsgId || undefined;
  const hasReplyContext = !!replyTo || !!contextMsgId;

  if (isDeleted) {
    return (
      <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-1`}>
        <div className="rounded-xl px-3 py-2 text-sm italic text-gray-400 border border-gray-200 bg-white max-w-xs">
          🚫 This message was deleted
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (type) {
      case 'image':
        return (
          <div className="rounded-lg overflow-hidden mb-1">
            {media?.url ? (
              <img src={media.url} alt={media.caption || 'Image'} className="max-w-[240px] max-h-[200px] object-cover rounded-lg" />
            ) : (
              <div className="w-48 h-36 bg-gray-200 flex flex-col items-center justify-center rounded-lg gap-1">
                <Film size={24} className="text-gray-400" />
                <span className="text-[10px] text-gray-400">Photo</span>
              </div>
            )}
            {media?.caption && <p className="text-xs mt-1 text-gray-600 px-1">{media.caption}</p>}
          </div>
        );

      case 'video':
        return (
          <div className="rounded-lg overflow-hidden mb-1">
            <div className="w-48 h-36 bg-gray-800 flex flex-col items-center justify-center rounded-lg gap-1">
              <Film size={24} className="text-white" />
              <span className="text-[10px] text-gray-300">Video</span>
            </div>
            {media?.caption && <p className="text-xs mt-1 text-gray-600 px-1">{media.caption}</p>}
          </div>
        );

      case 'document':
        return (
          <div className={`flex items-center gap-2 rounded-lg p-2 mb-1 ${isOutgoing ? 'bg-[#b7f5b0]' : 'bg-gray-100'}`}>
            <div className="w-9 h-9 bg-[#25D366] rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#111b21] truncate">{media?.filename || 'Document'}</p>
              <p className="text-[10px] text-gray-500">{media?.mimeType || 'File'}</p>
            </div>
          </div>
        );

      case 'audio':
        return (
          <div className={`flex items-center gap-2 rounded-lg p-2 mb-1 min-w-[160px] ${isOutgoing ? 'bg-[#b7f5b0]' : 'bg-gray-100'}`}>
            <div className="w-9 h-9 bg-[#25D366] rounded-full flex items-center justify-center flex-shrink-0">
              <Music size={16} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="h-1.5 bg-gray-300 rounded-full w-32">
                <div className="h-1.5 bg-[#25D366] rounded-full w-16" />
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Voice message</p>
            </div>
          </div>
        );

      case 'sticker':
        return (
          <div className="mb-1 w-20 h-20 flex items-center justify-center">
            {media?.url
              ? <img src={media.url} alt="Sticker" className="w-full h-full object-contain" />
              : <span className="text-4xl">🎭</span>
            }
          </div>
        );

      case 'location':
        return (
          <div className={`flex items-center gap-2 rounded-lg p-2 mb-1 ${isOutgoing ? 'bg-[#b7f5b0]' : 'bg-gray-100'}`}>
            <div className="w-9 h-9 bg-[#25D366] rounded-lg flex items-center justify-center flex-shrink-0">
              <MapPin size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#111b21]">Location shared</p>
              <p className="text-[10px] text-gray-500 truncate">{text || 'View on map'}</p>
            </div>
          </div>
        );

      case 'contacts':
        return (
          <div className={`flex items-center gap-2 rounded-lg p-2 mb-1 ${isOutgoing ? 'bg-[#b7f5b0]' : 'bg-gray-100'}`}>
            <div className="w-9 h-9 bg-[#25D366] rounded-lg flex items-center justify-center flex-shrink-0">
              <User size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#111b21]">Contact shared</p>
              <p className="text-[10px] text-gray-500 truncate">{text || ''}</p>
            </div>
          </div>
        );

      case 'interactive': {
        const td = templateData as any;
        // Customer messaged from catalog product page — just show their text
        if (td?.interactiveType === 'catalog_message') {
          return text
            ? <p className="text-sm text-[#111b21] leading-relaxed whitespace-pre-wrap break-words">{text}</p>
            : null;
        }
        if (td?.interactiveType === 'order') {
          const items: Array<{
            product_retailer_id: string; quantity: number; item_price: number;
            currency: string; name?: string | null; image_url?: string | null;
          }> = (() => { try { return JSON.parse(td.productItems || '[]'); } catch { return []; } })();
          const total    = items.reduce((sum, i) => sum + (i.item_price || 0) * (i.quantity || 1), 0);
          const currency = items[0]?.currency || 'INR';
          const symbol   = currency === 'INR' ? '₹' : currency;
          return (
            <div className="-mx-3 -my-2 overflow-hidden rounded-xl" style={{ minWidth: 260 }}>
              <div className="px-3 pt-2.5 pb-2">
                {/* Header */}
                <div className="flex items-center gap-1.5 mb-2.5">
                  <ShoppingCart size={14} className="text-[#25D366] flex-shrink-0" />
                  <p className="text-[13px] font-semibold text-[#111b21]">
                    {items.length} item{items.length !== 1 ? 's' : ''}
                  </p>
                  <p className="ml-auto text-[13px] font-semibold text-[#111b21]">
                    {symbol}{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>

                {/* Product rows */}
                <div className="space-y-2">
                  {items.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {/* Product image or placeholder */}
                      <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center">
                        {item.image_url
                          ? <img src={item.image_url} alt={item.name || item.product_retailer_id} className="w-full h-full object-cover" />
                          : <ShoppingCart size={18} className="text-gray-300" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-[#111b21] truncate leading-snug">
                          {item.name || item.product_retailer_id}
                        </p>
                        {item.name && (
                          <p className="text-[10px] text-gray-400 truncate leading-snug">SKU: {item.product_retailer_id}</p>
                        )}
                        <p className="text-[11px] text-gray-500 leading-snug">
                          {symbol}{item.item_price.toLocaleString('en-IN')} × {item.quantity}
                        </p>
                      </div>
                      <p className="text-[12px] font-semibold text-[#111b21] flex-shrink-0">
                        {symbol}{(item.item_price * item.quantity).toLocaleString('en-IN')}
                      </p>
                    </div>
                  ))}
                  {items.length > 4 && (
                    <p className="text-[11px] text-gray-400">+{items.length - 4} more items</p>
                  )}
                </div>

                {/* Estimated total line */}
                <div className="mt-2 pt-2 border-t border-black/10 flex justify-between items-center">
                  <p className="text-[11px] text-gray-400">Estimated total</p>
                  <p className="text-[12px] font-semibold text-[#111b21]">
                    {symbol}{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* View cart button */}
              <div className="border-t border-black/10 flex items-center justify-center gap-1 py-2 text-[13px] text-[#00a5f4] font-medium cursor-pointer hover:bg-black/5 transition-colors">
                <span>View sent cart</span>
                <ChevronRight size={13} />
              </div>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1.5 mb-1">
            <MousePointerClick size={13} className="text-[#25D366] flex-shrink-0" />
            <p className="text-sm text-[#111b21] leading-relaxed">{text || '(button tap)'}</p>
          </div>
        );
      }

      case 'template': {
        // Checkout order-details card — has its own dark styling
        if (message.templateName === 'checkout_template' && (templateData as any)?.referenceId) {
          return (
            <CheckoutOrderCard
              td={templateData as Record<string, any>}
              text={text}
              timestamp={timestamp}
              status={status}
              isOutgoing={isOutgoing}
              paymentCaptured={paymentCaptured}
            />
          );
        }

        const tpl        = allTemplates.find((t) => t.name === message.templateName);
        const headerComp  = tpl?.components.find((c) => c.type === 'HEADER');
        const bodyComp    = tpl?.components.find((c) => c.type === 'BODY');
        const footerComp  = tpl?.components.find((c) => c.type === 'FOOTER');
        const buttonsComp = tpl?.components.find((c) => c.type === 'BUTTONS');

        const headerFormat   = headerComp?.format || '';
        const headerMediaUrl = media?.url || (templateData as any)?.headerMediaUrl || null;

        // Substitute {{1}} {{2}} in body with actual params
        const rawParams = (templateData as any)?.bodyParams;
        const bodyParams: string[] | undefined = Array.isArray(rawParams)
          ? rawParams
          : typeof rawParams === 'string'
            ? (() => { try { return JSON.parse(rawParams); } catch { return undefined; } })()
            : undefined;
        let bodyText = bodyComp?.text || '';
        if (bodyParams?.length) {
          bodyParams.forEach((val, i) => {
            bodyText = bodyText.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), val);
          });
        }
        if (!bodyText) bodyText = text || '';

        const hasButtons = (buttonsComp?.buttons?.length ?? 0) > 0;

        return (
          <div className="mb-1" style={{ minWidth: 220 }}>
            {/* Header image — flush to bubble edges */}
            {headerFormat === 'IMAGE' && headerMediaUrl && (
              <img
                src={headerMediaUrl}
                alt="header"
                className="-mx-3 -mt-2 w-[calc(100%+1.5rem)] max-h-52 object-cover rounded-t-xl mb-2"
              />
            )}
            {headerFormat === 'VIDEO' && headerMediaUrl && (
              <video
                src={headerMediaUrl}
                controls
                className="-mx-3 -mt-2 w-[calc(100%+1.5rem)] max-h-52 rounded-t-xl mb-2"
              />
            )}
            {headerFormat === 'DOCUMENT' && (
              <div className="flex items-center gap-2 bg-black/5 rounded-lg px-2 py-1.5 mb-2">
                <FileText size={16} className="text-[#25D366] flex-shrink-0" />
                <span className="text-xs font-medium truncate">{headerComp?.text || 'Document'}</span>
              </div>
            )}
            {headerFormat === 'TEXT' && headerComp?.text && (
              <p className="font-bold text-sm text-[#111b21] dark:text-[#e9edef] mb-1">{headerComp.text}</p>
            )}

            {/* Body */}
            {bodyText && (
              <p className="text-sm text-[#111b21] dark:text-[#e9edef] leading-relaxed whitespace-pre-wrap break-words">{bodyText}</p>
            )}

            {/* Order reference number */}
            {(templateData as any)?.referenceId && (
              <p className="text-[11px] text-gray-400 mt-1">Order #{(templateData as any).referenceId}</p>
            )}

            {/* Footer */}
            {footerComp?.text && (
              <p className="text-[11px] text-gray-400 mt-1">{footerComp.text}</p>
            )}

            {/* Fallback when template not yet loaded */}
            {!tpl && !bodyText && (
              <p className="text-[11px] text-gray-400">📋 {message.templateName}</p>
            )}

            {/* Payment completed badge */}
            {paymentCaptured && (
              <div className="flex items-center gap-1.5 mt-2 bg-white/20 rounded-lg px-2 py-1.5">
                <span className="text-base">✅</span>
                <span className="text-[13px] font-semibold text-white">Payment Completed</span>
              </div>
            )}

            {/* Buttons */}
            {hasButtons && (
              <div className="-mx-3 -mb-2 mt-2 border-t border-black/10 overflow-hidden rounded-b-xl">
                {paymentCaptured ? (
                  <div className="text-center text-[13px] text-white font-semibold py-2.5">
                    ✓ Paid
                  </div>
                ) : (
                  buttonsComp!.buttons!.map((btn, i) => (
                    <div
                      key={i}
                      className={`text-center text-[13px] text-[#00a5f4] font-medium py-2.5 ${i > 0 ? 'border-t border-black/10' : ''}`}
                    >
                      {btn.text}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      }

      default:
        return <p className="text-sm text-[#111b21] dark:text-[#e9edef] leading-relaxed whitespace-pre-wrap break-words">{text}</p>;
    }
  };

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-1 px-4 group relative`}>
      {/* Hover actions — always in DOM, shown/hidden via CSS so click always fires */}
      <div className={`absolute top-0 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity ${isOutgoing ? 'left-2' : 'right-2'}`}>
        <button
          onClick={() => onReply?.(message)}
          className="w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50"
          title="Reply"
        >
          <Reply size={12} className="text-gray-500" />
        </button>
        <button className="w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50">
          <Star size={12} className={isStarred ? 'text-yellow-400 fill-yellow-400' : 'text-gray-500'} />
        </button>
        <button className="w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50">
          <MoreVertical size={12} className="text-gray-500" />
        </button>
      </div>

      <div className={`relative max-w-xs lg:max-w-md xl:max-w-lg ${isOutgoing ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Bubble */}
        <div
          className={`relative rounded-xl px-3 py-2 shadow-sm ${
            paymentCaptured
              ? 'bg-wp-green rounded-tr-none'
              : isOutgoing
                ? 'bg-[#d9fdd3] dark:bg-[#005c4b] rounded-tr-none'
                : 'bg-white dark:bg-[#1f2c34] rounded-tl-none'
          }`}
        >
          {/* Bubble tail */}
          {isFirst && !isOutgoing && (
            <div className="absolute -left-1.5 top-0 w-3 h-3 bg-white dark:bg-[#1f2c34]" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }} />
          )}
          {isFirst && isOutgoing && (
            <div className="absolute -right-1.5 top-0 w-3 h-3 bg-[#d9fdd3] dark:bg-[#005c4b]" style={{ clipPath: 'polygon(0 0, 0 100%, 100% 0)' }} />
          )}

          {/* Reply-to quote (WhatsApp style) */}
          {hasReplyContext && (
            <ReplyQuote
              replyTo={replyTo}
              isOutgoing={isOutgoing}
              contextMsgId={contextMsgId}
              onQuoteClick={onQuoteClick}
            />
          )}

          {/* Catalog product reference (when customer messaged from product page) */}
          {(templateData as any)?.interactiveType === 'product_ref' && (
            <ProductRefCard td={templateData as Record<string, string>} isOutgoing={isOutgoing} />
          )}
          {(templateData as any)?.interactiveType === 'catalog_message' && (
            <ProductRefCard td={templateData as Record<string, string>} isOutgoing={isOutgoing} />
          )}

          {renderContent()}

          {/* Time + status */}
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <span className={`text-[10px] ${paymentCaptured ? 'text-white/70' : 'text-gray-400'}`}>{formatMessageTime(timestamp)}</span>
            {isOutgoing && <StatusTick status={status} />}
          </div>
        </div>

        {/* Payment paid badge — shown below bubble */}
        {paymentCaptured && (
          <div className="flex items-center gap-1 mt-1 bg-wp-green text-white text-[11px] font-semibold rounded-full px-2.5 py-0.5 self-end shadow-sm">
            <span>✓</span>
            <span>Paid</span>
          </div>
        )}

        {/* Reactions */}
        {reactions && reactions.length > 0 && (
          <div className={`flex gap-1 mt-0.5 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
            <div className="bg-white border border-gray-200 rounded-full px-1.5 py-0.5 shadow-sm flex items-center gap-0.5">
              {reactions.map((r, i) => <span key={i} className="text-xs">{r.emoji}</span>)}
              {reactions.length > 1 && <span className="text-[10px] text-gray-500 ml-0.5">{reactions.length}</span>}
            </div>
          </div>
        )}

        {/* Sender attribution badge — only on outgoing messages */}
        {isOutgoing && message.sentBy && (
          <div className={`flex mt-0.5 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
            {message.sentBy === 'agent' ? (
              <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20">
                🤖 AI · Riya
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 border border-gray-200 dark:border-white/10">
                👤 {message.sentBy === 'admin' ? 'Admin' : message.sentBy}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
