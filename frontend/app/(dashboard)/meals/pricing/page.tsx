'use client';

import { useEffect, useState } from 'react';
import { api, MealPricing } from '../../../lib/api';

export default function MealPricingPage() {
  const [pricing, setPricing] = useState<MealPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState('');

  async function load() {
    setLoading(true);
    try {
      setPricing(await api.getMealPricing());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function savePrice(id: string) {
    setSaving(true);
    try {
      await api.updateMeal(id, {
        pricing_override: editPrice ? Number(editPrice) : undefined,
      });
      setEditingId(null);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function recalculate() {
    setRecalculating(true);
    setRecalcMsg('');
    try {
      const result = await api.recalculateCosts();
      setRecalcMsg(`✓ Recalculated ${result.subRecipes} sub-recipes and ${result.meals} meals.`);
      load();
    } catch (e: any) {
      setRecalcMsg('Failed: ' + (e.message ?? 'Unknown error'));
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meal Pricing</h1>
          <p className="text-sm text-gray-500 mt-1">
            View computed costs and set sell price overrides.
          </p>
          {recalcMsg && (
            <p className={`text-xs mt-2 font-medium ${recalcMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{recalcMsg}</p>
          )}
        </div>
        <button
          onClick={recalculate}
          disabled={recalculating}
          className="flex-shrink-0 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {recalculating ? 'Recalculating…' : '↺ Recalculate All Costs'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Meal', 'Yield (g)', 'Computed Cost', 'Sell Price', 'Gross Margin', 'Cost %', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : pricing.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No meals yet</td></tr>
            ) : (
              pricing.map((m) => {
                const sellPrice = m.pricing_override;
                const margin = sellPrice ? ((sellPrice - m.computed_cost) / sellPrice * 100) : null;
                const costPct = sellPrice ? (m.computed_cost / sellPrice * 100) : null;
                const isEditing = editingId === m.id;

                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{m.display_name}</p>
                      <p className="text-xs text-gray-500">{m.name}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{m.final_yield_weight}g</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">${m.computed_cost.toFixed(4)}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="w-24 px-2 py-1 border border-brand-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <span className={sellPrice ? 'font-medium text-gray-900' : 'text-gray-400'}>
                          {sellPrice ? `$${sellPrice.toFixed(2)}` : 'Not set'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {margin !== null ? (
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                          margin > 60 ? 'bg-green-50 text-green-700' :
                          margin > 30 ? 'bg-yellow-50 text-yellow-700' :
                          'bg-red-50 text-red-700'
                        }`}>
                          {margin.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {costPct !== null ? `${costPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button onClick={() => savePrice(m.id)} disabled={saving}
                            className="text-xs text-brand-600 font-medium hover:underline disabled:opacity-50">
                            Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:underline">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingId(m.id); setEditPrice(m.pricing_override?.toString() ?? ''); }}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          {m.pricing_override ? 'Edit price' : 'Set price'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
