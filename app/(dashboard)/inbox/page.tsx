'use client';
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';
import { fetchConversations } from '@/store/slices/conversationsSlice';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';

export default function InboxPage() {
  const dispatch = useAppDispatch();
  const selectedId = useAppSelector((s) => s.conversations.selectedId);

  useEffect(() => {
    dispatch(fetchConversations());
  }, [dispatch]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Conversation list — hidden on mobile when a chat is open */}
      <div className={`
        flex-shrink-0 h-full overflow-hidden
        w-full md:w-80 xl:w-96
        ${selectedId ? 'hidden md:flex md:flex-col' : 'flex flex-col'}
      `}>
        <ConversationList />
      </div>

      {/* Chat window — hidden on mobile when no chat selected */}
      <div className={`
        flex-1 h-full overflow-hidden
        ${selectedId ? 'flex' : 'hidden md:flex'}
      `}>
        <ChatWindow />
      </div>
    </div>
  );
}
