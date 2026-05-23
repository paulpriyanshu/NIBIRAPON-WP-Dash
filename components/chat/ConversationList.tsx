'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';
import { selectConversation, setSearchQuery, fetchConversations } from '@/store/slices/conversationsSlice';
import ConversationItem from './ConversationItem';
import NewChatModal from './NewChatModal';
import { Search, Filter, MessageSquarePlus, Users, Tag, MoreVertical, Archive, RefreshCw } from 'lucide-react';

type FilterTab = 'all' | 'open' | 'resolved' | 'pending';

export default function ConversationList() {
  const dispatch = useAppDispatch();
  const { conversations, selectedId, searchQuery } = useAppSelector((s) => s.conversations);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showNewChat, setShowNewChat] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Refresh full conversation list every 15 s so unselected chats reorder when they get messages
  useEffect(() => {
    const id = setInterval(() => dispatch(fetchConversations()), 5000);
    return () => clearInterval(id);
  }, [dispatch]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/sync-conversations', { method: 'POST' });
      const data = await res.json();
      const added = data.contactsFromBroadcast + data.conversationsFromMeta;
      setSyncMsg(added > 0 ? `✓ ${added} new contact${added !== 1 ? 's' : ''} synced` : '✓ Already up to date');
      await dispatch(fetchConversations());
    } catch {
      setSyncMsg('Sync failed');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(''), 4000);
    }
  };

  const filtered = useMemo(() => {
    let list = [...conversations];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.contact.name.toLowerCase().includes(q) ||
          c.contact.phone.includes(q) ||
          c.lastMessage?.text?.toLowerCase().includes(q)
      );
    }
    if (activeTab !== 'all') {
      list = list.filter((c) => c.status === activeTab);
    }
    list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [conversations, searchQuery, activeTab]);

  const tabs: FilterTab[] = ['all', 'open', 'resolved', 'pending'];
  const counts = useMemo(() => ({
    all: conversations.length,
    open: conversations.filter((c) => c.status === 'open').length,
    resolved: conversations.filter((c) => c.status === 'resolved').length,
    pending: conversations.filter((c) => c.status === 'pending').length,
  }), [conversations]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111b21] border-r border-gray-200 dark:border-[#2a3942]">
      {/* Header — full brand on desktop, buttons-only on mobile (top bar already shows brand) */}
      <div className="px-4 py-3 bg-[#f0f2f5] dark:bg-[#1f2c34] flex items-center justify-between">
        <div className="hidden md:flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center">
            <span className="text-white text-xs font-bold">NB</span>
          </div>
          <span className="font-semibold text-[#111b21] dark:text-[#e9edef] text-sm">Nibirapon Business</span>
        </div>
        {/* On mobile show a title instead of the avatar */}
        <span className="md:hidden font-semibold text-[#111b21] dark:text-[#e9edef] text-base">Chats</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowNewChat(true)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-colors" title="New Chat">
            <MessageSquarePlus size={18} className="text-[#54656f] dark:text-[#8696a0]" />
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-colors disabled:opacity-40"
            title="Sync contacts from broadcast history"
          >
            <RefreshCw size={18} className={`text-[#54656f] dark:text-[#8696a0] ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <button className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-colors" title="More">
            <MoreVertical size={18} className="text-[#54656f] dark:text-[#8696a0]" />
          </button>
        </div>
      </div>
      {syncMsg && (
        <div className="px-4 py-1.5 bg-[#e8f5e9] dark:bg-[#1a3a2a] border-b border-[#c8e6c9] dark:border-[#2a3942]">
          <p className="text-xs text-[#2e7d32] dark:text-wp-green font-medium">{syncMsg}</p>
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2 bg-[#f0f2f5] dark:bg-[#1f2c34]">
        <div className="flex items-center bg-white dark:bg-[#2a3942] rounded-lg px-3 gap-2 shadow-sm border border-gray-100 dark:border-[#3a4a52]">
          <Search size={15} className="text-[#8696a0] flex-shrink-0" />
          <input
            type="text"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => dispatch(setSearchQuery(e.target.value))}
            className="flex-1 py-2 text-sm bg-transparent outline-none text-[#111b21] dark:text-[#e9edef] placeholder-[#8696a0]"
          />
          {searchQuery && (
            <button onClick={() => dispatch(setSearchQuery(''))} className="text-gray-400 dark:text-[#667781] hover:text-gray-600 dark:hover:text-[#8696a0]">✕</button>
          )}
          <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#3a4a52]" title="Filter">
            <Filter size={14} className="text-[#8696a0]" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-gray-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors relative ${
              activeTab === tab ? 'text-[#075E54] dark:text-wp-green' : 'text-gray-500 dark:text-[#8696a0] hover:text-gray-700 dark:hover:text-[#e9edef]'
            }`}
          >
            {tab}
            {counts[tab] > 0 && (
              <span className={`ml-1 text-[10px] ${activeTab === tab ? 'text-[#25D366]' : 'text-gray-400 dark:text-[#667781]'}`}>
                ({counts[tab]})
              </span>
            )}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#25D366]" />
            )}
          </button>
        ))}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-[#667781]">
            <MessageSquarePlus size={32} className="mb-2 opacity-50" />
            <p className="text-sm">{searchQuery ? 'No conversations found' : 'No conversations yet'}</p>
          </div>
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedId === conv.id}
              onClick={() => dispatch(selectConversation(conv.id))}
            />
          ))
        )}
      </div>

      {/* Bottom quick filters */}
      <div className="border-t border-gray-100 dark:border-[#2a3942] px-3 py-2 flex gap-2">
        <button className="flex items-center gap-1 text-xs text-gray-500 dark:text-[#8696a0] hover:text-gray-700 dark:hover:text-[#e9edef] bg-gray-50 dark:bg-[#2a3942] rounded-full px-2.5 py-1">
          <Tag size={10} /> Labels
        </button>
        <button className="flex items-center gap-1 text-xs text-gray-500 dark:text-[#8696a0] hover:text-gray-700 dark:hover:text-[#e9edef] bg-gray-50 dark:bg-[#2a3942] rounded-full px-2.5 py-1">
          <Archive size={10} /> Archived
        </button>
      </div>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
    </div>
  );
}
