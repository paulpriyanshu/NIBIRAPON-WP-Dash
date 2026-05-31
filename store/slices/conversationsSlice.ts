import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Conversation, Message, ConversationStatus } from '@/types';

interface ConversationsState {
  conversations: Conversation[];
  selectedId: string | null;
  searchQuery: string;
  filter: 'all' | 'open' | 'resolved' | 'pending';
  loading: boolean;
  error: string | null;
  typingConversations: string[];
}

const initialState: ConversationsState = {
  conversations: [],
  selectedId: null,
  searchQuery: '',
  filter: 'all',
  loading: false,
  error: null,
  typingConversations: [],
};

export const fetchConversations = createAsyncThunk('conversations/fetchAll', async () => {
  const res = await fetch('/api/conversations');
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json() as Promise<Conversation[]>;
});

export const sendMessage = createAsyncThunk(
  'conversations/sendMessage',
  async (payload: {
    conversationId: string;
    to: string;
    text: string;
    type?: string;
    templateName?: string;
    mediaId?: string;
    filename?: string;
    mimeType?: string;
    replyToId?: string;
    bodyParams?: string[];
    isMPMTemplate?: boolean;
    mpmSections?: { title: string; product_items: { product_retailer_id: string }[] }[];
    thumbnailProductRetailerId?: string;
  }) => {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json() as Promise<Message>;
  }
);

function sortConversations(list: Conversation[]) {
  list.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

const conversationsSlice = createSlice({
  name: 'conversations',
  initialState,
  reducers: {
    selectConversation(state, action: PayloadAction<string>) {
      state.selectedId = action.payload;
      const conv = state.conversations.find((c) => c.id === action.payload);
      if (conv) conv.unreadCount = 0;
    },
    clearConversation(state) {
      state.selectedId = null;
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    setFilter(state, action: PayloadAction<ConversationsState['filter']>) {
      state.filter = action.payload;
    },
    addMessage(state, action: PayloadAction<Message>) {
      const msg = action.payload;
      const conv = state.conversations.find((c) => c.id === msg.conversationId);
      if (conv) {
        conv.lastMessage = msg;
        conv.updatedAt = msg.timestamp;
        if (!msg.isOutgoing && state.selectedId !== conv.id) {
          conv.unreadCount += 1;
        }
        sortConversations(state.conversations as Conversation[]);
      }
    },
    updateMessageStatus(state, action: PayloadAction<{ messageId: string; conversationId: string; status: Message['status'] }>) {
      const conv = state.conversations.find((c) => c.id === action.payload.conversationId);
      if (conv?.lastMessage?.id === action.payload.messageId) {
        conv.lastMessage.status = action.payload.status;
      }
    },
    updateConversationStatus(state, action: PayloadAction<{ id: string; status: ConversationStatus }>) {
      const conv = state.conversations.find((c) => c.id === action.payload.id);
      if (conv) conv.status = action.payload.status;
    },
    addConversation(state, action: PayloadAction<Conversation>) {
      const exists = state.conversations.find((c) => c.id === action.payload.id);
      if (!exists) state.conversations.unshift(action.payload);
    },
    setTyping(state, action: PayloadAction<{ conversationId: string; isTyping: boolean }>) {
      if (action.payload.isTyping) {
        if (!state.typingConversations.includes(action.payload.conversationId)) {
          state.typingConversations.push(action.payload.conversationId);
        }
      } else {
        state.typingConversations = state.typingConversations.filter((id) => id !== action.payload.conversationId);
      }
    },
    pinConversation(state, action: PayloadAction<string>) {
      const conv = state.conversations.find((c) => c.id === action.payload);
      if (conv) conv.isPinned = !conv.isPinned;
    },
    muteConversation(state, action: PayloadAction<string>) {
      const conv = state.conversations.find((c) => c.id === action.payload);
      if (conv) conv.isMuted = !conv.isMuted;
    },
    setAgentEnabled(state, action: PayloadAction<{ id: string; enabled: boolean }>) {
      const conv = state.conversations.find((c) => c.id === action.payload.id);
      if (conv) conv.agentEnabled = action.payload.enabled;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.pending, (state) => { state.loading = true; })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.loading = false;
        const sorted = [...action.payload];
        sortConversations(sorted);
        state.conversations = sorted;
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Unknown error';
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        const msg = action.payload;
        const conv = state.conversations.find((c) => c.id === msg.conversationId);
        if (conv) {
          conv.lastMessage = msg;
          conv.updatedAt = msg.timestamp;
          sortConversations(state.conversations as Conversation[]);
        }
      });
  },
});

export const {
  selectConversation, clearConversation, setSearchQuery, setFilter, addMessage, updateMessageStatus,
  updateConversationStatus, addConversation, setTyping, pinConversation, muteConversation, setAgentEnabled,
} = conversationsSlice.actions;

export default conversationsSlice.reducer;
