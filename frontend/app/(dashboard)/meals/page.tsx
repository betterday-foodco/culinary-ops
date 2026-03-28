'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, apiExtra, MealRecipe } from '../../lib/api';

export default function MealsPage() {
  const [meals, setMeals] = useState<MealRecipe[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [data, cats] = await Promise.all([
        api.getMeals(),
        apiExtra.getMealCategories(),
      ]);
      setMeals(data);
      setCategories(cats as string[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleBackfillCodes() {
    try {
      const r = await api.backfillMealCodes();
      if (r.updated > 0) { alert(`Assigned codes to ${r.updated} meals.`); load(); }
      else { alert('All meals already have codes.'); }
    } catch (e: any) { alert(e.message); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this meal?')) return;
    try {
      await api.deleteMeal(id);
      load();
    } catch (e: any) { alert(e.message); }
  }

  const filtered = meals.filter((m) => {
    const matchSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.display_name.toLowerCase().includes(search.toLowerCase()) ||
      ((m as any).meal_code ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || (m as any).category === filterCategory;
    return matchSearch && matchCat;
  });

  const catCounts = meals.reduce((acc, m) => {
    const key = (m as any).category ?? 'Other';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const avgCost = filtered.length
    ? filtered.reduce((s, m) => s + m.computed_cost, 0) / filtered.length
    : 0;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meal Recipes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{meals.length} total meals</p>
        </div>
        <div className="flex gap-2">
          {!loading && meals.some((m) => !(m as any).meal_code) && (
            <button onClick={handleBackfillCodes} className="px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              Assign Codes
            </button>
          )}
          <Link href="/meals/pricing" className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
            Pricing Editor
          </Link>
          {/* Export JSON */}
          <button
            onClick={async () => {
              const token = localStorage.getItem('token');
              const res = await fetch('http://localhost:3002/api/meals/export', {
                headers: { Authorization: `Bearer ${token}` }
              });
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `betterday-meals-${new Date().toISOString().slice(0,10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            Export JSON
          </button>
          {/* Export CSV - client side */}
          <button
            onClick={() => {
              const headers = ['BD Code','Name','Category','Description','Calories','Protein(g)','Carbs(g)','Fat(g)','Fiber(g)','Net Weight(g)','Cost($)','Sell Price($)','Allergens','Dietary Tags','Image URL'];
              const rows = filtered.map(m => [
                (m as any).meal_code ?? '',
                m.display_name,
                (m as any).category ?? '',
                m.short_description ?? '',
                m.calories ?? '',
                m.protein_g ?? '',
                m.carbs_g ?? '',
                m.fat_g ?? '',
                (m as any).fiber_g ?? '',
                m.final_yield_weight ?? '',
                m.computed_cost?.toFixed(2) ?? '',
                m.pricing_override?.toFixed(2) ?? '',
                ((m as any).allergen_tags as string[] ?? []).join('; '),
                ((m as any).dietary_tags as string[] ?? []).join('; '),
                m.image_url ?? '',
              ]);
              const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `betterday-meals-${new Date().toISOString().slice(0,10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            Export CSV
          </button>
          <Link href="/meals/new" className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors">
            + New Meal
          </Link>
        </div>
      </div>

      {/* Category pills */}
      {!loading && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setFilterCategory('')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterCategory === '' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All ({meals.length})
          </button>
          {Object.entries(catCounts).sort(([a], [b]) => a.localeCompare(b)).map(([cat, count]) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterCategory === cat ? 'bg-brand-500 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'}`}
            >
              {cat} ({count})
            </button>
          ))}
        </div>
      )}

      <div className="mb-5">
        <input
          type="text"
          placeholder="Search meals..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Meal Name', 'Category', 'Components', 'Net Weight', 'Prod. Cost', 'Sell Price', 'Margin', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No meals found</td></tr>
            ) : (
              filtered.map((meal) => {
                const cost = meal.computed_cost;
                const sell = meal.pricing_override ?? 0;
                const profit = sell > 0 && cost > 0 ? sell - cost : null;
                const margin = profit !== null && sell > 0 ? (profit / sell) * 100 : null;
                const allergens = (meal as any).allergen_tags as string[] ?? [];
                return (
                  <tr key={meal.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => window.location.href = `/meals/${meal.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        {meal.image_url && (
                          <img src={meal.image_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{meal.display_name}</span>
                            {(meal as any).meal_code && (
                              <span className="px-1.5 py-0 bg-gray-100 text-gray-500 rounded text-xs font-mono">{(meal as any).meal_code}</span>
                            )}
                          </div>
                          {meal.short_description && (
                            <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{meal.short_description}</div>
                          )}
                          {meal.calories != null && (
                            <div className="flex gap-1.5 mt-1 flex-wrap">
                              <span className="px-1.5 py-0 bg-amber-50 text-amber-700 rounded text-xs font-medium">🔥 {meal.calories} cal</span>
                              {meal.protein_g != null && <span className="px-1.5 py-0 bg-blue-50 text-blue-700 rounded text-xs">{meal.protein_g}g P</span>}
                              {meal.carbs_g != null && <span className="px-1.5 py-0 bg-green-50 text-green-700 rounded text-xs">{meal.carbs_g}g C</span>}
                              {meal.fat_g != null && <span className="px-1.5 py-0 bg-orange-50 text-orange-700 rounded text-xs">{meal.fat_g}g F</span>}
                            </div>
                          )}
                          {allergens.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {allergens.slice(0, 3).map((a) => (
                                <span key={a} className="px-1.5 py-0 bg-red-50 text-red-600 rounded text-xs">{a}</span>
                              ))}
                              {allergens.length > 3 && <span className="text-xs text-gray-400">+{allergens.length - 3}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {meal.category ? (
                        <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded-md text-xs">{meal.category}</span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{meal.components.length}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {meal.final_yield_weight > 0 ? (
                        <span className="text-xs font-medium text-slate-700">{meal.final_yield_weight}g</span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {cost > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-800 rounded font-bold text-sm">
                          💰 ${cost.toFixed(2)}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {sell > 0 ? <span className="font-semibold text-green-700">${sell.toFixed(2)}</span> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {margin !== null ? (
                        <span className={`text-xs font-semibold ${margin >= 30 ? 'text-green-600' : margin >= 20 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {margin.toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <Link href={`/meals/${meal.id}`} className="text-xs text-brand-600 hover:underline">Edit</Link>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(meal.id); }} className="text-xs text-red-500 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <span>{filtered.length} meals shown</span>
            <span>Avg production cost: <strong className="text-gray-900">${avgCost.toFixed(2)}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
