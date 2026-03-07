'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, KitchenStaff, CreateKitchenStaffData } from '../../../lib/api';

const STATIONS = [
  'Veg Station',
  'Protein Station',
  'Oven Station',
  'Sauce Station',
  'Breakfast + Sides Station',
  'Packaging Station',
];

interface StaffForm {
  name: string;
  email: string;
  password: string;
  station: string;
}

const EMPTY_FORM: StaffForm = { name: '', email: '', password: '', station: STATIONS[0] };

export default function KitchenStaffPage() {
  const [staff, setStaff] = useState<KitchenStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [mode, setMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const data = await api.getKitchenStaff();
      setStaff(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setFormError('');
    setEditingId(null);
    setMode('add');
  }

  function openEdit(member: KitchenStaff) {
    setForm({
      name: member.name ?? '',
      email: member.email,
      password: '',
      station: member.station ?? STATIONS[0],
    });
    setFormError('');
    setEditingId(member.id);
    setMode('edit');
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (!form.email.trim()) { setFormError('Email is required'); return; }
    if (mode === 'add' && !form.password.trim()) { setFormError('Password is required'); return; }
    if (form.password && form.password.length < 6) { setFormError('Password must be at least 6 characters'); return; }

    setSaving(true);
    setFormError('');
    try {
      if (mode === 'add') {
        await api.createKitchenStaff({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          station: form.station,
        });
      } else if (editingId) {
        const update: Partial<CreateKitchenStaffData> = {
          name: form.name.trim(),
          email: form.email.trim(),
          station: form.station,
        };
        if (form.password) update.password = form.password;
        await api.updateKitchenStaff(editingId, update);
      }
      setMode(null);
      await load();
    } catch (e: any) {
      setFormError(e.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(null);
    try {
      await api.deleteKitchenStaff(id);
      setStaff((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      alert(e.message ?? 'Failed to delete');
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kitchen Staff</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage kitchen staff accounts and station assignments
          </p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Add Staff
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm animate-pulse">Loading...</div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 text-sm">{error}</p>
          <button onClick={load} className="mt-2 text-brand-600 text-sm underline">Retry</button>
        </div>
      ) : staff.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-4xl mb-3">👨‍🍳</p>
          <h3 className="text-base font-semibold text-gray-700">No kitchen staff yet</h3>
          <p className="text-sm text-gray-400 mt-1">Add your first kitchen staff member to get started.</p>
          <button
            onClick={openAdd}
            className="mt-4 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600"
          >
            Add Staff Member
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Station</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Added</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{member.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{member.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700">
                      {member.station ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(member.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(member)}
                        className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingId(member.id)}
                        className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add/Edit Modal ──────────────────────────────────────────────────── */}
      {mode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-base font-bold text-gray-900 mb-4">
              {mode === 'add' ? 'Add Kitchen Staff' : 'Edit Staff Member'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-700">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Hamza"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="hamza@company.com"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">
                  Password {mode === 'edit' ? '(leave blank to keep unchanged)' : '*'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={mode === 'edit' ? '••••••••' : 'Min 6 characters'}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">Station *</label>
                <select
                  value={form.station}
                  onChange={(e) => setForm({ ...form, station: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {STATIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {formError && (
                <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setMode(null)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : mode === 'add' ? 'Add Staff' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────────── */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl text-center">
            <p className="text-4xl mb-3">⚠️</p>
            <h2 className="text-base font-bold text-gray-900">Delete Staff Member?</h2>
            <p className="text-sm text-gray-500 mt-2">
              This will remove their account and all production logs. This cannot be undone.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
