import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Message } from '@/types';

interface MessagesState {
  byConversation: Record<string, Message[]>;
  loading: Record<string, boolean>;
  hasMore: Record<string, boolean>;
}

const initialState: MessagesState = {
  byConversation: {},
  loading: {},
  hasMore: {},
};

export const fetchMessages = createAsyncThunk(
  'messages/fetchByConversation',
  async ({ conversationId, page = 1 }: { conversationId: string; page?: number }) => {
    const res = await fetch(`/api/messages?conversationId=${conversationId}&page=${page}`);
    if (!res.ok) throw new Error('Failed to fetch messages');
    const data = await res.json();
    return { conversationId, messages: data.messages as Message[], hasMore: data.hasMore as boolean };
  }
);

// Polls only messages newer than the latest in store (used every ~8s)
export const pollMessages = createAsyncThunk(
  'messages/poll',
  async ({ conversationId, after }: { conversationId: string; after: number }) => {
    const res = await fetch(`/api/messages?conversationId=${conversationId}&after=${after}`);
    if (!res.ok) return { conversationId, messages: [] as Message[] };
    const data = await res.json();
    return { conversationId, messages: data.messages as Message[] };
  }
);

const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    addMessageToConversation(state, action: PayloadAction<Message>) {
      const { conversationId } = action.payload;
      if (!state.byConversation[conversationId]) {
        state.byConversation[conversationId] = [];
      }
      const exists = state.byConversation[conversationId].find((m) => m.id === action.payload.id);
      if (!exists) {
        state.byConversation[conversationId].push(action.payload);
      }
    },
    updateMessageStatusInConversation(
      state,
      action: PayloadAction<{ conversationId: string; messageId: string; status: Message['status'] }>
    ) {
      const { conversationId, messageId, status } = action.payload;
      const messages = state.byConversation[conversationId];
      if (messages) {
        const msg = messages.find((m) => m.id === messageId);
        if (msg) msg.status = status;
      }
    },
    starMessage(state, action: PayloadAction<{ conversationId: string; messageId: string }>) {
      const { conversationId, messageId } = action.payload;
      const messages = state.byConversation[conversationId];
      if (messages) {
        const msg = messages.find((m) => m.id === messageId);
        if (msg) msg.isStarred = !msg.isStarred;
      }
    },
    deleteMessage(state, action: PayloadAction<{ conversationId: string; messageId: string }>) {
      const { conversationId, messageId } = action.payload;
      const messages = state.byConversation[conversationId];
      if (messages) {
        const msg = messages.find((m) => m.id === messageId);
        if (msg) msg.isDeleted = true;
      }
    },
    addReaction(state, action: PayloadAction<{ conversationId: string; messageId: string; emoji: string; from: string }>) {
      const { conversationId, messageId, emoji, from } = action.payload;
      const messages = state.byConversation[conversationId];
      if (messages) {
        const msg = messages.find((m) => m.id === messageId);
        if (msg) {
          if (!msg.reactions) msg.reactions = [];
          const existing = msg.reactions.find((r) => r.from === from);
          if (existing) existing.emoji = emoji;
          else msg.reactions.push({ emoji, from });
        }
      }
    },
    // Replace a temp/optimistic message with the confirmed server message
    replaceMessage(state, action: PayloadAction<{ conversationId: string; tempId: string; message: Message }>) {
      const { conversationId, tempId, message } = action.payload;
      const msgs = state.byConversation[conversationId];
      if (!msgs) return;
      const idx = msgs.findIndex((m) => m.id === tempId);
      if (idx !== -1) {
        msgs[idx] = message;
      } else if (!msgs.find((m) => m.id === message.id)) {
        msgs.push(message);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMessages.pending, (state, action) => {
        state.loading[action.meta.arg.conversationId] = true;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        const { conversationId, messages, hasMore } = action.payload;
        state.loading[conversationId] = false;
        state.hasMore[conversationId] = hasMore;
        if (!state.byConversation[conversationId]) {
          state.byConversation[conversationId] = messages;
        } else {
          const existingIds = new Set(state.byConversation[conversationId].map((m) => m.id));
          const newMessages = messages.filter((m) => !existingIds.has(m.id));
          // Merge updates into existing messages (e.g. templateData patched after payment)
          const updated = messages.filter((m) => existingIds.has(m.id));
          let list = updated.length
            ? state.byConversation[conversationId].map((m) => {
                const upd = updated.find((u) => u.id === m.id);
                return upd ? { ...m, ...upd } : m;
              })
            : state.byConversation[conversationId];
          state.byConversation[conversationId] = [...newMessages, ...list];
        }
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.loading[action.meta.arg.conversationId] = false;
      })
      .addCase(pollMessages.fulfilled, (state, action) => {
        const { conversationId, messages: newMsgs } = action.payload;
        if (!newMsgs.length) return;
        if (!state.byConversation[conversationId]) {
          state.byConversation[conversationId] = newMsgs;
          return;
        }
        const existingIds = new Set(state.byConversation[conversationId].map((m) => m.id));
        const fresh   = newMsgs.filter((m) => !existingIds.has(m.id));
        const updated = newMsgs.filter((m) =>  existingIds.has(m.id));

        // Merge updates into existing messages (e.g. templateData patched after payment)
        let list = updated.length
          ? state.byConversation[conversationId].map((m) => {
              const upd = updated.find((u) => u.id === m.id);
              return upd ? { ...m, ...upd } : m;
            })
          : state.byConversation[conversationId];

        // Payment notification arrived → also mark the original checkout message as paid
        // by matching on referenceId stored in templateData
        for (const msg of fresh) {
          const td = msg.templateData as any;
          if (td?.paymentCaptured === 'true' && td?.referenceId) {
            list = list.map((m) => {
              const mTd = m.templateData as any;
              if (mTd?.referenceId === td.referenceId && mTd?.paymentCaptured !== 'true') {
                return { ...m, templateData: { ...mTd, ...td } };
              }
              return m;
            });
          }
        }

        if (fresh.length) {
          list = [...list, ...fresh];
        }
        state.byConversation[conversationId] = list;
      });
  },
});

export const { addMessageToConversation, updateMessageStatusInConversation, starMessage, deleteMessage, addReaction, replaceMessage } =
  messagesSlice.actions;

export default messagesSlice.reducer;
