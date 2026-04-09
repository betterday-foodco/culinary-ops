'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  api,
  BdCompanyFull,
  BdBenefitLevel,
  BdParLevel,
} from '@/app/lib/api';

// ─── BetterDay brand palette ─────────────────────────────────────────────────
const C = {
  navy: '#003141',
  cream: '#FAEBDA',
  yellow: '#FFC600',
  sky: '#4EA2FD',
  green: '#27ae60',
  red: '#e74c3c',
};

type Tab = 'details' | 'delivery' | 'billing' | 'subsidy';

const TABS: { key: Tab; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'billing', label: 'Billing' },
  { key: 'subsidy', label: 'Subsidy' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
        active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[.65rem] font-extrabold uppercase tracking-wider text-gray-500 mb-1">
      {children}
    </label>
  );
}

function Input({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4EA2FD] ${
          readOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'
        }`}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4EA2FD]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50"
      style={{ backgroundColor: C.navy }}
    >
      {saving ? 'Saving...' : 'Save Changes'}
    </button>
  );
}

// ─── Tab panels ─────────────────────────────────────────────────────────────

function DetailsTab({
  company,
  extra,
  onChange,
  onExtraChange,
  saving,
  onSave,
}: {
  company: BdCompanyFull;
  extra: Record<string, unknown>;
  onChange: (field: string, val: unknown) => void;
  onExtraChange: (field: string, val: unknown) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-sm font-extrabold uppercase tracking-wider mb-4" style={{ color: C.navy }}>
          Company Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input label="Company ID" value={company.id} readOnly />
          <Input label="Name" value={company.name} onChange={(v) => onChange('name', v)} />
          <Select
            label="Status"
            value={company.is_active ? 'active' : 'inactive'}
            onChange={(v) => onChange('is_active', v === 'active')}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
          <Input
            label="Domain"
            value={String(extra.Domain ?? '')}
            onChange={(v) => onExtraChange('Domain', v)}
            placeholder="e.g. company.com"
          />
          <Input
            label="Allowed Email Domain (security)"
            value={(company as any).allowed_email_domain ?? ''}
            onChange={(v) => onChange('allowed_email_domain', v || null)}
            placeholder="e.g. brockhealth.com — leave blank to allow any email"
          />
          <Input
            label="Stripe Customer ID"
            value={String(extra.StripeCustomerID ?? '')}
            onChange={(v) => onExtraChange('StripeCustomerID', v)}
            placeholder="cus_..."
          />
          <Input
            label="QuickBooks ID"
            value={String(extra.QuickBooksID ?? '')}
            onChange={(v) => onExtraChange('QuickBooksID', v)}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-sm font-extrabold uppercase tracking-wider mb-4" style={{ color: C.navy }}>
          Primary Contact
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Input label="Contact Name" value={company.contact_name ?? ''} onChange={(v) => onChange('contact_name', v)} />
          <Input label="Contact Email" value={company.contact_email ?? ''} onChange={(v) => onChange('contact_email', v)} type="email" />
          <Input label="Contact Phone" value={company.contact_phone ?? ''} onChange={(v) => onChange('contact_phone', v)} type="tel" />
        </div>
      </div>

      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={onSave} />
      </div>
    </div>
  );
}

function DeliveryTab({
  company,
  extra,
  onChange,
  onExtraChange,
  saving,
  onSave,
}: {
  company: BdCompanyFull;
  extra: Record<string, unknown>;
  onChange: (field: string, val: unknown) => void;
  onExtraChange: (field: string, val: unknown) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-sm font-extrabold uppercase tracking-wider mb-4" style={{ color: C.navy }}>
          Delivery Address
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input label="Address" value={company.address ?? ''} onChange={(v) => onChange('address', v)} />
          <Input
            label="Address Line 2"
            value={String(extra.Address2 ?? '')}
            onChange={(v) => onExtraChange('Address2', v)}
          />
          <Input label="City" value={company.city ?? ''} onChange={(v) => onChange('city', v)} />
          <Input label="Province" value={company.province ?? ''} onChange={(v) => onChange('province', v)} />
          <Input label="Postal Code" value={company.postal_code ?? ''} onChange={(v) => onChange('postal_code', v)} />
          <Input
            label="Gate Code"
            value={String(extra.GateCode ?? '')}
            onChange={(v) => onExtraChange('GateCode', v)}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-sm font-extrabold uppercase tracking-wider mb-4" style={{ color: C.navy }}>
          Delivery Preferences
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input
            label="Business Hours"
            value={String(extra.BusinessHours ?? '')}
            onChange={(v) => onExtraChange('BusinessHours', v)}
            placeholder="e.g. 8am - 5pm"
          />
          <Input label="Delivery Day" value={company.delivery_day ?? ''} onChange={(v) => onChange('delivery_day', v)} placeholder="e.g. Monday" />
          <div className="md:col-span-2">
            <Label>Delivery Notes</Label>
            <textarea
              value={company.delivery_notes ?? ''}
              onChange={(e) => onChange('delivery_notes', e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4EA2FD] resize-none"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={onSave} />
      </div>
    </div>
  );
}

function BillingTab({
  extra,
  onExtraChange,
  saving,
  onSave,
}: {
  extra: Record<string, unknown>;
  onExtraChange: (field: string, val: unknown) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-sm font-extrabold uppercase tracking-wider mb-4" style={{ color: C.navy }}>
          Billing Configuration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Select
            label="Invoice Frequency"
            value={String(extra.BillingCycle ?? 'weekly')}
            onChange={(v) => onExtraChange('BillingCycle', v)}
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'biweekly', label: 'Biweekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
          <Select
            label="Payment Terms"
            value={String(extra.PaymentTerms ?? 'net30')}
            onChange={(v) => onExtraChange('PaymentTerms', v)}
            options={[
              { value: 'net15', label: 'Net 15' },
              { value: 'net30', label: 'Net 30' },
              { value: 'net45', label: 'Net 45' },
            ]}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <SaveButton saving={saving} onClick={onSave} />
      </div>
    </div>
  );
}

function SubsidyTab({
  companyId,
  parLevels,
  setParLevels,
  benefitLevels,
  setBenefitLevels,
  savingPar,
  savingBenefit,
  onSavePar,
  onSaveBenefit,
}: {
  companyId: string;
  parLevels: BdParLevel[];
  setParLevels: React.Dispatch<React.SetStateAction<BdParLevel[]>>;
  benefitLevels: BdBenefitLevel[];
  setBenefitLevels: React.Dispatch<React.SetStateAction<BdBenefitLevel[]>>;
  savingPar: boolean;
  savingBenefit: boolean;
  onSavePar: () => void;
  onSaveBenefit: () => void;
}) {
  function updatePar(idx: number, field: keyof BdParLevel, val: unknown) {
    setParLevels((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  }

  function addParRow() {
    setParLevels((prev) => [
      ...prev,
      { id: '', company_id: companyId, category_id: '', category_name: '', par_quantity: 0 },
    ]);
  }

  function removeParRow(idx: number) {
    setParLevels((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateBenefit(idx: number, field: keyof BdBenefitLevel, val: unknown) {
    setBenefitLevels((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  }

  function addBenefitRow() {
    setBenefitLevels((prev) => [
      ...prev,
      {
        id: '',
        company_id: companyId,
        level_id: '',
        level_name: '',
        level_order: prev.length,
        free_meals_week: 0,
        max_meals_week: 0,
        full_price: 0,
        tier_config: null,
      },
    ]);
  }

  function removeBenefitRow(idx: number) {
    setBenefitLevels((prev) => prev.filter((_, i) => i !== idx));
  }

  const thClass = 'text-[.6rem] font-extrabold uppercase tracking-wider text-gray-500 text-left pb-2 px-2';
  const tdInput =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4EA2FD]';

  return (
    <div className="space-y-8">
      {/* Par Levels */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: C.navy }}>
            Par Levels
          </h3>
          <button
            onClick={addParRow}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors"
            style={{ backgroundColor: C.sky }}
          >
            + Add Row
          </button>
        </div>

        {parLevels.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No par levels configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={thClass}>Category ID</th>
                  <th className={thClass}>Category Name</th>
                  <th className={thClass}>Par Quantity</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {parLevels.map((row, idx) => (
                  <tr key={idx} className="border-t border-gray-50">
                    <td className="py-2 px-2">
                      <input
                        className={tdInput}
                        value={row.category_id}
                        onChange={(e) => updatePar(idx, 'category_id', e.target.value)}
                        placeholder="category-id"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        className={tdInput}
                        value={row.category_name ?? ''}
                        onChange={(e) => updatePar(idx, 'category_name', e.target.value)}
                        placeholder="Category Name"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        className={tdInput}
                        value={row.par_quantity}
                        onChange={(e) => updatePar(idx, 'par_quantity', Number(e.target.value))}
                        min={0}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() => removeParRow(idx)}
                        className="text-red-400 hover:text-red-600 text-sm font-bold"
                        title="Remove row"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <SaveButton saving={savingPar} onClick={onSavePar} />
        </div>
      </div>

      {/* Benefit Levels */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: C.navy }}>
            Benefit Levels
          </h3>
          <button
            onClick={addBenefitRow}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors"
            style={{ backgroundColor: C.sky }}
          >
            + Add Row
          </button>
        </div>

        {benefitLevels.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No benefit levels configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={thClass}>Level Name</th>
                  <th className={thClass}>Free Meals / Week</th>
                  <th className={thClass}>Max Meals / Week</th>
                  <th className={thClass}>Full Price</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {benefitLevels.map((row, idx) => (
                  <tr key={idx} className="border-t border-gray-50">
                    <td className="py-2 px-2">
                      <input
                        className={tdInput}
                        value={row.level_name ?? ''}
                        onChange={(e) => updateBenefit(idx, 'level_name', e.target.value)}
                        placeholder="Level Name"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        className={tdInput}
                        value={row.free_meals_week}
                        onChange={(e) => updateBenefit(idx, 'free_meals_week', Number(e.target.value))}
                        min={0}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        className={tdInput}
                        value={row.max_meals_week}
                        onChange={(e) => updateBenefit(idx, 'max_meals_week', Number(e.target.value))}
                        min={0}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        step="0.01"
                        className={tdInput}
                        value={row.full_price}
                        onChange={(e) => updateBenefit(idx, 'full_price', Number(e.target.value))}
                        min={0}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() => removeBenefitRow(idx)}
                        className="text-red-400 hover:text-red-600 text-sm font-bold"
                        title="Remove row"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Tier config display */}
            {benefitLevels.some((b) => b.tier_config && Object.keys(b.tier_config).length > 0) && (
              <div className="mt-6 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">Tier Pricing Details</h4>
                {benefitLevels
                  .filter((b) => b.tier_config && Object.keys(b.tier_config).length > 0)
                  .map((b, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <p className="text-xs font-bold mb-2" style={{ color: C.navy }}>
                        {b.level_name ?? 'Unnamed Level'}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {['free', 'tier1', 'tier2', 'tier3'].map((tierKey) => {
                          const val = (b.tier_config as Record<string, unknown>)?.[tierKey];
                          if (val === undefined && val === null) return null;
                          return (
                            <div key={tierKey} className="text-center">
                              <p className="text-[.6rem] font-bold uppercase text-gray-400">{tierKey}</p>
                              <p className="text-sm font-bold" style={{ color: C.navy }}>
                                {typeof val === 'number' ? `$${val.toFixed(2)}` : String(val ?? '---')}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <SaveButton saving={savingBenefit} onClick={onSaveBenefit} />
        </div>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function CompanyEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [company, setCompany] = useState<BdCompanyFull | null>(null);
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('details');
  const [saving, setSaving] = useState(false);

  // Subsidy tab state
  const [parLevels, setParLevels] = useState<BdParLevel[]>([]);
  const [benefitLevels, setBenefitLevels] = useState<BdBenefitLevel[]>([]);
  const [savingPar, setSavingPar] = useState(false);
  const [savingBenefit, setSavingBenefit] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [compRes, parRes, benefitRes] = await Promise.all([
        api.bdGetCompanyDetail(id),
        api.bdGetCompanyParLevels(id),
        api.bdGetCompanyBenefitLevels(id),
      ]);
      if (!compRes.ok) throw new Error('Failed to load company');
      const c = compRes.company;
      setCompany(c);
      setExtra(c.extra ?? {});
      setParLevels(parRes.ok ? parRes.par_levels : c.par_levels ?? []);
      setBenefitLevels(benefitRes.ok ? benefitRes.benefit_levels : c.benefit_levels ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  // Field updaters
  function onChange(field: string, val: unknown) {
    setCompany((prev) => (prev ? { ...prev, [field]: val } : prev));
  }
  function onExtraChange(field: string, val: unknown) {
    setExtra((prev) => ({ ...prev, [field]: val }));
  }

  // Save company fields (Details, Delivery, Billing tabs)
  async function saveCompany() {
    if (!company) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: company.name,
        is_active: company.is_active,
        contact_name: company.contact_name,
        contact_email: company.contact_email,
        contact_phone: company.contact_phone,
        address: company.address,
        city: company.city,
        province: company.province,
        postal_code: company.postal_code,
        delivery_day: company.delivery_day,
        delivery_notes: company.delivery_notes,
        extra,
      };
      const res = await api.bdUpdateCompany(id, payload);
      if (!res.ok) throw new Error('Save failed');
      await load();
    } catch (err: any) {
      alert(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function saveParLevels() {
    setSavingPar(true);
    try {
      const res = await api.bdUpsertParLevels(id, parLevels);
      if (!res.ok) throw new Error('Save failed');
      await load();
    } catch (err: any) {
      alert(err.message ?? 'Failed to save par levels');
    } finally {
      setSavingPar(false);
    }
  }

  async function saveBenefitLevels() {
    setSavingBenefit(true);
    try {
      const res = await api.bdUpsertBenefitLevels(id, benefitLevels);
      if (!res.ok) throw new Error('Save failed');
      await load();
    } catch (err: any) {
      alert(err.message ?? 'Failed to save benefit levels');
    } finally {
      setSavingBenefit(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.cream }}>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: C.navy, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: C.cream }}>
        <p className="text-red-600 font-bold">{error || 'Company not found'}</p>
        <button onClick={() => router.push('/corporate-admin')} className="text-sm underline" style={{ color: C.navy }}>
          Back to Companies
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.cream, fontFamily: "'DM Sans', sans-serif" }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Back button */}
        <button
          onClick={() => router.push('/corporate-admin')}
          className="inline-flex items-center gap-1.5 text-sm font-bold mb-6 hover:underline"
          style={{ color: C.navy }}
        >
          <span className="text-lg leading-none">&larr;</span> Back to Companies
        </button>

        {/* Header */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black" style={{ color: C.navy }}>
                {company.name}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <StatusBadge active={company.is_active} />
                {company.plan_type && (
                  <span className="text-xs font-bold text-gray-400 uppercase">{company.plan_type}</span>
                )}
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-[.6rem] font-extrabold uppercase tracking-wider text-gray-400">Employees</p>
                <p className="text-xl font-black" style={{ color: C.navy }}>{company._count.employees}</p>
              </div>
              <div className="text-center">
                <p className="text-[.6rem] font-extrabold uppercase tracking-wider text-gray-400">Orders</p>
                <p className="text-xl font-black" style={{ color: C.sky }}>{company._count.orders}</p>
              </div>
              <div className="text-center">
                <p className="text-[.6rem] font-extrabold uppercase tracking-wider text-gray-400">Invoices</p>
                <p className="text-xl font-black" style={{ color: C.yellow }}>{company._count.invoices}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-colors ${
                tab === t.key ? 'text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
              style={tab === t.key ? { backgroundColor: C.navy } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'details' && (
          <DetailsTab
            company={company}
            extra={extra}
            onChange={onChange}
            onExtraChange={onExtraChange}
            saving={saving}
            onSave={saveCompany}
          />
        )}
        {tab === 'delivery' && (
          <DeliveryTab
            company={company}
            extra={extra}
            onChange={onChange}
            onExtraChange={onExtraChange}
            saving={saving}
            onSave={saveCompany}
          />
        )}
        {tab === 'billing' && (
          <BillingTab extra={extra} onExtraChange={onExtraChange} saving={saving} onSave={saveCompany} />
        )}
        {tab === 'subsidy' && (
          <SubsidyTab
            companyId={id}
            parLevels={parLevels}
            setParLevels={setParLevels}
            benefitLevels={benefitLevels}
            setBenefitLevels={setBenefitLevels}
            savingPar={savingPar}
            savingBenefit={savingBenefit}
            onSavePar={saveParLevels}
            onSaveBenefit={saveBenefitLevels}
          />
        )}
      </div>
    </div>
  );
}
