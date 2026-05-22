'use client';
import { MessageSquare, BarChart2, Layers, Settings, Bell, Wifi, Megaphone } from 'lucide-react';

type Tab = 'chat' | 'analytics' | 'templates' | 'settings' | 'broadcast';

interface TopNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function TopNav({ activeTab, onTabChange }: TopNavProps) {
  const tabs = [
    { id: 'chat' as const, label: 'Inbox', icon: MessageSquare },
    { id: 'analytics' as const, label: 'Analytics', icon: BarChart2 },
    { id: 'broadcast' as const, label: 'Broadcast', icon: Megaphone },
    { id: 'templates' as const, label: 'Templates', icon: Layers },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="h-12 bg-[#075E54] flex items-center justify-between px-4 shadow-md flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-[#25D366] rounded-lg flex items-center justify-center shadow-sm">
          <svg viewBox="0 0 60 60" className="w-5 h-5" fill="white">
            <path d="M30 5C16.2 5 5 16.2 5 30c0 4.7 1.3 9.2 3.6 13L5 55l12.3-3.5A24.8 24.8 0 0030 55c13.8 0 25-11.2 25-25S43.8 5 30 5zm0 45a19.8 19.8 0 01-10.1-2.7l-.7-.4-7.3 2.1 2-7-.5-.7A19.9 19.9 0 1130 50z"/>
          </svg>
        </div>
        <div>
          <p className="text-white text-sm font-bold leading-tight">Nibirapon</p>
          <p className="text-[#25D366] text-[10px] font-medium">WhatsApp Business</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === id
                ? 'bg-white/20 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 text-[10px] text-[#25D366] font-medium">
          <Wifi size={12} />
          <span className="hidden sm:inline">Connected</span>
        </div>
        <button className="p-1.5 rounded-full hover:bg-white/10 transition-colors relative">
          <Bell size={16} className="text-white/70" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
        </button>
        <div className="w-7 h-7 rounded-full bg-[#25D366]/30 border border-[#25D366]/50 flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">NB</span>
        </div>
      </div>
    </div>
  );
}
