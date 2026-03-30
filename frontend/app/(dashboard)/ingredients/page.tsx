'use client';

import { useEffect, useState } from 'react';
import { api, Ingredient, CreateIngredientData } from '../../lib/api';

function displayCategory(cat: string): string {
  if (cat === 'Frozen') return 'Freezer';
  if (cat === 'Pantry') return 'Dry Storage';
  return cat;
}

const EMPTY: CreateIngredientData = {
  internal_name: '',
  display_name: '',
  sku: '',
  category: '',
  location: '',
  supplier_name: '',
  trim_percentage: 0,
  base_weight: 0,
  cost_per_unit: 0,
  allergen_tags: [],
};

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Ingredient | null>(null);
  const [form, setForm] = useState<CreateIngredientData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [data, cats] = await Promise.all([
        api.getIngredients(filterCategory || undefined),
        api.getIngredientCategories(),
      ]);
      setIngredients(data);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterCategory]);

  function openNew() {
    setForm(EMPTY);
    setEditItem(null);
    setError('');
    setShowForm(true);
  }

  function openEdit(i: Ingredient) {
    setForm({
      internal_name: i.internal_name,
      display_name: i.display_name,
      sku: i.sku,
      category: i.category,
      location: i.location ?? '',
      supplier_name: i.supplier_name ?? '',
      trim_percentage: i.trim_percentage,
      base_weight: i.base_weight,
      cost_per_unit: i.cost_per_unit,
      allergen_tags: i.allergen_tags,
    });
    setEditItem(i);
    setError('');
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        trim_percentage: Number(form.trim_percentage),
        base_weight: Number(form.base_weight),
        cost_per_unit: Number(form.cost_per_unit),
      };
      if (editItem) {
        await api.updateIngredient(editItem.id, payload);
      } else {
        await api.createIngredient(payload);
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this ingredient?')) return;
    try {
      await api.deleteIngredient(id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const filtered = ingredients.filter(
    (i) =>
      i.internal_name.toLowerCase().includes(search.toLowerCase()) ||
      i.sku.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ingredients</h1>
        <button
          onClick={openNew}
          className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          + Add Ingredient
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{displayCategory(c)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'SKU', 'Category', 'Supplier', 'Cost/Unit', 'Trim %', 'Allergens', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No ingredients found</td></tr>
            ) : (
              filtered.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <a href={`/ingredients/${i.id}`} className="font-medium text-blue-600 hover:underline">{i.internal_name}</a>
                    <p className="text-xs text-gray-500">{i.display_name}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{i.sku}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-xs">{displayCategory(i.category)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{i.supplier_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">${i.cost_per_unit.toFixed(4)}</td>
                  <td className="px-4 py-3 text-gray-600">{i.trim_percentage}%</td>
                  <td className="px-4 py-3">
                    {i.allergen_tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {i.allergen_tags.map((a) => (
                          <span key={a} className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-xs">{a}</span>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(i)} className="text-xs text-brand-600 hover:underline">Edit</button>
                      <button onClick={() => handleDelete(i.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editItem ? 'Edit Ingredient' : 'New Ingredient'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: 'Internal Name', key: 'internal_name', type: 'text' },
                { label: 'Display Name', key: 'display_name', type: 'text' },
                { label: 'SKU', key: 'sku', type: 'text' },
                { label: 'Category', key: 'category', type: 'text' },
                { label: 'Location', key: 'location', type: 'text' },
                { label: 'Supplier Name', key: 'supplier_name', type: 'text' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type={type}
                    value={(form as any)[key] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              ))}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Cost/Unit ($)', key: 'cost_per_unit' },
                  { label: 'Base Weight (g)', key: 'base_weight' },
                  { label: 'Trim %', key: 'trim_percentage' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={(form as any)[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allergen Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={form.allergen_tags?.join(', ') ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      allergen_tags: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="gluten, dairy, nuts"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
