'use client';

import { useEffect, useState } from 'react';
import { api, Ingredient, IngredientRequirement } from '../../../lib/api';
import { format } from 'date-fns';

// The shopping list can work in two modes:
// 1. Order-based: pull from Shopify orders by date range
// 2. All-ingredients: show the full ingredient master list grouped by category

export default function ShoppingListPage() {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [mode, setMode] = useState<'orders' | 'master'>('master');
  const [items, setItems] = useState<IngredientRequirement[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Auto-load master list on mount
  useEffect(() => {
    loadMaster();
  }, []);

  async function loadMaster() {
    setLoading(true);
    setMode('master');
    try {
      const data = await api.getIngredients();
      setAllIngredients(data);
      setLoaded(true);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadFromOrders() {
    setLoading(true);
    setMode('orders');
    try {
      const data = await api.getShoppingList(startDate, endDate);
      setItems(data);
      setLoaded(true);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Group master ingredients by category
  const masterByCategory = allIngredients.reduce((acc, ing) => {
    const key = ing.category ?? 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(ing);
    return acc;
  }, {} as Record<string, Ingredient[]>);

  // Group order-based items by category
  const ordersByCategory = items.reduce((acc, item) => {
    const key = item.category ?? 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, IngredientRequirement[]>);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Shopping List</h1>
          <p className="text-sm text-gray-500 mt-0.5">All ingredients grouped by category and supplier</p>
        </div>
        {loaded && (
          <button onClick={() => window.print()} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
            Print List
          </button>
        )}
      </div>

      {/* Mode tabs + date filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">View Mode</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              <button
                onClick={loadMaster}
                className={`px-4 py-2 text-sm font-medium transition-colors ${mode === 'master' ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                All Ingredients
              </button>
              <button
                onClick={() => setMode('orders')}
                className={`px-4 py-2 text-sm font-medium transition-colors border-l border-gray-200 ${mode === 'orders' ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                By Order Date
              </button>
            </div>
          </div>

          {mode === 'orders' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <button
                onClick={loadFromOrders}
                disabled={loading}
                className="px-5 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Loading...' : 'Generate'}
              </button>
            </>
          )}

          {/* Summary */}
          {loaded && mode === 'master' && (
            <div className="ml-auto text-right">
              <p className="text-xs text-gray-500">Total Ingredients</p>
              <p className="text-xl font-bold text-gray-900">{allIngredients.length}</p>
            </div>
          )}
        </div>
      </div>

      {loading && <div className="text-center py-20 text-gray-400">Loading...</div>}

      {/* Master list view */}
      {!loading && mode === 'master' && loaded && (
        <div className="space-y-6">
          {Object.entries(masterByCategory).sort(([a], [b]) => a.localeCompare(b)).map(([category, ings]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{category}</h2>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{ings.length}</span>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Ingredient</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Cost/Unit</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Trim %</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Allergens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ings.map((ing) => (
                      <tr key={ing.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{ing.internal_name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{ing.sku}</td>
                        <td className="px-4 py-2.5 text-gray-600">{ing.supplier_name ?? '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{ing.location ?? '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{(ing as any).unit ?? 'Kgs'}</td>
                        <td className="px-4 py-2.5 text-gray-900">${ing.cost_per_unit > 0 ? ing.cost_per_unit.toFixed(2) : '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{ing.trim_percentage > 0 ? `${ing.trim_percentage}%` : '—'}</td>
                        <td className="px-4 py-2.5">
                          {ing.allergen_tags?.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {ing.allergen_tags.map((a) => (
                                <span key={a} className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-xs">{a}</span>
                              ))}
                            </div>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order-based view */}
      {!loading && mode === 'orders' && loaded && (
        <div className="space-y-6">
          {items.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-4xl mb-3">📦</p>
              <p className="text-sm">No orders found for this date range</p>
              <p className="text-xs mt-1 text-gray-300">Connect Shopify to see order-based shopping lists</p>
            </div>
          ) : (
            Object.entries(ordersByCategory).sort(([a], [b]) => a.localeCompare(b)).map(([category, catItems]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{category}</h2>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{catItems.length}</span>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Ingredient</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Required Qty</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {catItems.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-900">{item.internal_name}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{item.sku}</td>
                          <td className="px-4 py-2.5 text-gray-600">{item.supplier_name ?? '—'}</td>
                          <td className="px-4 py-2.5 font-bold text-gray-900">{item.total_quantity}</td>
                          <td className="px-4 py-2.5 text-gray-600">{item.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
