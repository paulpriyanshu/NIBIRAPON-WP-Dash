'use client';
import { getInitials, getAvatarColor } from '@/lib/utils';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  className?: string;
}

const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base', xl: 'w-16 h-16 text-xl' };

export default function Avatar({ name, size = 'md', isOnline, className = '' }: AvatarProps) {
  const initials = getInitials(name);
  const bg = getAvatarColor(name);
  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      <div
        className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold text-white select-none`}
        style={{ backgroundColor: bg }}
      >
        {initials}
      </div>
      {isOnline !== undefined && (
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
            isOnline ? 'bg-green-500' : 'bg-gray-400'
          }`}
        />
      )}
    </div>
  );
}
