'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [station, setStation] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { router.replace('/login'); return; }

    const role = localStorage.getItem('user_role') ?? '';
    // admin can view kitchen portal too, but non-kitchen non-admin go back to dashboard
    if (role !== 'kitchen' && role !== 'admin') {
      router.replace('/dashboard');
      return;
    }

    setStation(localStorage.getItem('user_station') ?? '');
    setName(localStorage.getItem('user_name') ?? '');
  }, [router]);

  function handleLogout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_station');
    localStorage.removeItem('user_name');
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile-first top header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo + station */}
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              C
            </span>
            <div>
              <div className="text-sm font-semibold text-gray-900 leading-tight">
                {name || 'Kitchen'}
              </div>
              {station && (
                <div className="text-xs text-brand-600 font-medium leading-tight">{station}</div>
              )}
            </div>
          </div>

          {/* Nav actions */}
          <div className="flex items-center gap-2">
            <Link
              href="/kitchen/requests"
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                pathname === '/kitchen/requests'
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>🔔</span>
              <span className="hidden sm:inline">Requests</span>
            </Link>

            <Link
              href="/kitchen"
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                pathname === '/kitchen'
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>📋</span>
              <span className="hidden sm:inline">Board</span>
            </Link>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <span>→</span>
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
