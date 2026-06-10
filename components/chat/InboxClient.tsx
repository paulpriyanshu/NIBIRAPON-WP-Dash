'use client';
import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';
import { setConversations } from '@/store/slices/conversationsSlice';
import type { Conversation } from '@/types';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';

/**
 * Inbox layout, seeded with the server-rendered first list so there's no
 * blank → spinner → fetch on load/refresh. ConversationList keeps polling for
 * live updates after this initial seed.
 */
export default function InboxClient({ initial }: { initial: Conversation[] }) {
  const dispatch = useAppDispatch();
  const selectedId = useAppSelector((s) => s.conversations.selectedId);

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    dispatch(setConversations(initial));
  }, [dispatch, initial]);

  return (
    <div className="flex h-full overflow-hidden">
      <div className={`flex-shrink-0 h-full overflow-hidden w-full md:w-80 xl:w-96 ${selectedId ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
        <ConversationList />
      </div>
      <div className={`flex-1 h-full overflow-hidden ${selectedId ? 'flex' : 'hidden md:flex'}`}>
        <ChatWindow />
      </div>
    </div>
  );
}
