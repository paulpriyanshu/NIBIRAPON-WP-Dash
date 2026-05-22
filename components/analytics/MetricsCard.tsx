'use client';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricsCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  change?: number;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  suffix?: string;
  prefix?: string;
}

export default function MetricsCard({
  title,
  value,
  subValue,
  change,
  icon: Icon,
  color,
  bgColor,
  suffix = '',
  prefix = '',
}: MetricsCardProps) {
  const TrendIcon = change === undefined ? Minus : change > 0 ? TrendingUp : TrendingDown;
  const trendColor = change === undefined ? 'text-gray-400' : change > 0 ? 'text-green-500' : 'text-red-500';

  return (
    <div className="bg-white dark:bg-[#111b21] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-[#2a3942] hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 ${bgColor} rounded-xl flex items-center justify-center`}>
          <Icon size={20} className={color} />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
            <TrendIcon size={13} />
            <span>{Math.abs(change)}%</span>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-bold text-[#111b21] dark:text-[#e9edef]">
          {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
        </p>
        <p className="text-sm text-gray-500 dark:text-[#8696a0] font-medium">{title}</p>
        {subValue && <p className="text-xs text-gray-400 dark:text-[#667781]">{subValue}</p>}
      </div>
    </div>
  );
}
