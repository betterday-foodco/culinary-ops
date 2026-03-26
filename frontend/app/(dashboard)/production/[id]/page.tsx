'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  api,
  ProductionPlanDetail,
  PlanSubRecipeReport,
  PlanSubRecipeRow,
  PlanShoppingListReport,
  MealRecipe,
  StationTask,
} from '../../../lib/api';

type Tab = 'plan' | 'sub-recipes' | 'shopping' | 'tasks';

const STATUS_OPTIONS = ['draft', 'confirmed', 'completed'];
const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
};
const PRIORITY_COLOR: Record<number, string> = {
  1: 'bg-red-100 text-red-700',
  2: 'bg-orange-100 text-orange-700',
  3: 'bg-yellow-100 text-yellow-700',
  4: 'bg-blue-100 text-blue-700',
  5: 'bg-gray-100 text-gray-600',
};

export default function ProductionPlanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Allow dashboard links like /production/[id]?tab=sub-recipe or ?tab=shopping
  const initialTab = (() => {
    const t = searchParams.get('tab');
    if (t === 'sub-recipe') return 'sub-recipes' as Tab;
    if (t === 'shopping') return 'shopping' as Tab;
    return 'plan' as Tab;
  })();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [plan, setPlan] = useState<ProductionPlanDetail | null>(null);
  const [subRecipeReport, setSubRecipeReport] = useState<PlanSubRecipeReport | null>(null);
  const [shoppingList, setShoppingList] = useState<PlanShoppingListReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Local edits
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('draft');
  const [notes, setNotes] = useState('');
  const [allMeals, setAllMeals] = useState<MealRecipe[]>([]);
  const [search, setSearch] = useState('');
  const [expandedStations, setExpandedStations] = useState<Set<string>>(new Set());
  const [expandedIngredients, setExpandedIngredients] = useState<Set<string>>(new Set());

  // Station tasks
  const [stationTasks, setStationTasks] = useState<StationTask[]>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskStation, setTaskStation] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  async function loadPlan() {
    setLoading(true);
    try {
      const [data, meals] = await Promise.all([api.getProductionPlan(id), api.getMeals()]);
      setPlan(data);
      setStatus(data.status);
      setNotes(data.notes ?? '');
      const qtyMap: Record<string, number> = {};
      for (const item of data.items) qtyMap[item.meal_id] = item.quantity;
      setQuantities(qtyMap);
      setAllMeals(meals);
    } finally {
      setLoading(false);
    }
  }

  const loadSubRecipeReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const data = await api.getProductionPlanSubRecipeReport(id);
      setSubRecipeReport(data);
      setExpandedStations(new Set(Object.keys(data.grouped_by_station)));
    } catch (e: any) { alert(e.message); }
    finally { setReportLoading(false); }
  }, [id]);

  const loadShoppingList = useCallback(async () => {
    setReportLoading(true);
    try {
      const data = await api.getProductionPlanShoppingList(id);
      setShoppingList(data);
    } catch (e: any) { alert(e.message); }
    finally { setReportLoading(false); }
  }, [id]);

  useEffect(() => { loadPlan(); }, [id]);

  const loadStationTasks = useCallback(async () => {
    try {
      const data = await api.listStationTasks(id);
      setStationTasks(data);
    } catch { /* silent */ }
  }, [id]);

  // Auto-load report for whichever tab was opened initially (from dashboard ?tab= param)
  useEffect(() => {
    if (!loading) {
      if (tab === 'sub-recipes' && !subRecipeReport) loadSubRecipeReport();
      if (tab === 'shopping' && !shoppingList) loadShoppingList();
      if (tab === 'tasks') loadStationTasks();
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTabChange(t: Tab) {
    setTab(t);
    if (t === 'sub-recipes' && !subRecipeReport) loadSubRecipeReport();
    if (t === 'shopping' && !shoppingList) loadShoppingList();
    if (t === 'tasks') loadStationTasks();
  }

  async function handleAddTask() {
    if (!taskTitle.trim()) return;
    setAddingTask(true);
    try {
      await api.createStationTask({ title: taskTitle, description: taskDesc || undefined, station: taskStation || undefined, plan_id: id });
      setTaskTitle(''); setTaskDesc(''); setTaskStation(''); setTaskAssignee('');
      await loadStationTasks();
    } catch (e: any) { alert(e.message); }
    finally { setAddingTask(false); }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return;
    try { await api.deleteStationTask(taskId); await loadStationTasks(); } catch (e: any) { alert(e.message); }
  }

  function toggleIngredients(rowId: string) {
    setExpandedIngredients((prev) => {
      const next = new Set(prev);
      next.has(rowId) ? next.delete(rowId) : next.add(rowId);
      return next;
    });
  }

  async function handlePublish(publish: boolean) {
    setPublishing(true);
    try {
      await api.publishProductionPlan(id, publish);
      await loadPlan();
    } catch (e: any) { alert(e.message); }
    finally { setPublishing(false); }
  }

  async function handleSave() {
    if (!plan) return;
    setSaving(true);
    try {
      const items = plan.items.map((item) => ({
        meal_id: item.meal_id,
        quantity: quantities[item.meal_id] ?? 0,
      }));
      await api.updateProductionPlan(id, { status, notes: notes || undefined, items });
      await loadPlan();
      setSubRecipeReport(null);
      setShoppingList(null);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function addMeal(meal: MealRecipe) {
    if (!plan) return;
    const newItems = [
      ...plan.items.map((i) => ({ meal_id: i.meal_id, quantity: quantities[i.meal_id] ?? 0 })),
      { meal_id: meal.id, quantity: 0 },
    ];
    try {
      await api.updateProductionPlan(id, { items: newItems });
      await loadPlan();
      setSubRecipeReport(null);
      setShoppingList(null);
      setSearch('');
    } catch (e: any) { alert(e.message); }
  }

  async function removeMeal(meal_id: string) {
    if (!plan) return;
    const newItems = plan.items
      .filter((i) => i.meal_id !== meal_id)
      .map((i) => ({ meal_id: i.meal_id, quantity: quantities[i.meal_id] ?? 0 }));
    try {
      await api.updateProductionPlan(id, { items: newItems });
      await loadPlan();
      setSubRecipeReport(null);
      setShoppingList(null);
    } catch (e: any) { alert(e.message); }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!plan) return <div className="p-8 text-center text-gray-400">Plan not found</div>;

  const addableMeals = allMeals.filter(
    (m) =>
      !plan.items.find((i) => i.meal_id === m.id) &&
      (m.display_name.toLowerCase().includes(search.toLowerCase()) ||
        m.name.toLowerCase().includes(search.toLowerCase())),
  );

  const totalPortions = Object.values(quantities).reduce((s, q) => s + q, 0);
  const portionedMeals = Object.values(quantities).filter((q) => q > 0).length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button
            onClick={() => router.push('/production')}
            className="text-gray-400 hover:text-gray-600 text-sm mb-1 block"
          >
            ← All Plans
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{plan.week_label}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[plan.status]}`}>
              {plan.status}
            </span>
            <span className="text-sm text-gray-500">
              {plan.items.length} meals · {portionedMeals} portioned · {totalPortions.toLocaleString()} total portions
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {plan.published_to_kitchen ? (
            <button
              onClick={() => handlePublish(false)}
              disabled={publishing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-50 border border-green-300 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors font-medium"
            >
              <span>✓</span>
              {publishing ? 'Updating...' : 'Published to Kitchen'}
            </button>
          ) : (
            <button
              onClick={() => handlePublish(true)}
              disabled={publishing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bd-yellow border border-yellow-400 text-brand-700 rounded-lg hover:bg-yellow-300 disabled:opacity-50 transition-colors font-medium"
            >
              <span>📋</span>
              {publishing ? 'Publishing...' : 'Publish to Kitchen'}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
          >
            Print
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(
          [
            ['plan', '📋 Plan Items'],
            ['sub-recipes', '🍳 Sub-Recipe Report'],
            ['shopping', '🛒 Shopping List'],
            ['tasks', '✅ Station Tasks'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Plan Items ── */}
      {tab === 'plan' && (
        <div className="space-y-6">
          {/* Editable table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Meal Quantities</h2>
              <div className="flex items-center gap-3">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Meal', 'Category', 'Allergens', 'Cost/portion', 'Quantity', 'Line Cost', ''].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {plan.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      No meals added yet
                    </td>
                  </tr>
                ) : (
                  plan.items.map((item) => {
                    const qty = quantities[item.meal_id] ?? 0;
                    const cost = item.meal.computed_cost ?? 0;
                    const lineCost = qty * cost;
                    return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.meal.display_name}</td>
                      <td className="px-4 py-3">
                        {item.meal.category ? (
                          <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-xs">
                            {item.meal.category}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {item.meal.allergen_tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.meal.allergen_tags.map((a) => (
                              <span key={a} className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-xs">
                                {a}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {cost > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-800 rounded font-semibold text-xs">
                            💰 ${cost.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">not set</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          value={quantities[item.meal_id] ?? 0}
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [item.meal_id]: parseInt(e.target.value) || 0,
                            }))
                          }
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {lineCost > 0 ? (
                          <span className="font-semibold text-gray-800">${lineCost.toFixed(2)}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => removeMeal(item.meal_id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
              {plan.items.length > 0 && (() => {
                const totalCost = plan.items.reduce((sum, item) => {
                  const qty = quantities[item.meal_id] ?? 0;
                  return sum + qty * (item.meal.computed_cost ?? 0);
                }, 0);
                return totalCost > 0 ? (
                  <tfoot>
                    <tr className="bg-purple-50 border-t-2 border-purple-200">
                      <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-purple-900">
                        💰 Total Production Cost
                      </td>
                      <td className="px-4 py-3 text-base font-bold text-purple-900">
                        ${totalCost.toFixed(2)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                ) : null;
              })()}
            </table>
          </div>

          {/* Add meal */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Meal to Plan</h2>
            <input
              type="text"
              placeholder="Search meals to add..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {search.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50">
                {addableMeals.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No results</p>
                ) : (
                  addableMeals.slice(0, 15).map((meal) => (
                    <button
                      key={meal.id}
                      onClick={() => addMeal(meal)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                    >
                      <span className="font-medium text-gray-900">{meal.display_name}</span>
                      {(meal as any).category && (
                        <span className="text-xs text-gray-400 ml-2">{(meal as any).category}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-amber-50 rounded-xl border border-amber-100 p-5">
            <label className="text-xs font-semibold text-amber-800 uppercase tracking-wide block mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-transparent text-sm text-amber-900 focus:outline-none resize-none"
              placeholder="Add notes..."
            />
          </div>
        </div>
      )}

      {/* ── Tab: Sub-Recipe Report ── */}
      {tab === 'sub-recipes' && (
        <div>
          {reportLoading ? (
            <div className="text-center py-20 text-gray-400">Calculating sub-recipe totals...</div>
          ) : !subRecipeReport ? (
            <div className="text-center py-20">
              <button
                onClick={loadSubRecipeReport}
                className="px-4 py-2 bg-brand-500 text-white text-sm rounded-lg"
              >
                Generate Report
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {subRecipeReport.total_sub_recipes} sub-recipes needed · click{' '}
                  <span className="font-medium text-gray-700">▶ Ingredients</span> to see scaled ingredient weights
                </p>
                <button
                  onClick={() => {
                    setSubRecipeReport(null);
                    loadSubRecipeReport();
                  }}
                  className="text-xs text-brand-600 hover:underline"
                >
                  Refresh
                </button>
              </div>

              {Object.entries(subRecipeReport.grouped_by_station)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([station, rows]) => (
                  <div key={station} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Station header */}
                    <button
                      className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors text-left"
                      onClick={() =>
                        setExpandedStations((prev) => {
                          const next = new Set(prev);
                          next.has(station) ? next.delete(station) : next.add(station);
                          return next;
                        })
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold">
                          {station}
                        </span>
                        <span className="text-sm text-gray-500">{rows.length} sub-recipes</span>
                      </div>
                      <span className="text-gray-400 text-xs">
                        {expandedStations.has(station) ? '▲' : '▼'}
                      </span>
                    </button>

                    {expandedStations.has(station) && (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Priority
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Sub-Recipe
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Code
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Prod. Day
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                              Total Qty
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Unit
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              Ingredients
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {rows.map((row) => (
                            <SubRecipeReportRow
                              key={row.id}
                              row={row}
                              expanded={expandedIngredients.has(row.id)}
                              onToggle={() => toggleIngredients(row.id)}
                            />
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}

              {Object.keys(subRecipeReport.grouped_by_station).length === 0 && (
                <div className="text-center py-20 text-gray-400">
                  No sub-recipes found — make sure meals have quantities &gt; 0
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Shopping List ── */}
      {tab === 'shopping' && (
        <div>
          {reportLoading ? (
            <div className="text-center py-20 text-gray-400">Calculating shopping list...</div>
          ) : !shoppingList ? (
            <div className="text-center py-20">
              <button
                onClick={loadShoppingList}
                className="px-4 py-2 bg-brand-500 text-white text-sm rounded-lg"
              >
                Generate Shopping List
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {shoppingList.total_ingredients} ingredients across{' '}
                  {Object.keys(shoppingList.grouped_by_category).length} categories
                </p>
                <button
                  onClick={() => {
                    setShoppingList(null);
                    loadShoppingList();
                  }}
                  className="text-xs text-brand-600 hover:underline"
                >
                  Refresh
                </button>
              </div>

              {Object.entries(shoppingList.grouped_by_category)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([cat, rows]) => (
                  <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-700">{cat}</span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                        {rows.length} items
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/50">
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Ingredient
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            SKU
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            Total Qty
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Unit
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Supplier
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Location
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            Allergens
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {rows.map((row) => (
                          <tr key={row.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-900">{row.internal_name}</td>
                            <td className="px-4 py-2.5 font-mono text-gray-500 text-xs">{row.sku}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                              {row.total_quantity.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500">{row.unit}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">
                              {row.supplier_name ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{row.location ?? '—'}</td>
                            <td className="px-4 py-2.5">
                              {row.allergen_tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {row.allergen_tags.map((a) => (
                                    <span
                                      key={a}
                                      className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-xs"
                                    >
                                      {a}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

              {Object.keys(shoppingList.grouped_by_category).length === 0 && (
                <div className="text-center py-20 text-gray-400">
                  No ingredients found — make sure meals have quantities &gt; 0
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Station Tasks ── */}
      {tab === 'tasks' && (
        <div className="space-y-4">
          {/* Add task form */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Station Task</h3>
            <div className="space-y-2">
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Task title (required)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <input
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <div className="flex gap-2">
                <select
                  value={taskStation}
                  onChange={(e) => setTaskStation(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  <option value="">All Stations</option>
                  {['Veg Station', 'Protein Station', 'Sauce Station', 'Oven Station', 'Breakfast + Sides Station', 'Batch Station', 'Packaging Station'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddTask}
                  disabled={addingTask || !taskTitle.trim()}
                  className="px-4 py-2 bg-brand-500 text-white text-sm rounded-lg hover:bg-brand-600 disabled:opacity-50"
                >
                  {addingTask ? 'Adding...' : '+ Add Task'}
                </button>
              </div>
            </div>
          </div>

          {/* Task list */}
          {stationTasks.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No station tasks yet. Add one above.</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {stationTasks.map((t) => (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${t.completed_at ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {t.completed_at ? '✓' : '○'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${t.completed_at ? 'line-through text-gray-400' : 'text-gray-900'}`}>{t.title}</p>
                    {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                    <div className="flex flex-wrap gap-2 mt-1">
                      {t.station && <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{t.station}</span>}
                      {t.completed_by && <span className="text-xs text-green-600">✓ Done by {t.completed_by.name}</span>}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteTask(t.id)} className="text-gray-300 hover:text-red-400 text-sm flex-shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-component: ingredient breakdown row ─────────────────────────────────

function SubRecipeReportRow({
  row,
  expanded,
  onToggle,
}: {
  row: PlanSubRecipeRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasIngredients = row.ingredients && row.ingredients.length > 0;

  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-2.5">
          <span
            className={`px-1.5 py-0.5 rounded text-xs font-bold ${
              PRIORITY_COLOR[row.priority] ?? PRIORITY_COLOR[3]
            }`}
          >
            P{row.priority}
          </span>
        </td>
        <td className="px-4 py-2.5 font-medium text-gray-900">{row.name}</td>
        <td className="px-4 py-2.5 font-mono text-gray-500 text-xs">{row.sub_recipe_code}</td>
        <td className="px-4 py-2.5 text-gray-500">{row.production_day ?? '—'}</td>
        <td className="px-4 py-2.5 text-right">
          <span className="font-semibold text-gray-900">{row.total_quantity.toLocaleString()}</span>
          {row.scale_factor !== 1 && (
            <span className="ml-1 text-xs text-gray-400">×{row.scale_factor}</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-gray-500">{row.unit}</td>
        <td className="px-4 py-2.5">
          {hasIngredients ? (
            <button
              onClick={onToggle}
              className={`text-xs font-medium rounded px-2 py-0.5 transition-colors ${
                expanded
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {expanded ? '▼' : '▶'} {row.ingredients.length} ingredients
            </button>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </td>
      </tr>

      {/* Meal breakdown sub-row */}
      {row.meal_breakdown.length > 1 && !expanded && (
        <tr className="bg-gray-50/50">
          <td colSpan={7} className="px-8 py-1">
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400">
              {row.meal_breakdown.map((b, i) => (
                <span key={i}>
                  {b.meal}: {b.qty.toLocaleString()} {row.unit}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}

      {/* Expanded ingredient breakdown */}
      {expanded && hasIngredients && (
        <tr className="bg-brand-50/30">
          <td colSpan={7} className="px-6 py-3">
            {/* Meal breakdown if multiple meals */}
            {row.meal_breakdown.length > 1 && (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 mb-2 pb-2 border-b border-brand-100">
                <span className="text-gray-500 font-medium mr-1">Meals:</span>
                {row.meal_breakdown.map((b, i) => (
                  <span key={i}>
                    {b.meal}: {b.qty.toLocaleString()} {row.unit}
                  </span>
                ))}
              </div>
            )}

            {/* Ingredient table */}
            <div className="text-xs font-semibold text-brand-700 mb-1.5 uppercase tracking-wide">
              Ingredients needed (scaled ×{row.scale_factor})
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left pb-1 font-medium">Ingredient / Sub-Recipe</th>
                  <th className="text-left pb-1 font-medium">SKU / Code</th>
                  <th className="text-right pb-1 font-medium">Qty needed</th>
                  <th className="text-left pb-1 font-medium pl-2">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100">
                {row.ingredients.map((ing) => (
                  <tr key={ing.id}>
                    <td className="py-1 font-medium text-gray-800">
                      {ing.type === 'sub_recipe' && (
                        <span className="text-blue-500 mr-1">[sub]</span>
                      )}
                      {ing.name}
                    </td>
                    <td className="py-1 font-mono text-gray-400">{ing.sku}</td>
                    <td className="py-1 text-right font-semibold text-gray-900">
                      {ing.quantity.toLocaleString()}
                    </td>
                    <td className="py-1 pl-2 text-gray-500">{ing.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
