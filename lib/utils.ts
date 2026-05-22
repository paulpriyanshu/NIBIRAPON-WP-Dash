import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  return format(date, 'h:mm a');
}

export function formatConversationTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MM/dd/yy');
}

export function formatDateSeparator(timestamp: number): string {
  const date = new Date(timestamp);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

export function formatLastSeen(timestamp: string): string {
  return `last seen ${formatDistanceToNow(new Date(timestamp), { addSuffix: true })}`;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getAvatarColor(name: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function shouldShowDateSeparator(messages: { timestamp: number }[], index: number): boolean {
  if (index === 0) return true;
  const current = new Date(messages[index].timestamp);
  const previous = new Date(messages[index - 1].timestamp);
  return current.toDateString() !== previous.toDateString();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Normalize a phone number to Meta E.164 format (no + prefix).
 * - Strips +, spaces, dashes, parentheses
 * - For bare 10-digit Indian numbers (starting with 6-9), prepends 91
 * - Numbers already carrying a country code are kept as-is
 */
export function normalizePhone(raw: string): string {
  // Remove +, spaces, dashes, parentheses
  const stripped = raw.replace(/[\s\-\(\)\+]/g, '');
  // Bare 10-digit Indian mobile (starts with 6/7/8/9)
  if (/^[6-9]\d{9}$/.test(stripped)) return `91${stripped}`;
  return stripped;
}
