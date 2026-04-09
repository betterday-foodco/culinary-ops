'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Ingredient, CreateIngredientData } from '@/app/lib/api';

const CATEGORIES_FALLBACK = ['Produce', 'Protein', 'Dairy', 'Pantry', 'Frozen', 'Bakery', 'Oils & Vinegar', 'Spices', 'Other'];

export default function IngredientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<Partial<CreateIngredientData>>({});
  const [dirty, setDirty] = useState(false);
  const [allergenOptions, setAllergenOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>(CATEGORIES_FALLBACK);

  useEffect(() => {
    // Fetch tag options from SystemTag
    api.getTagsByType('allergens').then(tags => {
      const names = tags.filter((t: any) => t.subtype === 'Allergen').map((t: any) => t.name);
      if (names.length) setAllergenOptions(names);
    }).catch(() => {});
    api.getTagsByType('ingredient-cats').then(tags => {
      const names = tags.map((t: any) => t.name);
      if (names.length) setCategoryOptions(names);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.getIngredient(id).then(ing => {
      setIngredient(ing);
      setForm({
        internal_name: ing.internal_name,
        display_name: ing.display_name,
        sku: ing.sku,
        category: ing.category,
        location: ing.location ?? '',
        supplier_name: ing.supplier_name ?? '',
        trim_percentage: ing.trim_percentage,
        base_weight: ing.base_weight,
        cost_per_unit: ing.cost_per_unit,
        allergen_tags: ing.allergen_tags ?? [],
      });
    }).catch(() => router.push('/ingredients'))
      .finally(() => setLoading(false));
  }, [id, router]);

  function update(key: string, value: any) {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(true);
  }

  function toggleAllergen(tag: string) {
    setForm(f => {
      const tags = f.allergen_tags ?? [];
      return { ...f, allergen_tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag] };
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api.updateIngredient(id, form);
      setIngredient(updated);
      setDirty(false);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${ingredient?.internal_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.deleteIngredient(id);
      router.push('/ingredients');
    } catch (e: any) { alert(e.message); setDeleting(false); }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" /></div>;
  }

  if (!ingredient) return null;

  const costPerGram = form.base_weight && form.cost_per_unit ? (form.cost_per_unit / (form.base_weight * 1000)).toFixed(4) : '—';
  const effectiveCost = form.trim_percentage ? (form.cost_per_unit ?? 0) / (1 - (form.trim_percentage ?? 0) / 100) : form.cost_per_unit;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/ingredients')} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{ingredient.display_name || ingredient.internal_name}</h1>
            <p className="text-sm text-gray-500">SKU: {ingredient.sku}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDelete} disabled={deleting}
            className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <button onClick={save} disabled={!dirty || saving}
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-40 font-medium">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Basic Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Internal Name" value={form.internal_name ?? ''} onChange={v => update('internal_name', v)} />
            <Field label="Display Name" value={form.display_name ?? ''} onChange={v => update('display_name', v)} />
            <Field label="SKU" value={form.sku ?? ''} onChange={v => update('sku', v)} />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select value={form.category ?? ''} onChange={e => update('category', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                <option value="">— Select —</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Field label="Location" value={form.location ?? ''} onChange={v => update('location', v)} placeholder="e.g. Shelf A3" />
            <Field label="Supplier" value={form.supplier_name ?? ''} onChange={v => update('supplier_name', v)} placeholder="e.g. Sysco" />
          </div>
        </div>

        {/* Costing */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Costing</h2>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Cost per Unit ($)" value={String(form.cost_per_unit ?? 0)} onChange={v => update('cost_per_unit', parseFloat(v) || 0)} type="number" />
            <Field label="Base Weight (kg)" value={String(form.base_weight ?? 0)} onChange={v => update('base_weight', parseFloat(v) || 0)} type="number" />
            <Field label="Trim %" value={String(form.trim_percentage ?? 0)} onChange={v => update('trim_percentage', parseFloat(v) || 0)} type="number" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Cost per gram</p>
              <p className="text-lg font-semibold text-gray-800">${costPerGram}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Effective cost (after trim)</p>
              <p className="text-lg font-semibold text-gray-800">${effectiveCost?.toFixed(2) ?? '—'}</p>
            </div>
          </div>
        </div>

        {/* Stock */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Current Stock</h2>
          <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Stock on hand</p>
              <p className="text-2xl font-bold text-gray-900">{ingredient.stock} <span className="text-sm font-normal text-gray-500">{ingredient.unit}</span></p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${ingredient.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {ingredient.stock > 0 ? 'In Stock' : 'Out of Stock'}
            </span>
          </div>
        </div>

        {/* Allergens */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Allergen Tags</h2>
          <div className="flex flex-wrap gap-2">
            {allergenOptions.map(tag => {
              const active = (form.allergen_tags ?? []).includes(tag);
              return (
                <button key={tag} onClick={() => toggleAllergen(tag)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    active ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                  }`}>
                  {active ? '✓ ' : ''}{tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Metadata */}
        <div className="text-xs text-gray-400 text-right">
          Created {new Date(ingredient.created_at).toLocaleDateString()} · Updated {new Date(ingredient.updated_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
    </div>
  );
}
