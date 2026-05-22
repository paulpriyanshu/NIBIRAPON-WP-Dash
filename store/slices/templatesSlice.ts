import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { Template } from '@/types';

interface TemplatesState {
  templates: Template[];
  loading: boolean;
  error: string | null;
}

const initialState: TemplatesState = {
  templates: [],
  loading: false,
  error: null,
};

export const fetchTemplates = createAsyncThunk('templates/fetchAll', async () => {
  const res = await fetch('/api/templates');
  if (!res.ok) throw new Error('Failed to fetch templates');
  return res.json() as Promise<Template[]>;
});

const templatesSlice = createSlice({
  name: 'templates',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTemplates.pending, (state) => { state.loading = true; })
      .addCase(fetchTemplates.fulfilled, (state, action) => {
        state.loading = false;
        state.templates = action.payload;
      })
      .addCase(fetchTemplates.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Unknown error';
      });
  },
});

export default templatesSlice.reducer;
