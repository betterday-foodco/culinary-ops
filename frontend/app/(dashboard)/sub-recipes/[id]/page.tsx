'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Ingredient, SubRecipe } from '../../../lib/api';

interface ComponentDetail {
  id: string;
  quantity: number;
  unit: string;
  ingredient_id: string | null;
  child_sub_recipe_id: string | null;
  ingredient: {
    id: string;
    internal_name: string;
    sku: string;
    cost_per_unit: number;
    unit: string;
  } | null;
  child_sub_recipe: {
    id: string;
    name: string;
    sub_recipe_code: string;
    computed_cost: number;
    priority: number;
  } | null;
}

interface SubRecipeDetail {
  id: string;
  name: string;
  display_name: string | null;
  sub_recipe_code: string;
  instructions: string | null;
  production_day: string | null;
  station_tag: string | null;
  priority: number;
  base_yield_weight: number;
  base_yield_unit: string;
  computed_cost: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  components: ComponentDetail[];
}

type Tab = 'details' | 'components';

const priorityLabel = (p: number) => ['', 'Wednesday', 'Thursday', 'Friday', 'Friday'][p] ?? `Day ${p}`;
const priorityColor = (p: number) => [
  '',
  'bg-blue-100 text-blue-800',    // Wednesday
  'bg-green-100 text-green-800',  // Thursday
  'bg-orange-100 text-orange-800', // Friday
  'bg-orange-100 text-orange-800', // Friday (p4)
][p] ?? 'bg-gray-100 text-gray-700';

const PRIORITY_INFO: Record<number, { label: string; color: string }> = {
  1: { label: priorityLabel(1), color: priorityColor(1) },
  2: { label: priorityLabel(2), color: priorityColor(2) },
  3: { label: priorityLabel(3), color: priorityColor(3) },
  4: { label: priorityLabel(4), color: priorityColor(4) },
  5: { label: 'P5 – Optional', color: 'bg-gray-100 text-gray-500' },
};

const PRODUCTION_DAYS = ['AM', 'Tue', 'Wed', 'Thu', 'Fri', 'PM', 'Weekend'];

