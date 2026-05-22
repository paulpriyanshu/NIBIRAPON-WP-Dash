import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { AnalyticsOverview, TimeSeriesData, ConversionFunnelData, StatusBreakdown, Lead } from '@/types';

interface AnalyticsState {
  overview: AnalyticsOverview | null;
  messagesOverTime: TimeSeriesData[];
  conversionFunnel: ConversionFunnelData[];
  statusBreakdown: StatusBreakdown[];
  leads: Lead[];
  dateRange: '7d' | '30d' | '90d';
  loading: boolean;
  error: string | null;
}

const initialState: AnalyticsState = {
  overview: null,
  messagesOverTime: [],
  conversionFunnel: [],
  statusBreakdown: [],
  leads: [],
  dateRange: '30d',
  loading: false,
  error: null,
};

export const fetchAnalytics = createAsyncThunk(
  'analytics/fetch',
  async (dateRange: string) => {
    const res = await fetch(`/api/analytics?range=${dateRange}`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return res.json();
  }
);

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {
    setDateRange(state, action) {
      state.dateRange = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAnalytics.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchAnalytics.fulfilled, (state, action) => {
        state.loading = false;
        state.overview = action.payload.overview;
        state.messagesOverTime = action.payload.messagesOverTime;
        state.conversionFunnel = action.payload.conversionFunnel;
        state.statusBreakdown = action.payload.statusBreakdown;
        state.leads = action.payload.leads;
      })
      .addCase(fetchAnalytics.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Unknown error';
      });
  },
});

export const { setDateRange } = analyticsSlice.actions;
export default analyticsSlice.reducer;
