'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { api } from '../lib/api';

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [station, setStation] = useState('');
  const [name, setName] = useState('');
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { router.replace('/login'); return; }
    const role = localStorage.getItem('user_role') ?? '';
    if (role !== 'kitchen' && role !== 'admin') { router.replace('/dashboard'); return; }
    setStation(localStorage.getItem('user_station') ?? '');
    setName(localStorage.getItem('user_name') ?? '');
  }, [router]);

  const pollUnread = useCallback(async () => {
    try {
      const { unread: count } = await api.getKitchenUnreadCount();
      setUnread(count);
    } catch {}
  }, []);

  useEffect(() => {
    pollUnread();
    const timer = setInterval(pollUnread, 30_000); // poll every 30s
    return () => clearInterval(timer);
  }, [pollUnread]);

  function handleLogout() {
    ['access_token','user_role','user_station','user_name'].forEach(k => localStorage.removeItem(k));
    router.push('/login');
  }

  const tabs = [
    { href: '/kitchen',           label: 'Cooking',     icon: '🍳' },
    { href: '/kitchen/prep',      label: 'Prep List',   icon: '📋' },
    { href: '/kitchen/tasks',     label: 'Daily Tasks', icon: '✅' },
    { href: '/kitchen/requests',  label: 'Requests',    icon: '🔔' },
    { href: '/kitchen/messages',  label: 'Messages',    icon: '💬', badge: unread },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 bg-bd-yellow rounded-xl flex items-center justify-center text-brand-700 font-black text-xs tracking-tight shadow-sm">BD</span>
            <div>
              <div className="text-sm font-semibold text-gray-900 leading-tight">{name || 'Kitchen'}</div>
              {station && <div className="text-xs text-brand-600 font-medium leading-tight">{station}</div>}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <span>→</span>
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 pb-24">{children}</main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-20 safe-area-pb shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="max-w-2xl mx-auto px-2 flex items-center justify-around">
          {tabs.map(({ href, label, icon, badge }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 px-3 rounded-2xl transition-all min-w-0 ${active ? 'text-brand-600' : 'text-gray-400 hover:text-gray-500'}`}
              >
                {active && <span className="absolute inset-0 bg-brand-50 rounded-2xl" />}
                <span className="relative text-xl leading-none">
                  {icon}
                  {badge != null && badge > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className={`relative text-[10px] font-bold ${active ? 'text-brand-600' : 'text-gray-400'}`}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