export default function SubRecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [sr, setSr]           = useState<SubRecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState<Tab>('details');
  const [stationTags, setStationTags] = useState<string[]>([]);

  // ── Details form ──────────────────────────────────────────────────────
  const [name, setName]                   = useState('');
  const [displayName, setDisplayName]     = useState('');
  const [code, setCode]                   = useState('');
  const [stationTag, setStationTag]       = useState('');
  const [customStation, setCustomStation] = useState('');
  const [priority, setPriority]           = useState(3);
  const [productionDay, setProductionDay] = useState('');
  const [baseYield, setBaseYield]         = useState('');
  const [baseYieldUnit, setBaseYieldUnit] = useState('gr');
  const [isActive, setIsActive]           = useState(true);
  const [instructions, setInstructions]   = useState('');

  // ── Component add state ───────────────────────────────────────────────
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [allSubRecipes, setAllSubRecipes]   = useState<SubRecipe[]>([]);
  const [addType, setAddType]               = useState<'ingredient' | 'sub_recipe'>('ingredient');
  const [addRefId, setAddRefId]             = useState('');
  const [addQty, setAddQty]                 = useState('1');
  const [addUnit, setAddUnit]               = useState('gr');
  const [addSearch, setAddSearch]           = useState('');
  const [editingComp, setEditingComp]       = useState<string | null>(null);
  const [editQty, setEditQty]               = useState('');
  const [editUnit, setEditUnit]             = useState('');

  const loadSubRecipe = useCallback(async () => {
    setLoading(true);
    try {
      const [data, tags, ingr, subs] = await Promise.all([
        api.getSubRecipe(id) as Promise<SubRecipeDetail>,
        api.getStationTags(),
        api.getIngredients(),
        api.getSubRecipes(),
      ]);
      setSr(data);
      setName(data.name);
      setDisplayName(data.display_name ?? '');
      setCode(data.sub_recipe_code);
      setStationTag(data.station_tag ?? '');
      setPriority(data.priority ?? 3);
      setProductionDay(data.production_day ?? '');
      setBaseYield(data.base_yield_weight?.toString() ?? '0');
      setBaseYieldUnit(data.base_yield_unit ?? 'gr');
      setIsActive(data.is_active ?? true);
      setInstructions(data.instructions ?? '');
      setStationTags(tags as string[]);
      setAllIngredients(ingr);
      setAllSubRecipes(subs.filter((s) => s.id !== id));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadSubRecipe(); }, [loadSubRecipe]);

  async function handleSave() {
    setSaving(true);
    try {
      const effectiveStation =
        stationTag === '__custom__' ? customStation : (stationTag || undefined);
      await api.updateSubRecipe(id, {
        name,
        display_name: displayName || undefined,
        sub_recipe_code: code,
        station_tag: effectiveStation,
        priority,
        production_day: productionDay || undefined,
        base_yield_weight: parseFloat(baseYield) || 0,
        base_yield_unit: baseYieldUnit,
        is_active: isActive,
        instructions: instructions || undefined,
      } as any);
      await loadSubRecipe();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddComponent() {
    if (!addRefId) { alert('Select an ingredient or sub-recipe first.'); return; }
    try {
      await api.addSubRecipeComponent(id, {
        ingredient_id: addType === 'ingredient' ? addRefId : undefined,
        child_sub_recipe_id: addType === 'sub_recipe' ? addRefId : undefined,
        quantity: parseFloat(addQty) || 1,
        unit: addUnit,
      });
      setAddRefId(''); setAddSearch(''); setAddQty('1');
      await loadSubRecipe();
    } catch (e: any) { alert(e.message); }
  }

  async function handleUpdateComponent(componentId: string) {
    try {
      await api.updateSubRecipeComponent(id, componentId, {
        quantity: parseFloat(editQty),
        unit: editUnit,
      });
      setEditingComp(null);
      await loadSubRecipe();
    } catch (e: any) { alert(e.message); }
  }

  async function handleRemoveComponent(componentId: string) {
    if (!confirm('Remove this component?')) return;
    try {
      await api.removeSubRecipeComponent(id, componentId);
      await loadSubRecipe();
    } catch (e: any) { alert(e.message); }
  }

  const filteredAddList =
    addType === 'ingredient'
      ? allIngredients.filter(
          (i) =>
            !addSearch ||
            i.internal_name.toLowerCase().includes(addSearch.toLowerCase()) ||
            i.sku.toLowerCase().includes(addSearch.toLowerCase()),
        )
      : allSubRecipes.filter(
          (s) =>
            !addSearch ||
            s.name.toLowerCase().includes(addSearch.toLowerCase()) ||
            s.sub_recipe_code.toLowerCase().includes(addSearch.toLowerCase()),
        );

  if (loading) return <div className="p-8 text-center text-gray-400">Loading sub-recipe...</div>;
  if (!sr) return <div className="p-8 text-center text-gray-400">Sub-recipe not found</div>;

  const cost = sr.computed_cost;
  const pInfo = PRIORITY_INFO[priority] ?? PRIORITY_INFO[3];

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push('/sub-recipes')}
            className="text-gray-400 hover:text-gray-600 text-sm mb-1 block"
          >
            ← Sub-Recipes
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{sr.name}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${pInfo.color}`}>
              {pInfo.label}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-xs text-gray-400 font-mono">#{sr.sub_recipe_code}</p>
            {sr.station_tag && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                {sr.station_tag}
              </span>
            )}
            {sr.production_day && (
              <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">
                {sr.production_day}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cost > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Production Cost</p>
              <p className="text-xl font-bold text-gray-900">${cost.toFixed(4)}</p>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-green-500 text-white text-sm font-semibold rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'SAVE'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {(
          [
            ['details', 'Details'],
            ['components', `Ingredients / Components (${sr.components.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
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

      {/* ── Tab: Details ── */}
      {tab === 'details' && (
        <div className="space-y-5">
          {/* Names */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Basic Info</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Display Name <span className="text-gray-400">(customer-facing)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Leave blank to use Name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Code <span className="text-red-400">*</span> <span className="text-gray-400">(unique)</span>
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Base Yield</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={baseYield}
                    onChange={(e) => setBaseYield(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <select
                    value={baseYieldUnit}
                    onChange={(e) => setBaseYieldUnit(e.target.value)}
                    className="w-20 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
                  >
                    {['gr', 'Kgs', 'oz', 'lb', 'mL', 'L', 'un'].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-end">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg w-full">
                  <span className="text-sm font-medium text-gray-700">Active?</span>
                  <button
                    onClick={() => setIsActive(!isActive)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      isActive ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        isActive ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Kitchen Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Kitchen Settings</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Station</label>
                <select
                  value={
                    stationTag === ''
                      ? ''
                      : stationTags.includes(stationTag)
                        ? stationTag
                        : '__custom__'
                  }
                  onChange={(e) => {
                    if (e.target.value === '__custom__') { setStationTag('__custom__'); }
                    else { setStationTag(e.target.value); setCustomStation(''); }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">— none —</option>
                  {stationTags.map((t) => <option key={t} value={t}>{t}</option>)}
                  <option value="__custom__">+ New station…</option>
                </select>
                {stationTag === '__custom__' && (
                  <input
                    type="text"
                    value={customStation}
                    onChange={(e) => setCustomStation(e.target.value)}
                    placeholder="Station name..."
                    className="mt-2 w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Production Day</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value={1}>Wednesday</option>
                  <option value={2}>Thursday</option>
                  <option value={3}>Friday</option>
                  <option value={4}>Friday (Late)</option>
                  <option value={5}>P5 – Optional</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Production Day</label>
                <select
                  value={productionDay}
                  onChange={(e) => setProductionDay(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">— any day —</option>
                  {PRODUCTION_DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Kitchen Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={5}
              placeholder="Step-by-step preparation instructions for kitchen staff..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
        </div>
      )}

      {/* ── Tab: Components ── */}
      {tab === 'components' && (
        <div className="space-y-5">
          {/* Component table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Components</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Production Cost: <strong className="text-gray-700">${cost.toFixed(4)}</strong>
                  <span className="ml-3">({sr.components.length} items)</span>
                </p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">SKU / Code</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sr.components.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      No components yet — add below
                    </td>
                  </tr>
                ) : (
                  sr.components.map((comp) => {
                    const isEditing = editingComp === comp.id;
                    const compCost = comp.child_sub_recipe
                      ? comp.child_sub_recipe.computed_cost * comp.quantity
                      : comp.ingredient
                        ? comp.ingredient.cost_per_unit * comp.quantity
                        : 0;
                    return (
                      <tr key={comp.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              comp.child_sub_recipe_id
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-orange-50 text-orange-700'
                            }`}
                          >
                            {comp.child_sub_recipe_id ? 'Sub-Recipe' : 'Ingredient'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {comp.child_sub_recipe?.name ?? comp.ingredient?.internal_name ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-500 text-xs">
                          {comp.child_sub_recipe?.sub_recipe_code ?? comp.ingredient?.sku ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={editQty}
                              onChange={(e) => setEditQty(e.target.value)}
                              className="w-20 px-2 py-1 border border-brand-400 rounded text-sm text-right focus:outline-none"
                            />
                          ) : (
                            <span className="text-gray-900">{comp.quantity}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editUnit}
                              onChange={(e) => setEditUnit(e.target.value)}
                              className="w-16 px-2 py-1 border border-brand-400 rounded text-sm focus:outline-none"
                            />
                          ) : (
                            <span className="text-gray-500">{comp.unit}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">
                          {compCost > 0 ? `$${compCost.toFixed(4)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {isEditing ? (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => handleUpdateComponent(comp.id)}
                                className="text-xs text-green-600 hover:underline"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingComp(null)}
                                className="text-xs text-gray-400 hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => {
                                  setEditingComp(comp.id);
                                  setEditQty(comp.quantity.toString());
                                  setEditUnit(comp.unit);
                                }}
                                className="text-xs text-brand-600 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleRemoveComponent(comp.id)}
                                className="text-xs text-red-500 hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {sr.components.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td colSpan={5} className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">
                      Total Production Cost
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                      ${cost.toFixed(4)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Add component */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Add Component</h2>
            <div className="grid grid-cols-[140px_1fr_90px_70px_auto] gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select
                  value={addType}
                  onChange={(e) => {
                    setAddType(e.target.value as any);
                    setAddRefId('');
                    setAddSearch('');
                  }}
                  className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="ingredient">Ingredient</option>
                  <option value="sub_recipe">Sub-Recipe</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {addType === 'ingredient' ? 'Ingredient' : 'Sub-Recipe'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={addSearch}
                    onChange={(e) => { setAddSearch(e.target.value); setAddRefId(''); }}
                    placeholder={
                      addType === 'ingredient' ? 'Search ingredients...' : 'Search sub-recipes...'
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  {addRefId && (
                    <div className="mt-1 px-2 py-1 bg-brand-50 rounded text-xs text-brand-700 flex items-center justify-between">
                      <span>
                        {addType === 'ingredient'
                          ? allIngredients.find((i) => i.id === addRefId)?.internal_name
                          : allSubRecipes.find((s) => s.id === addRefId)?.name}
                      </span>
                      <button
                        onClick={() => { setAddRefId(''); setAddSearch(''); }}
                        className="text-brand-400 hover:text-brand-600 ml-2"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {addSearch && !addRefId && filteredAddList.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredAddList.slice(0, 12).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setAddRefId(item.id);
                            setAddSearch(
                              addType === 'ingredient'
                                ? (item as Ingredient).internal_name
                                : (item as SubRecipe).name,
                            );
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                        >
                          <span className="font-medium">
                            {addType === 'ingredient'
                              ? (item as Ingredient).internal_name
                              : (item as SubRecipe).name}
                          </span>
                          <span className="text-xs text-gray-400 ml-2">
                            {addType === 'ingredient'
                              ? (item as Ingredient).sku
                              : (item as SubRecipe).sub_recipe_code}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
                <input
                  type="text"
                  value={addUnit}
                  onChange={(e) => setAddUnit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <button
                onClick={handleAddComponent}
                className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors whitespace-nowrap"
              >
                + Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save footer */}
      <div className="mt-8 flex justify-end gap-3">
        <button
          onClick={() => router.push('/sub-recipes')}
          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-green-500 text-white text-sm font-semibold rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
