'use client';
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';
import { fetchAnalytics, setDateRange, ActiveContact } from '@/store/slices/analyticsSlice';
import MetricsCard from './MetricsCard';
import LeadsTable from './LeadsTable';
import Avatar from '@/components/ui/Avatar';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Users, MessageSquare, Send, Eye, TrendingUp, Clock,
  CheckCircle, DollarSign, RefreshCw, Download, ExternalLink, MessageCircle,
} from 'lucide-react';
import { AnalyticsSkeleton } from '@/components/ui/Skeletons';
import { formatDistanceToNow } from 'date-fns';

const COLORS = {
  sent: '#075E54',
  delivered: '#25D366',
  read: '#34B7F1',
  received: '#ECE5DD',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-xl p-3">
      <p className="text-xs font-semibold text-gray-600 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600 capitalize">{entry.name}:</span>
          <span className="font-semibold text-[#111b21]">{entry.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function AnalyticsDashboard({ onNavigateToChat = () => {} }: { onNavigateToChat?: (conversationId: string) => void }) {
  const dispatch = useAppDispatch();
  const { overview, messagesOverTime, conversionFunnel, statusBreakdown, leads, activeContacts, dateRange, loading } =
    useAppSelector((s) => s.analytics);
  const [expandedContact, setExpandedContact] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchAnalytics(dateRange));
  }, [dateRange, dispatch]);

  const dateRangeOptions = [
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: '90 Days', value: '90d' },
  ];

  if (loading && !overview) {
    return <AnalyticsSkeleton />;
  }

  if (!overview) return null;

  const displayMessages = dateRange === '7d' ? messagesOverTime.slice(-7) : messagesOverTime;

  return (
    <div className="flex-1 overflow-y-auto bg-[#f0f2f5] dark:bg-[#0b141a]">
      {/* Analytics Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-[#111b21] border-b border-gray-200 dark:border-[#2a3942] px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-[#111b21] dark:text-[#e9edef]">Business Analytics</h1>
          <p className="text-sm text-gray-500 dark:text-[#8696a0]">Nibirapon Fashion • WhatsApp Business</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 dark:bg-[#1f2c34] rounded-xl p-1">
            {dateRangeOptions.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => dispatch(setDateRange(value as any))}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  dateRange === value
                    ? 'bg-white dark:bg-[#2a3942] text-[#075E54] dark:text-[#25D366] shadow-sm font-semibold'
                    : 'text-gray-500 dark:text-[#8696a0] hover:text-gray-700 dark:hover:text-[#e9edef]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => dispatch(fetchAnalytics(dateRange))}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-[#1f2c34] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={`text-gray-500 dark:text-[#8696a0] ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-[#075E54] text-white text-xs font-medium rounded-xl hover:bg-[#064e45] transition-colors">
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricsCard
            title="Total Contacts"
            value={overview.totalContacts}
            icon={Users}
            color="text-blue-600"
            bgColor="bg-blue-50"
            change={12.4}
            subValue="All time customers"
          />
          <MetricsCard
            title="Messages Sent"
            value={overview.messagesSent}
            icon={Send}
            color="text-[#075E54]"
            bgColor="bg-green-50"
            change={8.2}
            subValue={`${overview.messagesReceived.toLocaleString()} received`}
          />
          <MetricsCard
            title="Delivery Rate"
            value={overview.deliveryRate}
            icon={CheckCircle}
            color="text-emerald-600"
            bgColor="bg-emerald-50"
            suffix="%"
            change={2.1}
          />
          <MetricsCard
            title="Read Rate"
            value={overview.readRate}
            icon={Eye}
            color="text-[#34B7F1]"
            bgColor="bg-sky-50"
            suffix="%"
            change={-1.5}
          />
          <MetricsCard
            title="Response Rate"
            value={overview.responseRate}
            icon={MessageSquare}
            color="text-purple-600"
            bgColor="bg-purple-50"
            suffix="%"
            change={5.3}
          />
          <MetricsCard
            title="Avg Response Time"
            value={overview.avgResponseTime}
            icon={Clock}
            color="text-orange-600"
            bgColor="bg-orange-50"
            suffix=" min"
            change={-18.5}
            subValue="Faster than last period"
          />
          <MetricsCard
            title="Leads Generated"
            value={overview.totalLeads}
            icon={TrendingUp}
            color="text-pink-600"
            bgColor="bg-pink-50"
            change={23.7}
            subValue={`${overview.convertedLeads} converted`}
          />
          <MetricsCard
            title="Revenue Generated"
            value={`₹${(overview.revenue / 1000).toFixed(0)}K`}
            icon={DollarSign}
            color="text-green-600"
            bgColor="bg-green-50"
            change={31.2}
            subValue={`${overview.conversionRate}% conversion rate`}
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-3 gap-4">
          {/* Messages Over Time */}
          <div className="col-span-2 bg-white dark:bg-[#111b21] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-[#2a3942]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Message Activity</h3>
                <p className="text-xs text-gray-400 dark:text-[#667781]">Sent, delivered, and read over time</p>
              </div>
              <div className="flex items-center gap-3">
                {[
                  { key: 'sent', color: COLORS.sent, label: 'Sent' },
                  { key: 'delivered', color: COLORS.delivered, label: 'Delivered' },
                  { key: 'read', color: COLORS.read, label: 'Read' },
                ].map(({ key, color, label }) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-xs text-gray-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={displayMessages} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.sent} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={COLORS.sent} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="delivGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.delivered} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={COLORS.delivered} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="readGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.read} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={COLORS.read} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={dateRange === '7d' ? 0 : 4} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="sent" stroke={COLORS.sent} strokeWidth={2} fill="url(#sentGrad)" />
                <Area type="monotone" dataKey="delivered" stroke={COLORS.delivered} strokeWidth={2} fill="url(#delivGrad)" />
                <Area type="monotone" dataKey="read" stroke={COLORS.read} strokeWidth={2} fill="url(#readGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Conversation Status Donut */}
          <div className="bg-white dark:bg-[#111b21] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-[#2a3942]">
            <div className="mb-5">
              <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Conversation Status</h3>
              <p className="text-xs text-gray-400 dark:text-[#667781]">{overview.totalConversations} total conversations</p>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={statusBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusBreakdown.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {statusBreakdown.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                  <div>
                    <p className="text-xs font-semibold text-[#111b21] dark:text-[#e9edef]">{item.value}</p>
                    <p className="text-[10px] text-gray-400 dark:text-[#667781]">{item.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-2 gap-4">
          {/* Conversion Funnel */}
          <div className="bg-white dark:bg-[#111b21] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-[#2a3942]">
            <div className="mb-5">
              <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Conversion Funnel</h3>
              <p className="text-xs text-gray-400 dark:text-[#667781]">From messages sent to customers converted</p>
            </div>
            <div className="space-y-2">
              {conversionFunnel.map((item, index) => {
                const maxCount = conversionFunnel[0]?.count || 1;
                const pct = (item.count / maxCount) * 100;
                return (
                  <div key={item.stage}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 dark:text-[#8696a0]">{item.stage}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#111b21] dark:text-[#e9edef]">{item.count.toLocaleString()}</span>
                        <span className="text-[10px] text-gray-400 dark:text-[#667781]">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-[#2a3942] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: item.fill }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily Messages Bar Chart */}
          <div className="bg-white dark:bg-[#111b21] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-[#2a3942]">
            <div className="mb-5">
              <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Daily Volume</h3>
              <p className="text-xs text-gray-400 dark:text-[#667781]">Messages sent vs received per day</p>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={displayMessages.slice(-14)} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="sent" fill={COLORS.sent} radius={[3, 3, 0, 0]} maxBarSize={16} />
                <Bar dataKey="received" fill="#94a3b8" radius={[3, 3, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance KPIs */}
        <div className="bg-white dark:bg-[#111b21] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-[#2a3942]">
          <div className="mb-4">
            <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Performance KPIs</h3>
            <p className="text-xs text-gray-400 dark:text-[#667781]">Key metrics at a glance</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: 'Delivery Rate', value: overview.deliveryRate, color: '#25D366', target: 95 },
              { label: 'Read Rate', value: overview.readRate, color: '#34B7F1', target: 70 },
              { label: 'Response Rate', value: overview.responseRate, color: '#075E54', target: 80 },
              { label: 'Conversion Rate', value: overview.conversionRate, color: '#F0B429', target: 30 },
            ].map(({ label, value, color, target }) => (
              <div key={label} className="flex flex-col items-center">
                <div className="relative w-24 h-24">
                  <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.9" fill="none"
                      stroke={color} strokeWidth="3"
                      strokeDasharray={`${(value / 100) * 100} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-[#111b21] dark:text-[#e9edef]">{value}%</span>
                  </div>
                </div>
                <p className="text-xs font-medium text-gray-600 dark:text-[#8696a0] mt-2 text-center">{label}</p>
                <p className="text-[10px] text-gray-400 dark:text-[#667781]">Target: {target}%</p>
              </div>
            ))}
          </div>
        </div>

        {/* Active Contacts — people who replied / chatted within the period */}
        {activeContacts.length > 0 && (
          <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2a3942] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-[#2a3942] flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-[#111b21] dark:text-[#e9edef]">Active Contacts</h3>
                <p className="text-xs text-gray-400 dark:text-[#667781] mt-0.5">
                  {activeContacts.length} contact{activeContacts.length !== 1 ? 's' : ''} replied or messaged in this period
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[#25D366]">
                <MessageCircle size={16} />
                <span className="text-sm font-semibold">{activeContacts.reduce((s, c) => s + c.messageCount, 0)} messages</span>
              </div>
            </div>

            <div className="divide-y divide-gray-50 dark:divide-[#2a3942]">
              {activeContacts.map((contact) => {
                const isOpen = expandedContact === contact.contactId;
                return (
                  <div key={contact.contactId}>
                    <button
                      onClick={() => setExpandedContact(isOpen ? null : contact.contactId)}
                      className="w-full flex items-center gap-3 px-6 py-3 hover:bg-gray-50 dark:hover:bg-[#1f2c34] transition-colors text-left"
                    >
                      <Avatar name={contact.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-[#111b21] dark:text-[#e9edef] truncate">{contact.name}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                            contact.convStatus === 'open'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-gray-100 dark:bg-[#2a3942] text-gray-500 dark:text-[#8696a0]'
                          }`}>
                            {contact.convStatus}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-[#667781] truncate">{contact.lastMessageText || contact.phone}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold text-[#25D366]">{contact.messageCount} msg{contact.messageCount !== 1 ? 's' : ''}</p>
                        <p className="text-[10px] text-gray-400 dark:text-[#667781]">
                          {formatDistanceToNow(new Date(contact.lastMessageAt), { addSuffix: true })}
                        </p>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-6 pb-3 bg-gray-50 dark:bg-[#0b141a] flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-500 dark:text-[#8696a0] font-mono">{contact.phone}</p>
                        </div>
                        <button
                          onClick={() => onNavigateToChat(contact.conversationId)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#075E54] hover:bg-[#064e45] text-white text-xs font-semibold rounded-lg transition-colors shrink-0"
                        >
                          <ExternalLink size={12} /> Open Chat
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Leads Table */}
        <LeadsTable leads={leads} />
      </div>
    </div>
  );
}
