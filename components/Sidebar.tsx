'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, BarChart2, Layers, Settings, Megaphone, Moon, Sun, Bell, Users, LogOut } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useEffect, useState } from 'react';

interface SessionUser { userId: string; name: string; email: string | null; username: string | null; role: string; }

const NAV = [
  { href: '/inbox',     label: 'Inbox',     icon: MessageSquare },
  { href: '/broadcast', label: 'Broadcast', icon: Megaphone },
  { href: '/templates', label: 'Templates', icon: Layers },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/settings',  label: 'Settings',  icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { theme, toggle } = useTheme();
  const [me, setMe] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.ok ? r.json() : null).then((d) => d && setMe(d));
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const initials = me?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'NB';
  const displayName = me?.name || 'Admin';
  const displaySub  = me?.role ? me.role.charAt(0).toUpperCase() + me.role.slice(1) : 'Connected';

  const allNav = [
    ...NAV,
    ...(me?.role === 'admin' ? [{ href: '/users', label: 'Users', icon: Users }] : []),
  ];

  return (
    <>
      {/* ── Desktop / tablet left sidebar ───────────────────────────── */}
      <aside className="hidden md:flex flex-col w-16 lg:w-56 h-screen bg-[#075E54] dark:bg-[#1f2c34] border-r border-black/10 flex-shrink-0 z-30">

        {/* Brand */}
        <div className="px-3 py-4 flex items-center gap-3 border-b border-white/10">
          <div className="w-8 h-8 bg-[#25D366] rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
            <svg viewBox="0 0 60 60" className="w-5 h-5" fill="white">
              <path d="M30 5C16.2 5 5 16.2 5 30c0 4.7 1.3 9.2 3.6 13L5 55l12.3-3.5A24.8 24.8 0 0030 55c13.8 0 25-11.2 25-25S43.8 5 30 5zm0 45a19.8 19.8 0 01-10.1-2.7l-.7-.4-7.3 2.1 2-7-.5-.7A19.9 19.9 0 1130 50z"/>
            </svg>
          </div>
          <div className="hidden lg:block min-w-0">
            <p className="text-white text-sm font-bold leading-tight truncate">Nibirapon</p>
            <p className="text-[#25D366] text-[10px] font-medium truncate">WhatsApp Business</p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 flex flex-col gap-1 px-2 overflow-y-auto">
          {allNav.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-2 py-2.5 rounded-xl transition-all ${
                  active ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon size={18} className="flex-shrink-0" />
                <span className="hidden lg:block text-sm font-medium truncate">{label}</span>
                {active && <div className="hidden lg:block ml-auto w-1.5 h-1.5 rounded-full bg-[#25D366]" />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-2 py-3 border-t border-white/10 flex flex-col gap-1">
          <button onClick={toggle}
            className="flex items-center gap-3 px-2 py-2.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all">
            {theme === 'dark' ? <Sun size={18} className="flex-shrink-0" /> : <Moon size={18} className="flex-shrink-0" />}
            <span className="hidden lg:block text-sm font-medium">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>

          <button className="flex items-center gap-3 px-2 py-2.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all relative">
            <Bell size={18} className="flex-shrink-0" />
            <span className="hidden lg:block text-sm font-medium">Notifications</span>
            <span className="absolute top-2 left-2 w-1.5 h-1.5 bg-red-500 rounded-full md:left-6 lg:left-auto lg:right-3" />
          </button>

          <button onClick={logout}
            className="flex items-center gap-3 px-2 py-2.5 rounded-xl text-white/60 hover:text-red-300 hover:bg-red-500/10 transition-all">
            <LogOut size={18} className="flex-shrink-0" />
            <span className="hidden lg:block text-sm font-medium">Logout</span>
          </button>

          {/* User info */}
          <div className="flex items-center gap-3 px-2 py-2 mt-1">
            <div className="w-8 h-8 rounded-full bg-[#25D366]/30 border border-[#25D366]/50 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[10px] font-bold">{initials}</span>
            </div>
            <div className="hidden lg:block min-w-0">
              <p className="text-white text-xs font-semibold truncate">{displayName}</p>
              <p className="text-[#25D366] text-[10px] truncate">{displaySub}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ────────────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-[#075E54] dark:bg-[#1f2c34] flex items-center justify-between px-4 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#25D366] rounded-lg flex items-center justify-center shadow-sm">
            <svg viewBox="0 0 60 60" className="w-5 h-5" fill="white">
              <path d="M30 5C16.2 5 5 16.2 5 30c0 4.7 1.3 9.2 3.6 13L5 55l12.3-3.5A24.8 24.8 0 0030 55c13.8 0 25-11.2 25-25S43.8 5 30 5z"/>
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-bold leading-tight">Nibirapon</p>
            <p className="text-[#25D366] text-[9px] font-medium">WhatsApp Business</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggle} className="p-2 rounded-full hover:bg-white/10 text-white/70 transition-colors">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={logout} className="p-2 rounded-full hover:bg-red-500/20 text-white/70 transition-colors">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ── Mobile bottom tab bar ────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#075E54] dark:bg-[#1f2c34] border-t border-black/10 flex items-stretch">
        {allNav.slice(0, 5).map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${active ? 'text-white' : 'text-white/50'}`}
            >
              <div className={`p-1 rounded-lg ${active ? 'bg-white/20' : ''}`}>
                <Icon size={18} />
              </div>
              <span className="text-[9px] font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
