'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const PRIMARY_NAV = [
  { href: '/dashboard',   label: 'Dashboard',        icon: '⊞' },
  { href: '/production',  label: 'Production Plans',  icon: '📅' },
  { href: '/inventory',   label: 'Inventory',         icon: '📦' },
  { href: '/meals',       label: 'Meal Recipes',      icon: '🍽' },
  { href: '/sub-recipes', label: 'Sub-Recipes',       icon: '🍲' },
  { href: '/ingredients', label: 'Ingredients',       icon: '🥦' },
];

const OTHER_NAV = [
  { href: '/meals/pricing',         label: 'Meal Pricing',       icon: '💲' },
  { href: '/reports/meals',         label: 'Meals Report',       icon: '📋' },
  { href: '/reports/cooking',       label: 'Cooking Report',     icon: '👨‍🍳' },
  { href: '/reports/sub-recipes',   label: 'Sub-Recipes Report', icon: '📊' },
  { href: '/reports/shopping-list', label: 'Shopping List',      icon: '🛒' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [othersOpen, setOthersOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('');

  // Auto-open Others if current page lives there
  useEffect(() => {
    const inOthers = OTHER_NAV.some((n) => pathname.startsWith(n.href));
    if (inOthers) setOthersOpen(true);
  }, [pathname]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { router.push('/login'); return; }
    const role = localStorage.getItem('user_role') ?? '';
    setUserRole(role);
    // Kitchen users don't belong in the admin dashboard
    if (role === 'kitchen') { router.replace('/kitchen'); return; }
  }, [router]);

  function handleLogout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_station');
    localStorage.removeItem('user_name');
    router.push('/login');
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === href;
    return pathname === href || pathname.startsWith(href + '/') || pathname.startsWith(href + '?');
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-gray-200">
          <span className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center text-white font-bold text-sm mr-2.5">
            C
          </span>
          <span className="font-semibold text-gray-900 text-sm">Culinary Ops</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {/* Primary nav */}
          <div className="space-y-0.5">
            {PRIMARY_NAV.map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive(href)
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="text-base leading-none">{icon}</span>
                {label}
              </Link>
            ))}
          </div>

          {/* Divider */}
          <div className="my-3 border-t border-gray-100" />

          {/* Settings */}
          <Link
            href="/settings"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive('/settings')
                ? 'bg-brand-50 text-brand-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <span className="text-base leading-none">⚙</span>
            Settings
          </Link>

          {/* Kitchen Staff link — admin only */}
          {userRole === 'admin' && (
            <Link
              href="/settings/staff"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive('/settings/staff')
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className="text-base leading-none">👨‍🍳</span>
              Kitchen Staff
            </Link>
          )}

          {/* Others (collapsible) */}
          <div className="mt-1">
            <button
              onClick={() => setOthersOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base leading-none">⋯</span>
                Others
              </div>
              <span className={`text-xs transition-transform ${othersOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {othersOpen && (
              <div className="mt-0.5 ml-2 pl-3 border-l border-gray-100 space-y-0.5">
                {OTHER_NAV.map(({ href, label, icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      isActive(href)
                        ? 'bg-brand-50 text-brand-700 font-medium'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                  >
                    <span className="leading-none">{icon}</span>
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <span className="text-base leading-none">→</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
