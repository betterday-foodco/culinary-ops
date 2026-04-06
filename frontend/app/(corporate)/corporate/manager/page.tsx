'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCorpUser, clearCorpAuth,
  corpManager, corpPortal,
  type CorpOrder,
} from '../../../lib/corp-api';

const dark    = '#00465e';
const primary = '#4ea2fd';
const green   = '#27ae60';
const cream   = '#faebda';

type Tab = 'overview' | 'orders' | 'employees' | 'invoices';

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: '16px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,70,94,.06)' }}>
      <div style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#7b8c9f', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '1.7rem', fontWeight: 900, color: color ?? dark, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '.75rem', color: '#7b8c9f', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    pending:   { bg: 'rgba(78,162,253,.1)',  text: primary },
    confirmed: { bg: 'rgba(39,174,96,.1)',   text: green },
    delivered: { bg: 'rgba(39,174,96,.15)',  text: '#1a8a47' },
    cancelled: { bg: 'rgba(231,76,60,.1)',   text: '#c0392b' },
  };
  const c = colors[status] ?? { bg: '#f0f4f8', text: '#666' };
  return (
    <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '.72rem', fontWeight: 800, background: c.bg, color: c.text, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

export default function CorporateManagerPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getCorpUser>>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [dashboard, setDashboard] = useState<any>(null);
  const [orders, setOrders] = useState<CorpOrder[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getCorpUser();
    if (!u) { router.replace('/corporate/login'); return; }
    if (u.role !== 'corp_manager') { router.replace('/corporate/work'); return; }
    setUser(u);
    loadDashboard();
  }, [router]);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [dash, ords, emps, invs] = await Promise.allSettled([
        corpManager.getDashboard(),
        corpManager.getOrders(),
        corpManager.getEmployees(),
        corpManager.getInvoices(),
      ]);
      if (dash.status === 'fulfilled') setDashboard(dash.value);
      if (ords.status === 'fulfilled') setOrders((ords.value as any).orders ?? []);
      if (emps.status === 'fulfilled') setEmployees((emps.value as any).employees ?? []);
      if (invs.status === 'fulfilled') setInvoices((invs.value as any).invoices ?? []);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearCorpAuth();
    router.replace('/corporate/login');
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview',  label: '📊 Overview' },
    { key: 'orders',    label: `📦 Orders${orders.length ? ` (${orders.length})` : ''}` },
    { key: 'employees', label: `👥 Team${employees.length ? ` (${employees.length})` : ''}` },
    { key: 'invoices',  label: `🧾 Invoices${invoices.length ? ` (${invoices.length})` : ''}` },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: cream, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: `3px solid #e8edf2`, borderTopColor: primary, animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#7b8c9f', fontSize: '.88rem' }}>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: cream, fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ background: dark, position: 'sticky', top: 0, zIndex: 300 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.05rem' }}>{dashboard?.company?.name ?? 'Manager Dashboard'}</div>
            <div style={{ color: 'rgba(255,255,255,.55)', fontSize: '.72rem' }}>BetterDay for Work — Manager Portal</div>
          </div>
          <button
            onClick={logout}
            style={{ padding: '7px 14px', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', borderRadius: '10px', color: 'rgba(255,255,255,.8)', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
          >Sign Out</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,.08)', overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '11px 16px', fontSize: '.8rem', fontWeight: 800,
              color: tab === t.key ? '#fff' : 'rgba(255,255,255,.45)',
              border: 'none', background: 'transparent', fontFamily: "'DM Sans', sans-serif",
              borderBottom: `3px solid ${tab === t.key ? primary : 'transparent'}`,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: '.15s',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
        {/* ── Overview tab ── */}
        {tab === 'overview' && dashboard && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <StatCard label="Active Employees" value={dashboard.company.employee_count} />
              <StatCard label="Recent Orders (30d)" value={dashboard.recent_orders} />
              <StatCard label="Company Owed (30d)" value={`$${dashboard.totals.company.toFixed(2)}`} color="#9b59b6" />
              <StatCard label="Meals Ordered (30d)" value={dashboard.totals.meals} color={green} />
            </div>

            {/* Par levels */}
            {dashboard.company.par_levels?.length > 0 && (
              <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,70,94,.06)', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '.85rem', fontWeight: 900, color: dark, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '14px' }}>Par Levels</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {dashboard.company.par_levels.map((p: any) => (
                    <div key={p.category_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '.88rem', color: dark, fontWeight: 600 }}>{p.category_id.replace(/_/g, ' ')}</span>
                      <span style={{ fontWeight: 900, color: primary, fontSize: '.95rem' }}>{p.par_quantity}/wk</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent orders preview */}
            <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,70,94,.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '.85rem', fontWeight: 900, color: dark, textTransform: 'uppercase', letterSpacing: '.5px' }}>Recent Orders</h3>
                <button onClick={() => setTab('orders')} style={{ fontSize: '.78rem', color: primary, fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer' }}>View all →</button>
              </div>
              {orders.slice(0, 5).map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f4f4f4' }}>
                  <div>
                    <span style={{ fontWeight: 800, color: dark, fontSize: '.88rem' }}>#{o.order_code}</span>
                    <span style={{ color: '#7b8c9f', fontSize: '.78rem', marginLeft: '8px' }}>{o.items.length} item{o.items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Orders tab ── */}
        {tab === 'orders' && (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 900, color: dark, marginBottom: '16px' }}>All Orders</h2>
            {!orders.length ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#7b8c9f' }}>No orders found.</div>
            ) : orders.map(order => (
              <div key={order.id} style={{ background: '#fff', borderRadius: '16px', padding: '18px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,70,94,.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 900, color: dark, fontSize: '.95rem' }}>Order #{order.order_code}</div>
                    <div style={{ fontSize: '.72rem', color: '#7b8c9f' }}>{new Date(order.created_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <StatusBadge status={order.status} />
                    <div style={{ fontSize: '.78rem', color: dark, fontWeight: 800, marginTop: '4px' }}>
                      Co: ${order.company_cost.toFixed(2)} / Emp: ${order.employee_cost.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {order.items.map(item => (
                    <span key={item.id} style={{ fontSize: '.75rem', fontWeight: 700, padding: '3px 9px', borderRadius: '8px', background: 'rgba(0,70,94,.06)', color: dark }}>{item.meal_name}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Employees tab ── */}
        {tab === 'employees' && (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 900, color: dark, marginBottom: '16px' }}>Team Members</h2>
            {!employees.length ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#7b8c9f' }}>No employees found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {employees.map(emp => (
                  <div key={emp.id} style={{ background: '#fff', borderRadius: '14px', padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,70,94,.06)', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: dark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.82rem', fontWeight: 900, color: '#fff', flexShrink: 0 }}>
                      {emp.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: dark, fontSize: '.92rem' }}>{emp.name}</div>
                      <div style={{ fontSize: '.75rem', color: '#7b8c9f' }}>{emp.email}</div>
                    </div>
                    {emp.benefit_level && (
                      <span style={{ fontSize: '.72rem', fontWeight: 800, padding: '3px 9px', borderRadius: '999px', background: 'rgba(78,162,253,.1)', color: primary }}>{emp.benefit_level}</span>
                    )}
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: emp.is_active ? green : '#ccc' }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Invoices tab ── */}
        {tab === 'invoices' && (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 900, color: dark, marginBottom: '16px' }}>Invoices</h2>
            {!invoices.length ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#7b8c9f' }}>No invoices found.</div>
            ) : invoices.map(inv => (
              <div key={inv.id} style={{ background: '#fff', borderRadius: '16px', padding: '18px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,70,94,.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 900, color: dark, fontSize: '.92rem' }}>{inv.invoice_number}</div>
                  <div style={{ fontSize: '.72rem', color: '#7b8c9f' }}>
                    {new Date(inv.period_start).toLocaleDateString()} – {new Date(inv.period_end).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 900, color: dark, fontSize: '1.1rem' }}>${inv.amount_total?.toFixed(2) ?? '0.00'}</div>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
