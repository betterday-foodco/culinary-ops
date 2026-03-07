'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Ingredient, SubRecipe } from '../../../lib/api';

interface MealDetail {
  id: string;
  name: string;
  display_name: string;
  category: string | null;
  final_yield_weight: number;
  pricing_override: number | null;
  computed_cost: number;
  allergen_tags: string[];
  dislikes: string[];
  heating_instructions: string | null;
  packaging_instructions: string | null;
  cooking_instructions: string | null;
  description: string | null;
  image_url: string | null;
  net_weight_kg: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  components: ComponentDetail[];
}

interface ComponentDetail {
  id: string;
  quantity: number;
  unit: string;
  ingredient_id: string | null;
  sub_recipe_id: string | null;
  ingredient: {
    id: string;
    internal_name: string;
    display_name: string;
    sku: string;
    cost_per_unit: number;
    unit: string;
  } | null;
  sub_recipe: {
    id: string;
    name: string;
    sub_recipe_code: string;
    station_tag: string | null;
    computed_cost: number;
    priority: number;
  } | null;
}

type Tab = 'details' | 'components' | 'pricing';

const ALLERGEN_COLORS = [
  'bg-red-50 text-red-700',
  'bg-orange-50 text-orange-700',
  'bg-yellow-50 text-yellow-700',
  'bg-pink-50 text-pink-700',
];

const CATEGORIES = ['Meat', 'Vegan', 'Vegetarian', 'Fish & Seafood', 'Breakfast', 'Snack', 'Soup', 'Salad', 'Granola', 'Other'];

