'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api, PortionSpec, MealRecipe } from '../../lib/api';

export default function PortionSpecsPage() {
  const [specs, setSpecs] = useState<PortionSpec[]>([]);
  const [meals, setMeals] = useState<MealRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterContainer, setFilterContainer] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [specPhotoUrls, setSpecPhotoUrls] = useState<Record<string, string>>({});
  const [uploadingSpecId, setUploadingSpecId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getPortionSpecs(), api.getMeals()]).then(([s, m]) => {
      setSpecs(s);
      setMeals(m as MealRecipe[]);
    }).finally(() => setLoading(false));
  }, []);

  // Meals that don't have a spec yet
  const mealMap = useMemo(() => new Map(meals.map(m => [m.id, m])), [meals]);
  const specMealIds = useMemo(() => new Set(specs.map(s => s.meal_id)), [specs]);
  const mealsWithoutSpec = useMemo(() =>
    meals.filter(m => !specMealIds.has(m.id) && m.is_active),
    [meals, specMealIds]
  );

  const containerOptions = useMemo(() =>
    [...new Set(specs.map(s => s.container_type).filter(Boolean) as string[])].sort(),
    [specs]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return specs.filter(s => {
      const meal = mealMap.get(s.meal_id);
      const name = (meal?.display_name ?? '').toLowerCase();
      const code = (meal?.meal_code ?? '').toLowerCase();
      if (q && !name.includes(q) && !code.includes(q)) return false;
      if (filterContainer && s.container_type !== filterContainer) return false;
      return true;
    });
  }, [specs, search, filterContainer, mealMap]);

  function formatWeight(spec: PortionSpec) {
    if (spec.total_weight_min && spec.total_weight_max)
      return `${spec.total_weight_min}–${spec.total_weight_max} g`;
    if (spec.total_weight_min) return `≥${spec.total_weight_min} g`;
    if (spec.total_weight_max) return `≤${spec.total_weight_max} g`;
    return '—';
  }

  function formatPortion(c: PortionSpec['components'][0], recipeQtyG?: number): { text: string; suggested: boolean } {
    if (c.portion_min && c.portion_max)
      return { text: `${c.portion_min}–${c.portion_max} ${c.portion_unit ?? 'g'}`, suggested: false };
    if (c.portion_min)
      return { text: `${c.portion_min} ${c.portion_unit ?? 'g'}`, suggested: false };
    // Auto-suggest from recipe quantity
    if (recipeQtyG && recipeQtyG > 0) {
      const max = recipeQtyG;
      const min = Math.round(recipeQtyG * 0.93);
      return { text: `${min}–${max} g`, suggested: true };
    }
    return { text: '—', suggested: false };
  }

  // Build name→quantity map for a given meal's recipe components
  function mealRecipeQtyMap(mealId: string): Record<string, number> {
    const meal = mealMap.get(mealId);
    if (!meal) return {};
    const map: Record<string, number> = {};
    meal.components.forEach(c => {
      const name = (c.sub_recipe?.name ?? c.ingredient?.internal_name ?? '').toLowerCase().trim();
      if (name) {
        let qty = Number(c.quantity);
        if (c.unit === 'kg' || c.unit === 'Kgs') qty *= 1000;
        map[name] = qty;
      }
    });
    return map;
  }

  const containerBadge = (ct: string | null) => {
    if (!ct) return null;
    if (ct.includes('Salad')) return 'bg-green-100 text-green-700';
    if (ct.includes('Soup')) return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-600';
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-sm text-gray-400">Loading portion specs…</div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Portion Specs</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {specs.length} specs saved · {mealsWithoutSpec.length} active meals still need a spec
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mt-3">
          <input
            type="text"
            placeholder="Search by meal name or BD code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <select
            value={filterContainer}
            onChange={e => setFilterContainer(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="">All containers</option>
            {containerOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3">

        {/* Missing specs notice */}
        {mealsWithoutSpec.length > 0 && !search && !filterContainer && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-medium text-amber-800">
              {mealsWithoutSpec.length} active meals don't have a portion spec yet
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Open a meal from the{' '}
              <Link href="/meals" className="underline font-medium">Meals page</Link>
              {' '}and go to the "Portion Specs" tab to add one.
            </p>
          </div>
        )}

        {/* Specs list */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">
            {search || filterContainer ? 'No specs match your filters.' : 'No portion specs saved yet.'}
          </div>
        ) : (
          filtered.map(spec => {
            const meal = mealMap.get(spec.meal_id);
            const isExpanded = expandedId === spec.id;
            return (
              <div key={spec.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Header row */}
                <button
                  className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : spec.id)}
                >
                  {/* BD Code */}
                  <span className="text-xs font-mono font-semibold text-brand-600 bg-brand-50 px-2 py-1 rounded w-16 text-center flex-shrink-0">
                    {meal?.meal_code ?? '—'}
                  </span>

                  {/* Spec photo thumbnail */}
                  {(specPhotoUrls[spec.id] || spec.photo_url) && (
                    <img
                      src={specPhotoUrls[spec.id] || spec.photo_url!}
                      alt={meal?.display_name}
                      className="w-10 h-10 rounded-lg object-cover border border-gray-200 flex-shrink-0"
                    />
                  )}

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {meal?.display_name ?? 'Unknown Meal'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {spec.components.length} components · Total: {formatWeight(spec)}
                    </p>
                  </div>

                  {/* Container badge */}
                  {spec.container_type && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${containerBadge(spec.container_type)}`}>
                      {spec.container_type}
                    </span>
                  )}

                  {/* Edit link */}
                  <Link
                    href={`/meals/${spec.meal_id}?tab=portion-specs`}
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-brand-600 hover:underline flex-shrink-0 font-medium"
                  >
                    Edit ↗
                  </Link>

                  {/* Expand chevron */}
                  <span className="text-gray-400 text-xs flex-shrink-0 ml-1">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {/* Expanded: components table */}
                {isExpanded && (() => {
                  const recipeQtys = mealRecipeQtyMap(spec.meal_id);
                  return (
                  <div className="border-t border-gray-100">
                    {(specPhotoUrls[spec.id] || spec.photo_url) && (
                      <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex justify-center">
                        <img
                          src={specPhotoUrls[spec.id] || spec.photo_url!}
                          alt={meal?.display_name}
                          className="max-h-64 rounded-xl object-contain border border-gray-200 shadow-sm"
                        />
                      </div>
                    )}
                    {spec.general_notes && (
                      <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
                        📋 {spec.general_notes}
                      </div>
                    )}
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 w-6">#</th>
                          <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500">Ingredient / Component</th>
                          <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 w-28">Portion Range</th>
                          <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 w-36">Tool</th>
                          <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500">Placement Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {spec.components.map((c, i) => {
                          const recipeQty = recipeQtys[c.ingredient_name.toLowerCase().trim()];
                          const portion = formatPortion(c, recipeQty);
                          return (
                          <tr key={c.id} className="hover:bg-gray-50/50">
                            <td className="px-5 py-2.5 text-xs text-gray-400">{i + 1}</td>
                            <td className="px-5 py-2.5 text-sm text-gray-900 font-medium">{c.ingredient_name}</td>
                            <td className="px-5 py-2.5 text-xs font-mono">
                              <span className={portion.suggested ? 'text-amber-600' : 'text-gray-700'}>{portion.text}</span>
                              {portion.suggested && <span className="ml-1 text-[10px] text-amber-400">~</span>}
                            </td>
                            <td className="px-5 py-2.5 text-xs text-gray-500">{c.tool || '—'}</td>
                            <td className="px-5 py-2.5 text-xs text-gray-500">{c.notes || '—'}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                      {(spec.total_weight_min || spec.total_weight_max) && (
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                          <tr>
                            <td colSpan={2} className="px-5 py-2.5 text-xs font-semibold text-gray-700">Total Weight Range</td>
                            <td colSpan={3} className="px-5 py-2.5 text-xs font-bold text-gray-900">{formatWeight(spec)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                    {spec.tasting_notes && (
                      <div className="px-5 py-3 bg-blue-50 border-t border-blue-100 text-xs text-blue-800">
                        ✓ Tasting notes: {spec.tasting_notes}
                      </div>
                    )}
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
                      <label className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${uploadingSpecId === spec.id ? 'bg-gray-200 text-gray-400' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
                        {uploadingSpecId === spec.id ? 'Uploading…' : (specPhotoUrls[spec.id] || spec.photo_url) ? 'Change Reference Photo' : 'Upload Reference Photo'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingSpecId === spec.id}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadingSpecId(spec.id);
                            try {
                              const result = await api.uploadSpecPhoto(spec.id, file);
                              setSpecPhotoUrls(prev => ({ ...prev, [spec.id]: result.photo_url }));
                            } catch (err: any) {
                              alert('Upload failed: ' + err.message);
                            } finally {
                              setUploadingSpecId(null);
                            }
                          }}
                        />
                      </label>
                      <span className="text-xs text-gray-400">Reference photo shown to kitchen staff</span>
                    </div>
                  </div>
                  );
                })()}
              </div>
            );
          })
        )}

        {/* Missing meals section */}
        {!search && !filterContainer && mealsWithoutSpec.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Active Meals Without a Portion Spec ({mealsWithoutSpec.length})
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {mealsWithoutSpec.slice(0, 30).map(m => (
                <Link
                  key={m.id}
                  href={`/meals/${m.id}?tab=portion-specs`}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700 group"
                >
                  <span className="text-xs font-mono text-gray-400 w-14 flex-shrink-0">{m.meal_code ?? '—'}</span>
                  <span className="flex-1 truncate group-hover:text-brand-700">{m.display_name}</span>
                  <span className="text-xs text-gray-300 group-hover:text-brand-500">+</span>
                </Link>
              ))}
              {mealsWithoutSpec.length > 30 && (
                <p className="col-span-2 text-xs text-gray-400 mt-1 text-center">
                  …and {mealsWithoutSpec.length - 30} more
                </p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
