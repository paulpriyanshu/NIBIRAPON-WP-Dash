'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';
import { fetchMessages, pollMessages, addMessageToConversation, replaceMessage, updateMessageStatusInConversation } from '@/store/slices/messagesSlice';
import { sendMessage, updateConversationStatus, addMessage, clearConversation, setAgentEnabled } from '@/store/slices/conversationsSlice';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ContactPanel from './ContactPanel';
import ReferencedMessageModal from './ReferencedMessageModal';
import Avatar from '@/components/ui/Avatar';
import { MessagesSkeleton } from '@/components/ui/Skeletons';
import { formatDateSeparator, shouldShowDateSeparator, generateId } from '@/lib/utils';
import {
  Search, Phone, Video, MoreVertical, Info, CheckCheck, Clock, ArrowLeft, Bot, Loader2
} from 'lucide-react';
import { Message } from '@/types';
import { fetchTemplates } from '@/store/slices/templatesSlice';

const EMPTY_MSGS: Message[] = [];

export default function ChatWindow() {
  const dispatch = useAppDispatch();
  const selectedId = useAppSelector((s) => s.conversations.selectedId);
  const conversation = useAppSelector((s) =>
    s.conversations.conversations.find((c) => c.id === selectedId)
  );
  const messages = useAppSelector((s) =>
    selectedId ? (s.messages.byConversation[selectedId] ?? EMPTY_MSGS) : EMPTY_MSGS
  );
  const messagesLoading = useAppSelector((s) => selectedId ? s.messages.loading[selectedId] : false);

  const [showContactPanel, setShowContactPanel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [referencedMsgId, setReferencedMsgId] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [agentToggling, setAgentToggling] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const prevConvIdRef = useRef<string | null>(null);
  const prevMsgCountRef = useRef(0);

  useEffect(() => {
    if (selectedId) {
      dispatch(fetchMessages({ conversationId: selectedId }));
      dispatch(fetchTemplates());
    }
  }, [selectedId, dispatch]);

  const toggleAgent = async () => {
    if (!selectedId || !conversation) return;
    const next = !conversation.agentEnabled;
    setAgentToggling(true);
    try {
      await fetch('/api/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedId, agentEnabled: next }),
      });
      dispatch(setAgentEnabled({ id: selectedId, enabled: next }));
    } finally {
      setAgentToggling(false);
    }
  };

  // Poll for new incoming messages every 3 seconds; also poll immediately on tab focus
  useEffect(() => {
    if (!selectedId) return;
    // Capture stable snapshot of latest timestamp so the interval doesn't recreate on every message
    const getLatestTs = () => {
      const msgs = messagesAreaRef.current
        ? Array.from(messagesAreaRef.current.querySelectorAll('[data-ts]')).map(
            (el) => parseInt((el as HTMLElement).dataset.ts || '0')
          )
        : [];
      return msgs.length ? Math.max(...msgs) : 0;
    };
    const poll = async () => {
      try {
        const latestTs = getLatestTs();
        const result = await dispatch(pollMessages({ conversationId: selectedId, after: latestTs })).unwrap();
        if (result.messages.length > 0) {
          const latest = result.messages.reduce((a: any, b: any) => (a.timestamp > b.timestamp ? a : b));
          dispatch(addMessage(latest));
        }
      } catch { /* ignore */ }
    };
    const interval = setInterval(poll, 3000);
    const onFocus = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [selectedId, dispatch]);

  // Scroll to bottom when messages load or a new one arrives.
  //
  // Bug was: the effect fired on `selectedId` change before the new conversation's
  // messages had replaced the old ones in Redux, causing scroll to land in the
  // middle of stale content. Fix: track whether the messages that arrived actually
  // belong to the current conversation, and defer the scroll by one rAF so images/
  // media have time to lay out before we measure scroll height.
  useEffect(() => {
    const area = messagesAreaRef.current;
    if (!area || !selectedId) return;

    const isConvSwitch = prevConvIdRef.current !== selectedId;
    // Only scroll if messages now belong to the selected conversation
    const belongsToCurrentConv =
      messages.length > 0 && messages[0].conversationId === selectedId;
    const isNewMessage =
      !isConvSwitch &&
      belongsToCurrentConv &&
      messages.length > prevMsgCountRef.current;

    prevConvIdRef.current = selectedId;
    prevMsgCountRef.current = messages.length;

    if ((isConvSwitch && belongsToCurrentConv) || isNewMessage) {
      // Defer by one animation frame so the DOM has finished painting
      const raf = requestAnimationFrame(() => {
        area.scrollTop = area.scrollHeight;
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [messages, selectedId]);

  const handleQuoteClick = useCallback((msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // brief highlight flash
      el.classList.add('ring-2', 'ring-[#25D366]', 'rounded-xl');
      setTimeout(() => el.classList.remove('ring-2', 'ring-[#25D366]', 'rounded-xl'), 1500);
    } else {
      setReferencedMsgId(msgId);
    }
  }, []);

  const handleSend = useCallback(
    async (text: string, type = 'text', templateName?: string, mediaId?: string, filename?: string, mimeType?: string, previewUrl?: string, replyToId?: string, templateData?: {
      bodyParams: string[];
      isMPMTemplate: boolean;
      mpmSections: { title: string; product_items: { product_retailer_id: string }[] }[];
      thumbnailProductRetailerId: string;
    }) => {
      if (!selectedId || !conversation) return;
      const tempId = `temp-${generateId()}`;
      const tempMessage: Message = {
        id: tempId,
        conversationId: selectedId,
        from: 'business',
        to: conversation.contact.phone,
        type: type as Message['type'],
        text: text || undefined,
        timestamp: Date.now(),
        status: 'sending',
        isOutgoing: true,
        templateName,
        media: mediaId ? { url: previewUrl, mimeType, filename } : undefined,
      };
      dispatch(addMessageToConversation(tempMessage));
      dispatch(addMessage(tempMessage));
      setReplyToMessage(null);
      try {
        const realMessage = await dispatch(
          sendMessage({
            conversationId: selectedId, to: conversation.contact.phone, text, type, templateName, mediaId, filename, mimeType, replyToId,
            bodyParams: templateData?.bodyParams,
            isMPMTemplate: templateData?.isMPMTemplate,
            mpmSections: templateData?.mpmSections,
            thumbnailProductRetailerId: templateData?.thumbnailProductRetailerId,
          })
        ).unwrap();
        dispatch(replaceMessage({ conversationId: selectedId, tempId, message: realMessage }));
        // Auto-save template sends to history
        if (type === 'template' && templateName) {
          fetch('/api/template-snapshots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              templateName, language: 'en',
              bodyParams: templateData?.bodyParams ?? [],
              headerParam: '',
              recipients: [conversation.contact.phone],
              source: 'dm',
            }),
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Failed to send message:', err);
        dispatch(updateMessageStatusInConversation({ conversationId: selectedId, messageId: tempId, status: 'failed' }));
      }
    },
    [selectedId, conversation, dispatch]
  );

  // Send a saved custom (in-session) message, then refresh the thread.
  const handleSendCustom = useCallback(async (customMessageId: string) => {
    if (!selectedId || !conversation) return;
    try {
      const res = await fetch('/api/custom-messages/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selectedId, customMessageId, to: conversation.contact.phone }),
      });
      if (res.ok) dispatch(fetchMessages({ conversationId: selectedId }));
    } catch (err) {
      console.error('Failed to send custom message:', err);
    }
  }, [selectedId, conversation, dispatch]);

  const filteredMessages = searchQuery
    ? messages.filter((m) => m.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#0b141a]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d1d5db' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }}>
        <div className="text-center p-8">
          <div className="w-24 h-24 rounded-full bg-[#25D366]/20 flex items-center justify-center mx-auto mb-6">
            <svg viewBox="0 0 60 60" className="w-14 h-14" fill="none">
              <path fill="#25D366" d="M30 5C16.2 5 5 16.2 5 30c0 4.7 1.3 9.2 3.6 13L5 55l12.3-3.5A24.8 24.8 0 0030 55c13.8 0 25-11.2 25-25S43.8 5 30 5z"/>
            </svg>
          </div>
          <h2 className="text-2xl font-light text-[#41525d] dark:text-[#8696a0] mb-2">WhatsApp Business</h2>
          <p className="text-[#8696a0] text-sm max-w-xs leading-relaxed">
            Select a conversation from the left to start messaging, or use templates to reach your customers
          </p>
          <div className="flex items-center gap-2 mt-4 justify-center text-xs text-[#8696a0]">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
            </svg>
            <span>End-to-end encrypted</span>
          </div>
        </div>
      </div>
    );
  }

  const { contact, status } = conversation;
  const statusMenuItems = [
    { label: 'Mark as Open', value: 'open', icon: CheckCheck, color: 'text-green-600' },
    { label: 'Mark as Resolved', value: 'resolved', icon: CheckCheck, color: 'text-gray-600' },
    { label: 'Mark as Pending', value: 'pending', icon: Clock, color: 'text-yellow-600' },
  ];

  return (
    <div className="relative flex-1 flex h-full overflow-hidden" style={{ height: '100dvh', maxHeight: '100dvh' }}>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Chat Header */}
        <div className="bg-[#f0f2f5] dark:bg-[#1f2c34] border-b border-gray-200 dark:border-[#2a3942] px-4 py-2.5 flex items-center gap-3">
          <button onClick={() => dispatch(clearConversation())} className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-colors md:hidden">
            <ArrowLeft size={18} className="text-[#54656f] dark:text-[#8696a0]" />
          </button>

          <button
            onClick={() => setShowContactPanel(!showContactPanel)}
            className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
          >
            <Avatar name={contact.name} isOnline={contact.isOnline} size="md" />
            <div className="min-w-0 text-left">
              <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef] text-sm truncate">{contact.name}</h3>
              <p className="text-xs text-[#8696a0]">
                {contact.isOnline ? 'online' : contact.lastSeen ? `last seen recently` : contact.phone}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-0.5 md:gap-1">
            {/* Status badge */}
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={`text-[10px] px-2 py-1 rounded-full font-medium flex items-center gap-1 ${
                  status === 'open' ? 'bg-green-100 text-green-700' :
                  status === 'resolved' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {status} ▾
              </button>
              {showStatusMenu && (
                <div className="absolute top-8 right-0 bg-white dark:bg-[#1f2c34] rounded-xl shadow-xl border border-gray-100 dark:border-[#2a3942] z-20 overflow-hidden min-w-[180px]">
                  {statusMenuItems.map(({ label, value, icon: Icon, color }) => (
                    <button
                      key={value}
                      onClick={() => {
                        dispatch(updateConversationStatus({ id: selectedId!, status: value as any }));
                        setShowStatusMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-[#2a3942] text-sm ${color}`}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => { setShowSearch(!showSearch); setSearchQuery(''); }} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-colors" title="Search">
              <Search size={18} className="text-[#54656f] dark:text-[#8696a0]" />
            </button>
            {/* Hide call buttons on mobile — they're decorative */}
            <button className="hidden md:flex p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-colors" title="Video Call">
              <Video size={18} className="text-[#54656f] dark:text-[#8696a0]" />
            </button>
            <button className="hidden md:flex p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-colors" title="Voice Call">
              <Phone size={18} className="text-[#54656f] dark:text-[#8696a0]" />
            </button>
            {/* AI Agent toggle */}
            <button
              onClick={toggleAgent}
              disabled={agentToggling}
              title={conversation?.agentEnabled ? 'AI Agent ON — click to disable' : 'AI Agent OFF — click to enable'}
              className={`relative p-2 rounded-full transition-all ${
                conversation?.agentEnabled
                  ? 'bg-[#25D366]/15 text-[#25D366] hover:bg-[#25D366]/25'
                  : 'hover:bg-gray-200 dark:hover:bg-[#2a3942] text-[#54656f] dark:text-[#8696a0]'
              }`}
            >
              {agentToggling
                ? <Loader2 size={18} className="animate-spin" />
                : <Bot size={18} />}
              {conversation?.agentEnabled && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-[#25D366] rounded-full ring-1 ring-white dark:ring-[#111b21]" />
              )}
            </button>

            <button onClick={() => setShowContactPanel(!showContactPanel)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-colors" title="Contact Info">
              <Info size={18} className={showContactPanel ? 'text-[#25D366]' : 'text-[#54656f] dark:text-[#8696a0]'} />
            </button>
            <button className="hidden md:flex p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-colors" title="More">
              <MoreVertical size={18} className="text-[#54656f] dark:text-[#8696a0]" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="bg-white dark:bg-[#1f2c34] px-4 py-2 border-b border-gray-200 dark:border-[#2a3942] flex items-center gap-2">
            <Search size={16} className="text-gray-400 dark:text-[#667781]" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in conversation..."
              className="flex-1 text-sm outline-none text-[#111b21] dark:text-[#e9edef] bg-transparent"
            />
            {searchQuery && <span className="text-xs text-gray-500 dark:text-[#8696a0]">{filteredMessages.length} results</span>}
          </div>
        )}

        {/* Messages Area */}
        <div
          ref={messagesAreaRef}
          className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-0.5 messages-area"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23e5ddd5'/%3E%3Ccircle cx='10' cy='10' r='2' fill='%23d4c9be' opacity='0.5'/%3E%3C/svg%3E")`,
            backgroundColor: '#efeae2',
          }}
        >
          {messagesLoading && messages.length === 0 ? (
            <MessagesSkeleton />
          ) : (
            filteredMessages.map((message, index) => (
              <div key={message.id} id={`msg-${message.id}`} data-ts={message.timestamp}>
                {shouldShowDateSeparator(filteredMessages, index) && (
                  <div className="flex justify-center my-3">
                    <span className="bg-white dark:bg-[#1f2c34] text-gray-500 dark:text-[#8696a0] text-xs px-3 py-1 rounded-full shadow-sm border border-gray-100 dark:border-[#2a3942]">
                      {formatDateSeparator(message.timestamp)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  isFirst={
                    index === 0 ||
                    filteredMessages[index - 1].isOutgoing !== message.isOutgoing
                  }
                  onQuoteClick={handleQuoteClick}
                  onReply={setReplyToMessage}
                />
              </div>
            ))
          )}

          {/* Typing indicator */}
          <div ref={messagesEndRef} />
        </div>

        <MessageInput
          onSend={handleSend}
          onSendCustom={handleSendCustom}
          replyTo={replyToMessage}
          onCancelReply={() => setReplyToMessage(null)}
        />
      </div>

      {showContactPanel && conversation && (
        <div className="absolute inset-0 z-30 md:static md:z-auto flex">
          <ContactPanel conversation={conversation} onClose={() => setShowContactPanel(false)} />
        </div>
      )}

      {referencedMsgId && (
        <ReferencedMessageModal
          messageId={referencedMsgId}
          onClose={() => setReferencedMsgId(null)}
        />
      )}
    </div>
  );
}