export default function MealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [meal, setMeal] = useState<MealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('details');

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [internalName, setInternalName] = useState('');
  const [category, setCategory] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [pricingOverride, setPricingOverride] = useState('');
  const [finalYieldWeight, setFinalYieldWeight] = useState('');
  const [netWeightKg, setNetWeightKg] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [heatingInstructions, setHeatingInstructions] = useState('');
  const [packagingInstructions, setPackagingInstructions] = useState('');
  const [cookingInstructions, setCookingInstructions] = useState('');
  const [allergenTags, setAllergenTags] = useState<string[]>([]);
  const [allergenInput, setAllergenInput] = useState('');
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [dislikesInput, setDislikesInput] = useState('');

  // Component add state
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [allSubRecipes, setAllSubRecipes] = useState<SubRecipe[]>([]);
  const [addType, setAddType] = useState<'sub_recipe' | 'ingredient'>('sub_recipe');
  const [addRefId, setAddRefId] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addUnit, setAddUnit] = useState('gr');
  const [addSearch, setAddSearch] = useState('');
  const [editingComponent, setEditingComponent] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');

  const loadMeal = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getMeal(id) as unknown as MealDetail;
      setMeal(data);
      setDisplayName(data.display_name);
      setInternalName(data.name);
      setCategory(data.category ?? '');
      setIsActive(data.is_active);
      setPricingOverride(data.pricing_override?.toString() ?? '');
      setFinalYieldWeight(data.final_yield_weight?.toString() ?? '0');
      setNetWeightKg(data.net_weight_kg?.toString() ?? '0');
      setDescription(data.description ?? '');
      setImageUrl(data.image_url ?? '');
      setHeatingInstructions(data.heating_instructions ?? '');
      setPackagingInstructions(data.packaging_instructions ?? '');
      setCookingInstructions(data.cooking_instructions ?? '');
      setAllergenTags(data.allergen_tags ?? []);
      setDislikes(data.dislikes ?? []);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadMeal();
    Promise.all([api.getIngredients(), api.getSubRecipes()]).then(([i, s]) => {
      setAllIngredients(i);
      setAllSubRecipes(s);
    });
  }, [loadMeal]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateMeal(id, {
        display_name: displayName,
        name: internalName,
        category: category || undefined,
        is_active: isActive,
        pricing_override: pricingOverride ? parseFloat(pricingOverride) : undefined,
        final_yield_weight: parseFloat(finalYieldWeight) || 0,
        net_weight_kg: parseFloat(netWeightKg) || 0,
        description: description || undefined,
        image_url: imageUrl || undefined,
        heating_instructions: heatingInstructions || undefined,
        packaging_instructions: packagingInstructions || undefined,
        cooking_instructions: cookingInstructions || undefined,
        allergen_tags: allergenTags,
        dislikes: dislikes,
      } as any);
      await loadMeal();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddComponent() {
    if (!addRefId) { alert('Select a sub-recipe or ingredient first.'); return; }
    try {
      await (api as any).addMealComponent(id, {
        sub_recipe_id: addType === 'sub_recipe' ? addRefId : undefined,
        ingredient_id: addType === 'ingredient' ? addRefId : undefined,
        quantity: parseFloat(addQty) || 1,
        unit: addUnit,
      });
      setAddRefId('');
      setAddSearch('');
      setAddQty('1');
      await loadMeal();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleUpdateComponent(componentId: string) {
    try {
      await (api as any).updateMealComponent(id, componentId, {
        quantity: parseFloat(editQty),
        unit: editUnit,
      });
      setEditingComponent(null);
      await loadMeal();
    } catch (e: any) { alert(e.message); }
  }

  async function handleRemoveComponent(componentId: string) {
    if (!confirm('Remove this component from the meal?')) return;
    try {
      await (api as any).removeMealComponent(id, componentId);
      await loadMeal();
    } catch (e: any) { alert(e.message); }
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image is too large. Please use an image under 2MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImageUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  function addAllergen() {
    const a = allergenInput.trim();
    if (a && !allergenTags.includes(a)) setAllergenTags((prev) => [...prev, a]);
    setAllergenInput('');
  }

  function addDislike() {
    const d = dislikesInput.trim();
    if (d && !dislikes.includes(d)) setDislikes((prev) => [...prev, d]);
    setDislikesInput('');
  }

  const filteredAddList = addType === 'sub_recipe'
    ? allSubRecipes.filter((s) => !addSearch || s.name.toLowerCase().includes(addSearch.toLowerCase()) || s.sub_recipe_code.toLowerCase().includes(addSearch.toLowerCase()))
    : allIngredients.filter((i) => !addSearch || i.internal_name.toLowerCase().includes(addSearch.toLowerCase()) || i.sku.toLowerCase().includes(addSearch.toLowerCase()));

  if (loading) return <div className="p-8 text-center text-gray-400">Loading meal...</div>;
  if (!meal) return <div className="p-8 text-center text-gray-400">Meal not found</div>;

  const cost = meal.computed_cost;
  const sell = parseFloat(pricingOverride) || meal.pricing_override || 0;
  const profit = sell > 0 && cost > 0 ? sell - cost : null;
  const markupPct = profit !== null && cost > 0 ? (profit / cost) * 100 : null;

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => router.push('/meals')} className="text-gray-400 hover:text-gray-600 text-sm mb-1 block">← Meal Recipes</button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{meal.display_name}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Internal: {meal.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {cost > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Production Cost</p>
              <p className="text-xl font-bold text-gray-900">${cost.toFixed(2)}</p>
            </div>
          )}
          {profit !== null && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Profit</p>
              <p className="text-xl font-bold text-green-600">${profit.toFixed(2)}</p>
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

      {/* Top: Image + basic toggles */}
      <div className="grid grid-cols-[220px_1fr] gap-6 mb-6">
        {/* Image */}
        <div className="space-y-2">
          {/* Clickable image area — opens file picker */}
          <label className="block cursor-pointer group">
            <div className="w-full h-44 rounded-xl border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center group-hover:border-brand-400 transition-colors">
              {imageUrl ? (
                <div className="relative w-full h-full">
                  <img src={imageUrl} alt={meal.display_name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="text-white text-xs font-medium">Change Image</span>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-3xl mb-1">📷</p>
                  <p className="text-xs text-brand-500 font-medium">Click to upload image</p>
                  <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, WebP · max 2MB</p>
                </div>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageFile}
            />
          </label>
          {imageUrl && (
            <button
              onClick={() => setImageUrl('')}
              className="w-full text-xs text-red-400 hover:text-red-600 py-1"
            >
              × Remove image
            </button>
          )}
        </div>

        {/* Toggles + quick fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* is_active toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Is Active?</span>
              <button
                onClick={() => setIsActive(!isActive)}
                className={`relative w-10 h-5 rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 max-w-32"
              >
                <option value="">— none —</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Display Name <span className="text-gray-400">({displayName.length}/100)</span></label>
              <input type="text" maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Internal Name (Admin)</label>
              <input type="text" value={internalName} onChange={(e) => setInternalName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sell Price ($)</label>
              <input type="number" min="0" step="0.01" value={pricingOverride} onChange={(e) => setPricingOverride(e.target.value)}
                placeholder="16.99"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Final Yield (g)</label>
              <input type="number" min="0" value={finalYieldWeight} onChange={(e) => setFinalYieldWeight(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Net Weight (kg)</label>
              <input type="number" min="0" step="0.001" value={netWeightKg} onChange={(e) => setNetWeightKg(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([['details', 'Details & Instructions'], ['components', `Ingredients / Sub-recipes (${meal.components.length})`], ['pricing', 'Prices & Margins']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === key ? 'border-brand-500 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Details ── */}
      {tab === 'details' && (
        <div className="space-y-5">
          {/* Allergens */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Allergens & Dislikes</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Allergens</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {allergenTags.map((a, i) => (
                    <span key={a} className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${ALLERGEN_COLORS[i % ALLERGEN_COLORS.length]}`}>
                      {a}
                      <button onClick={() => setAllergenTags((p) => p.filter((x) => x !== a))} className="opacity-60 hover:opacity-100">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={allergenInput} onChange={(e) => setAllergenInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addAllergen()}
                    placeholder="Type allergen + Enter"
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  <button onClick={addAllergen} className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200">Add</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Dislikes</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {dislikes.map((d) => (
                    <span key={d} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs flex items-center gap-1">
                      {d}
                      <button onClick={() => setDislikes((p) => p.filter((x) => x !== d))} className="opacity-60 hover:opacity-100">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={dislikesInput} onChange={(e) => setDislikesInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addDislike()}
                    placeholder="Type dislike + Enter"
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  <button onClick={addDislike} className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200">Add</button>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-xs font-medium text-gray-600 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Meal description shown to customers..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Instructions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Kitchen Instructions</h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cooking Instructions</label>
                <textarea value={cookingInstructions} onChange={(e) => setCookingInstructions(e.target.value)} rows={3}
                  placeholder="How to cook this meal..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Heating Instructions</label>
                <textarea value={heatingInstructions} onChange={(e) => setHeatingInstructions(e.target.value)} rows={2}
                  placeholder="How to reheat this meal..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Packaging Instructions</label>
                <textarea value={packagingInstructions} onChange={(e) => setPackagingInstructions(e.target.value)} rows={2}
                  placeholder="How to package this meal..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Components ── */}
      {tab === 'components' && (
        <div className="space-y-5">
          {/* Component list */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Components</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Production Cost: <strong className="text-gray-700">${cost.toFixed(2)}</strong>
                  {cost > 0 && <span className="ml-3">({meal.components.length} items)</span>}
                </p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code / SKU</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Station</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Prod. Cost</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {meal.components.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No components yet — add below</td></tr>
                ) : (
                  meal.components.map((comp) => {
                    const isEditing = editingComponent === comp.id;
                    const compCost = comp.sub_recipe
                      ? comp.sub_recipe.computed_cost * comp.quantity
                      : comp.ingredient
                        ? comp.ingredient.cost_per_unit * comp.quantity
                        : 0;
                    return (
                      <tr key={comp.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${comp.sub_recipe_id ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
                            {comp.sub_recipe_id ? 'Sub-Recipe' : 'Ingredient'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {comp.sub_recipe?.name ?? comp.ingredient?.internal_name ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-500 text-xs">
                          {comp.sub_recipe?.sub_recipe_code ?? comp.ingredient?.sku ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">
                          {comp.sub_recipe?.station_tag ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {isEditing ? (
                            <input type="number" min="0" step="0.001" value={editQty}
                              onChange={(e) => setEditQty(e.target.value)}
                              className="w-20 px-2 py-1 border border-brand-400 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-brand-500" />
                          ) : (
                            <span className="text-gray-900">{comp.quantity}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {isEditing ? (
                            <input type="text" value={editUnit}
                              onChange={(e) => setEditUnit(e.target.value)}
                              className="w-16 px-2 py-1 border border-brand-400 rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
                          ) : (
                            <span className="text-gray-500">{comp.unit}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">
                          {compCost > 0 ? `$${compCost.toFixed(3)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {isEditing ? (
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => handleUpdateComponent(comp.id)} className="text-xs text-green-600 hover:underline">Save</button>
                              <button onClick={() => setEditingComponent(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => { setEditingComponent(comp.id); setEditQty(comp.quantity.toString()); setEditUnit(comp.unit); }}
                                className="text-xs text-brand-600 hover:underline"
                              >
                                Edit
                              </button>
                              <button onClick={() => handleRemoveComponent(comp.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {meal.components.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td colSpan={6} className="px-4 py-2.5 text-xs font-medium text-gray-500 text-right">Total Production Cost</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">${cost.toFixed(2)}</td>
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
                <select value={addType} onChange={(e) => { setAddType(e.target.value as any); setAddRefId(''); setAddSearch(''); }}
                  className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500">
                  <option value="sub_recipe">Sub-Recipe</option>
                  <option value="ingredient">Ingredient</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {addType === 'sub_recipe' ? 'Sub-Recipe' : 'Ingredient'}
                </label>
                <div className="relative">
                  <input type="text" value={addSearch} onChange={(e) => { setAddSearch(e.target.value); setAddRefId(''); }}
                    placeholder={addType === 'sub_recipe' ? 'Search sub-recipes...' : 'Search ingredients...'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
                  {addRefId && (
                    <div className="mt-1 px-2 py-1 bg-brand-50 rounded text-xs text-brand-700 flex items-center justify-between">
                      <span>{addType === 'sub_recipe'
                        ? allSubRecipes.find((s) => s.id === addRefId)?.name
                        : allIngredients.find((i) => i.id === addRefId)?.internal_name}
                      </span>
                      <button onClick={() => { setAddRefId(''); setAddSearch(''); }} className="text-brand-400 hover:text-brand-600 ml-2">×</button>
                    </div>
                  )}
                  {addSearch && !addRefId && filteredAddList.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredAddList.slice(0, 12).map((item) => (
                        <button key={item.id} onClick={() => { setAddRefId(item.id); setAddSearch((item as any).name ?? (item as any).internal_name); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                          <span className="font-medium">{(item as any).name ?? (item as any).internal_name}</span>
                          <span className="text-xs text-gray-400 ml-2">{(item as any).sub_recipe_code ?? (item as any).sku}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                <input type="number" min="0" step="0.001" value={addQty} onChange={(e) => setAddQty(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
                <input type="text" value={addUnit} onChange={(e) => setAddUnit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
              <button onClick={handleAddComponent}
                className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors whitespace-nowrap">
                + Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Pricing ── */}
      {tab === 'pricing' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Left: Price entry */}
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">Meal Prep Price</h2>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Regular Selling Price ($)</label>
                <input type="number" min="0" step="0.01" value={pricingOverride}
                  onChange={(e) => setPricingOverride(e.target.value)}
                  placeholder="16.99"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="p-3 bg-gray-50 rounded-lg text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">Production Price</span>
                  <span className="font-semibold text-gray-900">${cost.toFixed(2)}</span>
                </div>
                {sell > 0 && (
                  <>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-500">Selling Price</span>
                      <span className="font-semibold text-gray-900">${sell.toFixed(2)}</span>
                    </div>
                    {profit !== null && (
                      <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                        <span className="text-gray-500">Profit</span>
                        <span className={`font-bold ${profit > 0 ? 'text-green-600' : 'text-red-500'}`}>${profit.toFixed(2)}</span>
                      </div>
                    )}
                    {markupPct !== null && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Markup</span>
                        <span className={`font-bold ${markupPct >= 200 ? 'text-green-600' : markupPct >= 100 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {markupPct.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Margin recommendations */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Selling Price Recommendations</h2>
            {cost > 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 mb-4">Based on production cost of <strong>${cost.toFixed(2)}</strong></p>
                {[20, 25, 30, 35].map((markup) => {
                  const price = cost * (1 + markup / 100);
                  return (
                    <div key={markup} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer"
                      onClick={() => setPricingOverride(price.toFixed(2))}>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${markup >= 30 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{markup}%</span>
                        <span className="text-xs text-gray-500">markup</span>
                      </div>
                      <span className="font-semibold text-gray-900">${price.toFixed(2)}</span>
                    </div>
                  );
                })}
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500 mb-2">Custom Markup %</p>
                  <div className="flex gap-2 items-center">
                    <input type="number" id="custom-markup" min="0" step="1" placeholder="e.g. 300"
                      className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                      onChange={(e) => {
                        const pct = parseFloat(e.target.value);
                        if (!isNaN(pct) && cost > 0) setPricingOverride((cost * (1 + pct / 100)).toFixed(2));
                      }} />
                    <span className="text-xs text-gray-500">%  →</span>
                    <span className="text-sm font-semibold text-gray-900">
                      ${pricingOverride ? parseFloat(pricingOverride).toFixed(2) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 py-8 text-center">Add components to the meal to calculate production cost</p>
            )}
          </div>
        </div>
      )}

      {/* Save footer */}
      <div className="mt-8 flex justify-end gap-3">
        <button onClick={() => router.push('/meals')} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-green-500 text-white text-sm font-semibold rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
