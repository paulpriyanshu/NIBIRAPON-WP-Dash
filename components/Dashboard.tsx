'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAppDispatch } from '@/hooks/redux';
import { fetchConversations, selectConversation } from '@/store/slices/conversationsSlice';
import TopNav from './TopNav';
import ConversationList from './chat/ConversationList';
import ChatWindow from './chat/ChatWindow';
import AnalyticsDashboard from './analytics/AnalyticsDashboard';
import TemplatesPage from './TemplatesPage';
import SettingsPage from './SettingsPage';
import BroadcastPage from './broadcast/BroadcastPage';

type Tab = 'chat' | 'analytics' | 'templates' | 'settings' | 'broadcast';

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  useEffect(() => {
    dispatch(fetchConversations());

    const interval = setInterval(() => {
      dispatch(fetchConversations());
    }, 30000);
    return () => clearInterval(interval);
  }, [dispatch]);

  const handleNavigateToChat = useCallback((conversationId: string) => {
    dispatch(selectConversation(conversationId));
    setActiveTab('chat');
  }, [dispatch]);

  return (
    <div className="h-screen flex flex-col bg-[#f0f2f5] overflow-hidden">
      <TopNav activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <>
            <div className="w-80 xl:w-96 flex-shrink-0 h-full overflow-hidden">
              <ConversationList />
            </div>
            <div className="flex-1 flex overflow-hidden">
              <ChatWindow />
            </div>
          </>
        )}

        {activeTab === 'analytics' && <AnalyticsDashboard onNavigateToChat={handleNavigateToChat} />}
        {activeTab === 'broadcast' && <BroadcastPage />}
        {activeTab === 'templates' && <TemplatesPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </div>
    </div>
  );
}
