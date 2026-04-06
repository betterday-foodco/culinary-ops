'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, BdCompany, BdEmployee, BdOrder, BdInvoice, BdCompanyDashboard } from '@/app/lib/api';

type Tab = 'companies' | 'employees' | 'orders' | 'invoices';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending:   'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    refunded:  'bg-gray-100 text-gray-500',
    paid:      'bg-green-100 text-green-700',
    unpaid:    'bg-red-100 text-red-700',
    overdue:   'bg-orange-100 text-orange-700',
  };
  const cls = map[status] ?? 'bg-gray-100 text-gray-600';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>;
}

// ─── Company Form Modal ───────────────────────────────────────────────────────

function CompanyModal({
  company,
  onClose,
  onSaved,
}: {
  company: BdCompany | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    id:            company?.id ?? '',
    name:          company?.name ?? '',
    delivery_day:  company?.delivery_day ?? '',
    contact_name:  company?.contact_name ?? '',
    contact_email: company?.contact_email ?? '',
    is_active:     company?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.id) delete payload.id;
      await api.bdUpsertCompany(payload as any);
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-sm font-semibold text-gray-800">
            {company ? 'Edit Company' : 'New Company'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company Name *</label>
            <input
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Day</label>
              <select
                value={form.delivery_day}
                onChange={e => setForm(f => ({ ...f, delivery_day: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">— none —</option>
                {['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Active</label>
              <select
                value={form.is_active ? 'true' : 'false'}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contact Name</label>
            <input
              value={form.contact_name}
              onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contact Email</label>
            <input
              type="email"
              value={form.contact_email}
              onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Employee Form Modal ──────────────────────────────────────────────────────

function EmployeeModal({
  employee,
  companies,
  defaultCompanyId,
  onClose,
  onSaved,
}: {
  employee: BdEmployee | null;
  companies: BdCompany[];
  defaultCompanyId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    id:           employee?.id ?? '',
    company_id:   employee?.company_id ?? defaultCompanyId ?? '',
    name:         employee?.name ?? '',
    email:        employee?.email ?? '',
    role:         employee?.role ?? 'employee',
    employee_code: employee?.employee_code ?? '',
    is_active:    employee?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.id) delete payload.id;
      if (!payload.employee_code) delete payload.employee_code;
      await api.bdUpsertEmployee(payload as any);
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-sm font-semibold text-gray-800">
            {employee ? 'Edit Employee' : 'Add Employee'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company *</label>
            <select
              required
              value={form.company_id}
              onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="">— select company —</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Employee Code <span className="font-normal text-gray-400">(auto if blank)</span></label>
            <input
              value={form.employee_code}
              onChange={e => setForm(f => ({ ...f, employee_code: e.target.value }))}
              placeholder="e.g. EMP001"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── PIN Change Modal ─────────────────────────────────────────────────────────

function PinModal({ companyId, companyName, onClose }: { companyId: string; companyName: string; onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4) return alert('PIN must be at least 4 digits.');
    setSaving(true);
    try {
      await api.bdUpdateCompanyPin(companyId, pin);
      alert(`✓ PIN updated for ${companyName}`);
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-sm font-semibold text-gray-800">Change PIN — {companyName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New PIN (4–8 digits)</label>
            <input
              required
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,8}"
              maxLength={8}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full border rounded-lg px-3 py-2 text-sm text-center tracking-widest text-xl focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="••••"
            />
            <p className="text-xs text-gray-400 mt-1">Managers use this PIN to log in at {companyName}.</p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {saving ? 'Saving…' : 'Update PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Company Detail Drawer ────────────────────────────────────────────────────

function CompanyDrawer({
  company,
  onClose,
  onEditEmployee,
  onAddEmployee,
  onChangePin,
}: {
  company: BdCompany;
  onClose: () => void;
  onEditEmployee: (emp: BdEmployee) => void;
  onAddEmployee: (companyId: string) => void;
  onChangePin: (companyId: string, name: string) => void;
}) {
  type DrawerTab = 'overview' | 'employees' | 'orders' | 'invoices';
  const [tab, setTab] = useState<DrawerTab>('overview');
  const [dash, setDash]     = useState<BdCompanyDashboard | null>(null);
  const [emps, setEmps]     = useState<BdEmployee[]>([]);
  const [orders, setOrders] = useState<BdOrder[]>([]);
  const [invoices, setInvoices] = useState<BdInvoice[]>([]);
  const [loading, setLoading]   = useState(false);

  // Load each tab's data when tab changes
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (tab === 'overview') {
          const r = await api.bdGetCompanyDashboard(company.id);
          setDash(r);
        } else if (tab === 'employees') {
          const r = await api.bdGetCompanyEmployees(company.id);
          setEmps(r.employees);
        } else if (tab === 'orders') {
          const r = await api.bdGetCompanyOrders(company.id, 50);
          setOrders(r.orders);
        } else if (tab === 'invoices') {
          const r = await api.bdGetCompanyInvoices(company.id);
          setInvoices(r.invoices);
        }
      } catch (e: any) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, [tab, company.id]);

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />
      {/* Panel */}
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div>
            <h2 className="font-semibold text-gray-800">{company.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {company.delivery_day ?? 'No delivery day'} · {company._count?.employees ?? '?'} employees
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onChangePin(company.id, company.name)}
              className="px-3 py-1.5 text-xs border border-orange-200 text-orange-600 rounded-lg hover:bg-orange-50"
            >
              🔑 Change PIN
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4">
          {(['overview', 'employees', 'orders', 'invoices'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors capitalize ${
                tab === t ? 'border-brand-500 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && <p className="text-sm text-gray-400 text-center py-10">Loading…</p>}

          {/* Overview */}
          {!loading && tab === 'overview' && dash && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Employees',     value: dash.company.employee_count },
                  { label: 'Orders (30d)',  value: dash.recent_orders },
                  { label: 'Employee Cost', value: fmt(dash.totals.employee) },
                  { label: 'Company Cost',  value: fmt(dash.totals.company) },
                  { label: 'BD Revenue',    value: fmt(dash.totals.bd) },
                  { label: 'Meals (30d)',   value: dash.totals.meals },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{s.label}</p>
                    <p className="text-lg font-semibold text-gray-800 mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>
              {dash.company.par_levels.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-600 mb-2">Par Levels</h3>
                  <div className="divide-y border rounded-lg overflow-hidden">
                    {dash.company.par_levels.map((p, i) => (
                      <div key={i} className="flex justify-between px-4 py-2 text-sm">
                        <span className="text-gray-700">{p.category_name}</span>
                        <span className="font-medium text-gray-800">{p.max_meals_week} meals/wk</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Employees */}
          {!loading && tab === 'employees' && (
            <div className="space-y-2">
              <div className="flex justify-end mb-3">
                <button
                  onClick={() => onAddEmployee(company.id)}
                  className="px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                >
                  + Add Employee
                </button>
              </div>
              {emps.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No employees found.</p>}
              <div className="divide-y border rounded-lg overflow-hidden">
                {emps.map(emp => (
                  <div key={emp.id} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-gray-800">{emp.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{emp.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{emp.employee_code}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${emp.role === 'manager' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {emp.role}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${emp.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {emp.is_active ? 'active' : 'inactive'}
                      </span>
                      <button
                        onClick={() => onEditEmployee(emp)}
                        className="text-xs text-gray-500 hover:text-brand-600 underline"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Orders */}
          {!loading && tab === 'orders' && (
            <div className="space-y-2">
              {orders.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No orders found.</p>}
              {orders.map(o => (
                <details key={o.id} className="border rounded-lg overflow-hidden">
                  <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-gray-50 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-gray-500">{o.order_code}</span>
                      {statusBadge(o.status)}
                      <span className="text-gray-700 text-xs">{o.employee?.name ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{fmtDate(o.delivery_date)}</span>
                      <span className="font-medium text-gray-700">{fmt(o.employee_cost + o.company_cost)}</span>
                    </div>
                  </summary>
                  <div className="px-4 py-3 border-t bg-gray-50 space-y-1">
                    {o.items.map(item => (
                      <div key={item.id} className="flex justify-between text-xs text-gray-600">
                        <span>{item.quantity}× {item.meal_recipe?.display_name ?? item.meal_name}</span>
                        <span>{fmt(item.unit_price_employee + item.unit_price_company)}</span>
                      </div>
                    ))}
                    <div className="pt-2 flex gap-4 text-xs text-gray-500 border-t mt-2">
                      <span>Employee: {fmt(o.employee_cost)}</span>
                      <span>Company: {fmt(o.company_cost)}</span>
                      <span>BD: {fmt(o.bd_cost)}</span>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}

          {/* Invoices */}
          {!loading && tab === 'invoices' && (
            <div className="space-y-2">
              {invoices.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No invoices found.</p>}
              <div className="divide-y border rounded-lg overflow-hidden">
                {invoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <p className="font-mono text-xs text-gray-500">{inv.invoice_number}</p>
                      <p className="text-gray-700 text-xs mt-0.5">
                        {fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {statusBadge(inv.status)}
                      <span className="font-semibold text-gray-800">{fmt(inv.total_amount)}</span>
                      {inv.pdf_url && (
                        <a href={inv.pdf_url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline text-xs">PDF</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-gray-50 flex items-center justify-between">
          <button
            onClick={() => onAddEmployee(company.id)}
            className="px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700"
          >
            + Add Employee
          </button>
          <span className={`text-xs font-medium px-2 py-1 rounded ${company.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {company.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BdCorporateAdminPage() {
  const [companies, setCompanies]         = useState<BdCompany[]>([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');

  // Modals
  const [companyModal, setCompanyModal]   = useState<{ company: BdCompany | null } | null>(null);
  const [employeeModal, setEmployeeModal] = useState<{ emp: BdEmployee | null; companyId?: string } | null>(null);
  const [pinModal, setPinModal]           = useState<{ id: string; name: string } | null>(null);
  const [drawer, setDrawer]               = useState<BdCompany | null>(null);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.bdGetAllCompanies();
      setCompanies(r.companies);
    } catch (e: any) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">BD Corporate Admin</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage corporate clients, employees and orders</p>
        </div>
        <button
          onClick={() => setCompanyModal({ company: null })}
          className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium"
        >
          + New Company
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500">Total Companies</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{companies.length}</p>
          <p className="text-xs text-gray-400">{companies.filter(c => c.is_active).length} active</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500">Total Employees</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {companies.reduce((s, c) => s + (c._count?.employees ?? 0), 0)}
          </p>
          <p className="text-xs text-gray-400">across all companies</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500">Total Orders</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {companies.reduce((s, c) => s + (c._count?.orders ?? 0), 0)}
          </p>
          <p className="text-xs text-gray-400">all time</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search companies…"
          className="w-full max-w-sm border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {/* Companies table */}
      {loading ? (
        <div className="text-center py-20 text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Company</th>
                <th className="text-left px-4 py-3">Delivery Day</th>
                <th className="text-left px-4 py-3">Contact</th>
                <th className="text-right px-4 py-3">Employees</th>
                <th className="text-right px-4 py-3">Orders</th>
                <th className="text-right px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">No companies found.</td></tr>
              )}
              {filtered.map(c => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setDrawer(c)}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                  <td className="px-4 py-3 text-gray-500">{c.delivery_day ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.contact_email ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-700">{c._count?.employees ?? 0}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{c._count?.orders ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setCompanyModal({ company: c })}
                        className="px-2 py-1 text-xs border rounded hover:bg-gray-50 text-gray-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setPinModal({ id: c.id, name: c.name })}
                        className="px-2 py-1 text-xs border border-orange-200 rounded hover:bg-orange-50 text-orange-600"
                      >
                        🔑 PIN
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Company Modal */}
      {companyModal !== null && (
        <CompanyModal
          company={companyModal.company}
          onClose={() => setCompanyModal(null)}
          onSaved={loadCompanies}
        />
      )}

      {/* Employee Modal */}
      {employeeModal !== null && (
        <EmployeeModal
          employee={employeeModal.emp}
          companies={companies}
          defaultCompanyId={employeeModal.companyId}
          onClose={() => setEmployeeModal(null)}
          onSaved={loadCompanies}
        />
      )}

      {/* PIN Modal */}
      {pinModal && (
        <PinModal
          companyId={pinModal.id}
          companyName={pinModal.name}
          onClose={() => setPinModal(null)}
        />
      )}

      {/* Company Drawer */}
      {drawer && (
        <CompanyDrawer
          company={drawer}
          onClose={() => setDrawer(null)}
          onEditEmployee={emp => setEmployeeModal({ emp })}
          onAddEmployee={companyId => setEmployeeModal({ emp: null, companyId })}
          onChangePin={(id, name) => setPinModal({ id, name })}
        />
      )}
    </div>
  );
}
