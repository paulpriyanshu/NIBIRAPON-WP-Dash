import { configureStore } from '@reduxjs/toolkit';
import conversationsReducer from './slices/conversationsSlice';
import messagesReducer from './slices/messagesSlice';
import analyticsReducer from './slices/analyticsSlice';
import templatesReducer from './slices/templatesSlice';

export const store = configureStore({
  reducer: {
    conversations: conversationsReducer,
    messages: messagesReducer,
    analytics: analyticsReducer,
    templates: templatesReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
