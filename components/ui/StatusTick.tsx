'use client';
import { MessageStatus } from '@/types';

interface StatusTickProps {
  status: MessageStatus;
  className?: string;
}

export default function StatusTick({ status, className = '' }: StatusTickProps) {
  if (status === 'sending') {
    return (
      <svg className={`w-3.5 h-3.5 text-gray-400 ${className}`} viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>
    );
  }
  if (status === 'failed') {
    return (
      <svg className={`w-3.5 h-3.5 text-red-500 ${className}`} viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm.75 3.25a.75.75 0 00-1.5 0v3a.75.75 0 001.5 0v-3zm-.75 6a.75.75 0 100-1.5.75.75 0 000 1.5z" />
      </svg>
    );
  }
  if (status === 'sent') {
    return (
      <svg className={`w-3.5 h-3.5 text-gray-400 ${className}`} viewBox="0 0 16 11" fill="currentColor">
        <path d="M15.01.584l-8.222 9.007-1.02-1.11L14.01.57l1 .014z" />
        <path d="M5.788 9.591L1.01 4.813 2.01 3.8l4.79 4.789-.012 1.002z" />
      </svg>
    );
  }
  if (status === 'delivered') {
    return (
      <svg className={`w-4 h-3.5 text-gray-400 ${className}`} viewBox="0 0 16 11" fill="currentColor">
        <path d="M11.071.47L5.02 9.033 2.1 6.111 1.093 7.118l3.927 3.927L12.078 1.477l-1.007-1.007z" />
        <path d="M15.01.584l-8.222 9.007-1.02-1.11L14.01.57l1 .014z" />
      </svg>
    );
  }
  // read - blue ticks
  return (
    <svg className={`w-4 h-3.5 text-blue-500 ${className}`} viewBox="0 0 16 11" fill="currentColor">
      <path d="M11.071.47L5.02 9.033 2.1 6.111 1.093 7.118l3.927 3.927L12.078 1.477l-1.007-1.007z" />
      <path d="M15.01.584l-8.222 9.007-1.02-1.11L14.01.57l1 .014z" />
    </svg>
  );
}
