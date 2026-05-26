// ─── Base shimmer skeleton ─────────────────────────────────────────────────
function Sk({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gray-200 dark:bg-[#2a3942] rounded-lg ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/30 dark:via-white/5 to-transparent" />
    </div>
  );
}

// ─── Conversation list item ────────────────────────────────────────────────
export function ConversationItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-[#2a3942]">
      <Sk className="w-11 h-11 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Sk className="h-3.5 w-28 rounded" />
          <Sk className="h-2.5 w-10 rounded" />
        </div>
        <Sk className="h-2.5 w-40 rounded" />
      </div>
    </div>
  );
}

export function ConversationListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <ConversationItemSkeleton key={i} />
      ))}
    </>
  );
}

// ─── Chat message bubbles ──────────────────────────────────────────────────
function MessageBubbleSkeleton({ outgoing = false, wide = false }: { outgoing?: boolean; wide?: boolean }) {
  return (
    <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className="space-y-1.5" style={{ maxWidth: '65%', minWidth: wide ? 200 : 120 }}>
        <Sk className={`h-10 ${wide ? 'w-64' : 'w-40'} rounded-xl`} />
        <Sk className="h-2 w-10 rounded ml-auto" />
      </div>
    </div>
  );
}

export function MessagesSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-4 py-4">
      <MessageBubbleSkeleton outgoing={false} wide />
      <MessageBubbleSkeleton outgoing />
      <MessageBubbleSkeleton outgoing={false} />
      <MessageBubbleSkeleton outgoing wide />
      <MessageBubbleSkeleton outgoing={false} wide />
      <MessageBubbleSkeleton outgoing />
      <MessageBubbleSkeleton outgoing={false} />
      <MessageBubbleSkeleton outgoing wide />
    </div>
  );
}

// ─── Template card ─────────────────────────────────────────────────────────
export function TemplateCardSkeleton() {
  return (
    <div className="bg-white dark:bg-[#1f2c34] rounded-xl border border-gray-200 dark:border-[#2a3942] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <Sk className="h-4 w-36 rounded" />
          <Sk className="h-3 w-20 rounded" />
        </div>
        <Sk className="h-6 w-16 rounded-full" />
      </div>
      <Sk className="h-3 w-full rounded" />
      <Sk className="h-3 w-3/4 rounded" />
      <div className="flex gap-2 pt-1">
        <Sk className="h-7 w-20 rounded-lg" />
        <Sk className="h-7 w-20 rounded-lg" />
      </div>
    </div>
  );
}

export function TemplateGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <TemplateCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Template history card ─────────────────────────────────────────────────
export function TemplateHistoryItemSkeleton() {
  return (
    <div className="bg-white dark:bg-[#1f2c34] rounded-xl border border-gray-200 dark:border-[#2a3942] p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <Sk className="h-4 w-44 rounded" />
          <div className="flex gap-2">
            <Sk className="h-3 w-24 rounded" />
            <Sk className="h-3 w-16 rounded" />
            <Sk className="h-3 w-20 rounded" />
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {[32, 32, 32, 32, 32].map((w, i) => <Sk key={i} className={`h-7 w-${w === 32 ? '8' : '8'} rounded-lg`} />)}
        </div>
      </div>
    </div>
  );
}

export function TemplateHistorySkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <TemplateHistoryItemSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Broadcast campaign history ────────────────────────────────────────────
export function BroadcastCampaignSkeleton() {
  return (
    <div className="bg-white dark:bg-[#1f2c34] rounded-xl border border-gray-200 dark:border-[#2a3942] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Sk className="h-4 w-48 rounded" />
          <Sk className="h-3 w-32 rounded" />
        </div>
        <Sk className="h-6 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="text-center space-y-1">
            <Sk className="h-6 w-10 rounded mx-auto" />
            <Sk className="h-2.5 w-12 rounded mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BroadcastHistorySkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <BroadcastCampaignSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Analytics metric card ─────────────────────────────────────────────────
export function MetricCardSkeleton() {
  return (
    <div className="bg-white dark:bg-[#1f2c34] rounded-2xl border border-gray-100 dark:border-[#2a3942] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Sk className="h-8 w-8 rounded-lg" />
        <Sk className="h-5 w-12 rounded-full" />
      </div>
      <Sk className="h-8 w-24 rounded" />
      <Sk className="h-3 w-32 rounded" />
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Metric cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <MetricCardSkeleton key={i} />)}
      </div>
      {/* Chart area */}
      <div className="bg-white dark:bg-[#1f2c34] rounded-2xl border border-gray-100 dark:border-[#2a3942] p-5 space-y-3">
        <Sk className="h-4 w-40 rounded" />
        <Sk className="h-56 w-full rounded-xl" />
      </div>
      {/* Two column charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="bg-white dark:bg-[#1f2c34] rounded-2xl border border-gray-100 dark:border-[#2a3942] p-5 space-y-3">
            <Sk className="h-4 w-32 rounded" />
            <Sk className="h-44 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── User management table ─────────────────────────────────────────────────
export function UserRowSkeleton() {
  return (
    <tr className="border-b border-gray-50 dark:border-[#2a3942]">
      <td className="px-6 py-3">
        <div className="flex items-center gap-2.5">
          <Sk className="w-8 h-8 rounded-full shrink-0" />
          <div className="space-y-1.5">
            <Sk className="h-3 w-24 rounded" />
            <Sk className="h-2.5 w-16 rounded" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3 space-y-1.5">
        <Sk className="h-2.5 w-32 rounded" />
        <Sk className="h-2.5 w-20 rounded" />
      </td>
      <td className="px-4 py-3"><Sk className="h-5 w-16 rounded-full" /></td>
      <td className="px-4 py-3"><Sk className="h-5 w-12 rounded-full" /></td>
      <td className="px-6 py-3">
        <div className="flex justify-end gap-1">
          <Sk className="h-7 w-7 rounded-lg" />
          <Sk className="h-7 w-7 rounded-lg" />
        </div>
      </td>
    </tr>
  );
}
