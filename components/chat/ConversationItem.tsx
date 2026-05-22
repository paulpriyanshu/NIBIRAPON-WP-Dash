'use client';
import { Conversation } from '@/types';
import { formatConversationTime, truncateText } from '@/lib/utils';
import Avatar from '@/components/ui/Avatar';
import StatusTick from '@/components/ui/StatusTick';
import { Pin, BellOff } from 'lucide-react';

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

export default function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
  const { contact, lastMessage, unreadCount, status, isPinned, isMuted } = conversation;

  const getLastMessagePreview = () => {
    if (!lastMessage) return 'No messages yet';
    if (lastMessage.isDeleted) return '🚫 This message was deleted';
    if (lastMessage.type === 'image') return '📷 Photo';
    if (lastMessage.type === 'video') return '🎥 Video';
    if (lastMessage.type === 'audio') return '🎤 Voice message';
    if (lastMessage.type === 'document') return '📄 Document';
    if (lastMessage.type === 'template') return '📋 Template message';
    return truncateText(lastMessage.text || '', 45);
  };

  const statusColors: Record<string, string> = {
    open: 'bg-green-100 text-green-700',
    resolved: 'bg-gray-100 text-gray-600',
    pending: 'bg-yellow-100 text-yellow-700',
    snoozed: 'bg-purple-100 text-purple-700',
  };

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2a3942] transition-colors border-b border-gray-100 dark:border-[#2a3942] ${
        isSelected ? 'bg-[#f0f2f5] dark:bg-[#2a3942]' : 'dark:bg-[#111b21]'
      }`}
    >
      <Avatar name={contact.name} isOnline={contact.isOnline} size="md" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-[#111b21] dark:text-[#e9edef] text-sm truncate max-w-[150px]">{contact.name}</span>
            {isPinned && <Pin size={11} className="text-gray-400 dark:text-[#667781] flex-shrink-0" />}
            {isMuted && <BellOff size={11} className="text-gray-400 dark:text-[#667781] flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-1">
            {lastMessage && (
              <span className={`text-xs flex-shrink-0 ${unreadCount > 0 ? 'text-[#25D366] font-semibold' : 'text-gray-400 dark:text-[#667781]'}`}>
                {formatConversationTime(conversation.updatedAt)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-gray-500 dark:text-[#8696a0] text-xs min-w-0 flex-1">
            {lastMessage?.isOutgoing && (
              <StatusTick status={lastMessage.status} className="flex-shrink-0" />
            )}
            <span className={`truncate ${unreadCount > 0 ? 'text-[#111b21] dark:text-[#e9edef] font-medium' : ''}`}>
              {getLastMessagePreview()}
            </span>
          </div>

          <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
            {status !== 'open' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[status]}`}>
                {status}
              </span>
            )}
            {unreadCount > 0 && (
              <span className="bg-[#25D366] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
        </div>

        {contact.tags && contact.tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {contact.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
