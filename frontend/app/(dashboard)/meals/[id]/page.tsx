'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Ingredient, SubRecipe, PortionSpec, PortionSpecComponent } from '../../../lib/api';

// ─── Reference constants (from BetterDay reference design) ────────────────────
const ALLERGEN_OPTIONS = ['Coconut','Dairy','Eggs','Fish','Gluten','Mustard','Peanuts','Sesame','Shellfish','Soy','Sulphites','Tree Nuts','Wheat'];
const DISLIKE_OPTIONS  = ['Beef','Kale','Mushrooms','Onion','Pork','Raw Veg','Seafood','Spicy'];
const DIETARY_BADGE_OPTIONS = ['Gluten Friendly','High Protein','Dairy Free','Vegan','Family Friendly','Freezable','Spicy','New Dish'];
const PROTEIN_TYPE_OPTIONS  = ['Chicken','Turkey','Beef','Pork','Seafood','Plant Protein'];
const STARCH_OPTIONS   = ['Rice','Pasta','Potato','Quinoa','Other','None'];
const CONTAINER_OPTIONS = ['Meal Tray','Salad Container'];
const CATEGORIES = ['Meat','Vegan','Vegetarian','Fish & Seafood','Breakfast','Snack','Soup','Salad','Granola','Other'];

interface MealVariant { id: string; name: string; display_name: string; category: string | null; }

interface MealDetail {
  id: string; meal_code: string | null; name: string; display_name: string; category: string | null;
  linked_meal_id: string | null; linked_meal: MealVariant | null; variant_meals: MealVariant[];
  final_yield_weight: number; pricing_override: number | null; computed_cost: number;
  allergen_tags: string[]; dislikes: string[]; dietary_tags: string[]; protein_types: string[];
  heating_instructions: string | null; packaging_instructions: string | null; cooking_instructions: string | null;
  description: string | null; short_description: string | null; image_url: string | null;
  net_weight_kg: number; is_active: boolean;
  calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null;
  fiber_g: number | null; shelf_life_days: number | null; label_ingredients: string | null;
  starch_type: string | null; container_type: string | null; portion_score: number | null;
  created_at: string; updated_at: string; components: ComponentDetail[];
}

interface ComponentDetail {
  id: string; quantity: number; unit: string;
  sort_order: number; portioning_notes: string | null;
  ingredient_id: string | null; sub_recipe_id: string | null;
  ingredient: { id: string; internal_name: string; display_name: string; sku: string; cost_per_unit: number; unit: string; } | null;
  sub_recipe: { id: string; name: string; sub_recipe_code: string; station_tag: string | null; computed_cost: number; priority: number; base_yield_weight: number; base_yield_unit: string; } | null;
}

type Tab = 'details' | 'components' | 'label' | 'pricing' | 'portion-specs';

// ─── Unit normalisation (mirrors cost-engine.service.ts) ──────────────────────
function normalizeQty(quantity: number, fromUnit: string, toUnit: string): number {
  const from = (fromUnit ?? '').trim().toLowerCase();
  const to   = (toUnit   ?? '').trim().toLowerCase();
  if (from === to) return quantity;
  const toGrams = (qty: number, u: string): number | null => {
    switch (u) {
      case 'g': case 'gr': case 'gram': case 'grams': return qty;
      case 'kg': case 'kgs': case 'kilo': case 'kilos': case 'kilogram': case 'kilograms': return qty * 1000;
      case 'lb': case 'lbs': case 'pound': case 'pounds': return qty * 453.592;
      case 'oz': case 'ounce': case 'ounces': return qty * 28.3495;
      default: return null;
    }
  };
  const toMl = (qty: number, u: string): number | null => {
    switch (u) {
      case 'ml': case 'milliliter': case 'milliliters': return qty;
      case 'l': case 'liter': case 'liters': case 'litre': case 'litres': return qty * 1000;
      case 'cup': case 'cups': return qty * 240;
      case 'tbsp': case 'tablespoon': case 'tablespoons': return qty * 15;
      case 'tsp': case 'teaspoon': case 'teaspoons': return qty * 5;
      default: return null;
    }
  };
  const fg = toGrams(quantity, from); const tgt = fg !== null ? toGrams(1, to) : null;
  if (fg !== null && tgt !== null && tgt > 0) return fg / tgt;
  const fm = toMl(quantity, from); const tgtm = fm !== null ? toMl(1, to) : null;
  if (fm !== null && tgtm !== null && tgtm > 0) return fm / tgtm;
  return quantity;
}

/** Cost a single meal component the same way the backend engine does. */
function componentCost(c: ComponentDetail): number {
  if (c.ingredient) {
    const norm = normalizeQty(c.quantity, c.unit, c.ingredient.unit);
    return c.ingredient.cost_per_unit * norm;
  }
  if (c.sub_recipe) {
    const batchInCompUnit = normalizeQty(c.sub_recipe.base_yield_weight, c.sub_recipe.base_yield_unit, c.unit);
    const fraction = batchInCompUnit > 0 ? c.quantity / batchInCompUnit : 0;
    return c.sub_recipe.computed_cost * fraction;
  }
  return 0;
}

// ─── Pill picker helper ────────────────────────────────────────────────────────
function PillPicker({ options, selected, onToggle, color = 'brand' }: {
  options: string[]; selected: string[]; onToggle: (v: string) => void; color?: string;
}) {
  const on = color === 'red'    ? 'bg-red-100 text-red-700 border-red-300'
           : color === 'orange' ? 'bg-orange-100 text-orange-700 border-orange-300'
           : color === 'green'  ? 'bg-green-100 text-green-700 border-green-300'
           : color === 'purple' ? 'bg-purple-100 text-purple-700 border-purple-300'
           : 'bg-brand-100 text-brand-700 border-brand-300';
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onToggle(opt)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
            selected.includes(opt) ? on : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
          }`}
        >
          {selected.includes(opt) ? '✓ ' : ''}{opt}
        </button>
      ))}
    </div>
  );
}

export default function MealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [meal, setMeal] = useState<MealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('details');

  // ── Form state ────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState('');
  const [internalName, setInternalName] = useState('');
  const [category, setCategory] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [pricingOverride, setPricingOverride] = useState('');
  const [finalYieldWeight, setFinalYieldWeight] = useState('');
  const [netWeightKg, setNetWeightKg] = useState('');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [heatingInstructions, setHeatingInstructions] = useState('');
  const [packagingInstructions, setPackagingInstructions] = useState('');
  const [cookingInstructions, setCookingInstructions] = useState('');

  // Tags
  const [allergenTags, setAllergenTags] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [proteinTypes, setProteinTypes] = useState<string[]>([]);
  const [starchType, setStarchType] = useState('');
  const [containerType, setContainerType] = useState('');
  const [portionScore, setPortionScore] = useState<number | null>(null);

  // Macros
  const [calories, setCalories] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');
  const [fiberG, setFiberG] = useState('');
  const [shelfLifeDays, setShelfLifeDays] = useState('');
  const [labelIngredients, setLabelIngredients] = useState('');

  // Linked meal
  const [linkedMealId, setLinkedMealId] = useState<string | null>(null);
  const [linkedMealSearch, setLinkedMealSearch] = useState('');
  const [allMeals, setAllMeals] = useState<MealVariant[]>([]);
  // Variant suggestions
  const [suggestedVariants, setSuggestedVariants] = useState<any[]>([]);
  const [variantSearch, setVariantSearch] = useState('');
  const [variantSearchResults, setVariantSearchResults] = useState<any[]>([]);

  // Component add state
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [allSubRecipes, setAllSubRecipes] = useState<SubRecipe[]>([]);
  const [addType, setAddType] = useState<'sub_recipe' | 'ingredient'>('sub_recipe');
  const [addRefId, setAddRefId] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addUnit, setAddUnit] = useState('gr');
  const [addSearch, setAddSearch] = useState('');
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<string | null>(null);
  // Portioning state — local notes per component id
  const [portNotes, setPortNotes] = useState<Record<string, string>>({});
  const [portSaving, setPortSaving] = useState<Record<string, boolean>>({});
  // Pricing — custom margin
  const [customMargin, setCustomMargin] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');

  // Portion spec state
  const [portionSpec, setPortionSpec] = useState<PortionSpec | null>(null);
  const [portionSpecLoaded, setPortionSpecLoaded] = useState(false);
  const [psContainerType, setPsContainerType] = useState('');
  const [psWeightMin, setPsWeightMin] = useState('');
  const [psWeightMax, setPsWeightMax] = useState('');
  const [psGeneralNotes, setPsGeneralNotes] = useState('');
  const [psTastingNotes, setPsTastingNotes] = useState('');
  const [psComponents, setPsComponents] = useState<Array<{
    ingredient_name: string; portion_min: string; portion_max: string;
    portion_unit: string; tool: string; notes: string; sort_order: number;
  }>>([]);
  const [psSaving, setPsSaving] = useState(false);

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
      setShortDescription(data.short_description ?? '');
      setImageUrl(data.image_url ?? '');
      setHeatingInstructions(data.heating_instructions ?? '');
      setPackagingInstructions(data.packaging_instructions ?? '');
      setCookingInstructions(data.cooking_instructions ?? '');
      setAllergenTags(data.allergen_tags ?? []);
      setDislikes(data.dislikes ?? []);
      setDietaryTags(data.dietary_tags ?? []);
      setProteinTypes(data.protein_types ?? []);
      setStarchType(data.starch_type ?? '');
      setContainerType(data.container_type ?? '');
      setPortionScore(data.portion_score ?? null);
      setCalories(data.calories?.toString() ?? '');
      setProteinG(data.protein_g?.toString() ?? '');
      setCarbsG(data.carbs_g?.toString() ?? '');
      setFatG(data.fat_g?.toString() ?? '');
      setFiberG(data.fiber_g?.toString() ?? '');
      setShelfLifeDays(data.shelf_life_days?.toString() ?? '');
      setLabelIngredients(data.label_ingredients ?? '');
      setLinkedMealId(data.linked_meal_id ?? null);
      // init portioning notes from saved data
      const notes: Record<string, string> = {};
      data.components.forEach((c) => { notes[c.id] = c.portioning_notes ?? ''; });
      setPortNotes(notes);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadMeal();
    Promise.all([api.getIngredients(), api.getSubRecipes(), api.getMeals()]).then(([i, s, m]) => {
      setAllIngredients(i);
      setAllSubRecipes(s);
      setAllMeals(m as MealVariant[]);
    });
  }, [loadMeal]);

  // Load suggested variants once meal id is known
  useEffect(() => {
    if (id) {
      api.getSuggestedVariants(id).then(setSuggestedVariants).catch(() => {});
    }
  }, [id]);

  // Debounced variant search
  useEffect(() => {
    if (variantSearch.length < 2) { setVariantSearchResults([]); return; }
    const t = setTimeout(() => {
      api.searchMeals(variantSearch)
        .then((results) => setVariantSearchResults(results.slice(0, 5)))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [variantSearch]);

  const loadPortionSpec = useCallback(async () => {
    if (portionSpecLoaded) return;
    const spec = await api.getPortionSpecByMeal(id);
    setPortionSpec(spec);
    setPortionSpecLoaded(true);
    if (spec) {
      setPsContainerType(spec.container_type ?? '');
      setPsWeightMin(spec.total_weight_min?.toString() ?? '');
      setPsWeightMax(spec.total_weight_max?.toString() ?? '');
      setPsGeneralNotes(spec.general_notes ?? '');
      setPsTastingNotes(spec.tasting_notes ?? '');
      setPsComponents(spec.components.map(c => ({
        ingredient_name: c.ingredient_name,
        portion_min: c.portion_min?.toString() ?? '',
        portion_max: c.portion_max?.toString() ?? '',
        portion_unit: c.portion_unit ?? 'g',
        tool: c.tool ?? '',
        notes: c.notes ?? '',
        sort_order: c.sort_order,
      })));
    } else {
      setPsComponents([]);
    }
  }, [id, portionSpecLoaded]);

  async function handleSavePortionSpec() {
    setPsSaving(true);
    try {
      const data = {
        meal_id: id,
        container_type: psContainerType || undefined,
        total_weight_min: psWeightMin ? parseFloat(psWeightMin) : undefined,
        total_weight_max: psWeightMax ? parseFloat(psWeightMax) : undefined,
        general_notes: psGeneralNotes || undefined,
        tasting_notes: psTastingNotes || undefined,
        components: psComponents.map((c, idx) => ({
          ingredient_name: c.ingredient_name,
          portion_min: c.portion_min ? parseFloat(c.portion_min) : undefined,
          portion_max: c.portion_max ? parseFloat(c.portion_max) : undefined,
          portion_unit: c.portion_unit || 'g',
          tool: c.tool || undefined,
          notes: c.notes || undefined,
          sort_order: idx,
        })),
      };
      const saved = await api.upsertPortionSpec(data);
      setPortionSpec(saved);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPsSaving(false);
    }
  }

  function addPsComponent() {
    setPsComponents(prev => [...prev, {
      ingredient_name: '', portion_min: '', portion_max: '',
      portion_unit: 'g', tool: '', notes: '', sort_order: prev.length,
    }]);
  }

  function removePsComponent(idx: number) {
    setPsComponents(prev => prev.filter((_, i) => i !== idx));
  }

  function updatePsComponent(idx: number, field: string, value: string) {
    setPsComponents(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  function movePsComponent(idx: number, dir: 'up' | 'down') {
    setPsComponents(prev => {
      const arr = [...prev];
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= arr.length) return arr;
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
      return arr;
    });
  }

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
        dislikes,
        linked_meal_id: linkedMealId,
        // New fields
        short_description: shortDescription || undefined,
        dietary_tags: dietaryTags,
        protein_types: proteinTypes,
        starch_type: starchType || undefined,
        container_type: containerType || undefined,
        portion_score: portionScore ?? undefined,
        calories: calories ? parseFloat(calories) : undefined,
        protein_g: proteinG ? parseFloat(proteinG) : undefined,
        carbs_g: carbsG ? parseFloat(carbsG) : undefined,
        fat_g: fatG ? parseFloat(fatG) : undefined,
        fiber_g: fiberG ? parseFloat(fiberG) : undefined,
        shelf_life_days: shelfLifeDays ? parseInt(shelfLifeDays) : undefined,
        label_ingredients: labelIngredients || undefined,
      } as any);
      await loadMeal();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(arr: string[], setArr: (v: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }

  async function handleAddComponent() {
    if (!addRefId) { alert('Select a sub-recipe or ingredient first.'); return; }
    try {
      await api.addMealComponent(id, {
        sub_recipe_id: addType === 'sub_recipe' ? addRefId : undefined,
        ingredient_id: addType === 'ingredient' ? addRefId : undefined,
        quantity: parseFloat(addQty) || 1,
        unit: addUnit,
      });
      setAddRefId(''); setAddSearch(''); setAddQty('1');
      await loadMeal();
    } catch (e: any) { alert(e.message); }
  }

  async function handleUpdateComponent(cid: string) {
    try {
      await api.updateMealComponent(id, cid, { quantity: parseFloat(editQty), unit: editUnit });
      setEditingComponent(null);
      await loadMeal();
    } catch (e: any) { alert(e.message); }
  }

  async function handleRemoveComponent(cid: string) {
    if (!confirm('Remove this component?')) return;
    try {
      await api.removeMealComponent(id, cid);
      await loadMeal();
    } catch (e: any) { alert(e.message); }
  }

  async function handleLinkVariant(linkedId: string) {
    try {
      await api.linkMealVariant(id, linkedId);
      setVariantSearch('');
      setVariantSearchResults([]);
      setLinkedMealSearch('');
      await loadMeal();
      api.getSuggestedVariants(id).then(setSuggestedVariants).catch(() => {});
    } catch (e: any) { alert(e.message); }
  }

  async function handleUnlinkVariant() {
    try {
      await api.unlinkMealVariant(id);
      await loadMeal();
      api.getSuggestedVariants(id).then(setSuggestedVariants).catch(() => {});
    } catch (e: any) { alert(e.message); }
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 800;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      setImageUrl(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = objectUrl;
  }

  const filteredAddList = addType === 'sub_recipe'
    ? allSubRecipes.filter((s) => !addSearch || s.name.toLowerCase().includes(addSearch.toLowerCase()) || s.sub_recipe_code.toLowerCase().includes(addSearch.toLowerCase()) || ((s as any).station_tag ?? '').toLowerCase().includes(addSearch.toLowerCase()))
    : allIngredients.filter((i) => !addSearch || i.internal_name.toLowerCase().includes(addSearch.toLowerCase()) || i.sku.toLowerCase().includes(addSearch.toLowerCase()) || (i.display_name ?? '').toLowerCase().includes(addSearch.toLowerCase()));

  const totalComponentCost = meal?.components.reduce((sum, c) => sum + componentCost(c), 0) ?? 0;

  // Build lookup: ingredient_name (lowercase) → psComponent, for cross-referencing spec data
  const specByName = useMemo(() => {
    const map: Record<string, typeof psComponents[0]> = {};
    psComponents.forEach(c => { map[c.ingredient_name.toLowerCase()] = c; });
    return map;
  }, [psComponents]);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading meal...</div>;
  if (!meal) return <div className="p-8 text-center text-gray-400">Meal not found</div>;

  const cost = meal.computed_cost;
  const sell = parseFloat(pricingOverride) || meal.pricing_override || 0;
  const profit = sell > 0 && cost > 0 ? sell - cost : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/meals')} className="text-gray-400 hover:text-gray-600 text-sm">← Meal Recipes</button>
          <div>
            <div className="flex items-center gap-2">
              {meal.meal_code && (
                <span className="px-2 py-0.5 bg-gray-900 text-white rounded text-xs font-mono font-bold">{meal.meal_code}</span>
              )}
              <h1 className="text-lg font-semibold text-gray-900">{meal.display_name}</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                {isActive ? 'Active' : 'Inactive'}
              </span>
              {category && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{category}</span>}
            </div>
            <p className="text-xs text-gray-400">{meal.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {cost > 0 && <div className="text-right"><p className="text-xs text-gray-400">Cost</p><p className="text-sm font-bold text-gray-800">${cost.toFixed(2)}</p></div>}
          {profit !== null && <div className="text-right"><p className="text-xs text-gray-400">Profit</p><p className="text-sm font-bold text-green-600">${profit.toFixed(2)}</p></div>}
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: image + quick fields ──────────────────────────────────── */}
        <aside className="w-56 border-r border-gray-200 bg-white flex-shrink-0 overflow-y-auto p-4 space-y-4">
          {/* Image */}
          <label className="block cursor-pointer group">
            <div className="w-full h-36 rounded-xl border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center hover:border-brand-400 transition-colors">
              {imageUrl ? (
                <img src={imageUrl} alt={meal.display_name} className="w-full h-full object-cover" />
              ) : (
                <div className="text-center px-2">
                  <p className="text-2xl mb-1">📷</p>
                  <p className="text-xs text-brand-500 font-medium">Upload image</p>
                </div>
              )}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
          </label>
          {imageUrl && <button onClick={() => setImageUrl('')} className="w-full text-xs text-red-400 hover:text-red-600">× Remove</button>}

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">Active</span>
            <button onClick={() => setIsActive(!isActive)}
              className={`relative w-9 h-5 rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
              <option value="">— none —</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Sell price */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sell Price ($)</label>
            <input type="number" min="0" step="0.01" value={pricingOverride}
              onChange={(e) => setPricingOverride(e.target.value)} placeholder="16.99"
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>

          {/* Weight */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Final Yield (g)</label>
            <input type="number" min="0" value={finalYieldWeight} onChange={(e) => setFinalYieldWeight(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-400" />
            <button
              onClick={() => {
                const components = meal?.components ?? [];
                const totalG = components
                  .filter(c => {
                    const u = (c.unit ?? '').toLowerCase();
                    return u === 'g' || u === 'gr' || u === 'gram' || u === 'grams' ||
                           u === 'kg' || u === 'kgs' || u === 'kilo' || u === 'kilos' || u === 'kilogram' || u === 'kilograms';
                  })
                  .reduce((sum, c) => {
                    const u = (c.unit ?? '').toLowerCase();
                    const qty = (u === 'kg' || u === 'kgs' || u === 'kilo' || u === 'kilos' || u === 'kilogram' || u === 'kilograms')
                      ? c.quantity * 1000
                      : c.quantity;
                    return sum + qty;
                  }, 0);
                if (totalG > 0) {
                  setFinalYieldWeight(totalG.toString());
                } else {
                  alert('No gram-unit components found to calculate from');
                }
              }}
              className="mt-1 px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 w-full"
              title="Auto-calculate from ingredient quantities"
            >
              ⚡ Calc from components
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Net Weight (kg)</label>
            <input type="number" min="0" step="0.001" value={netWeightKg} onChange={(e) => setNetWeightKg(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>

          {/* Container type */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Container</label>
            <div className="flex flex-col gap-1">
              {CONTAINER_OPTIONS.map((opt) => (
                <button key={opt} onClick={() => setContainerType(containerType === opt ? '' : opt)}
                  className={`py-1 rounded-lg text-xs border transition-all ${containerType === opt ? 'bg-brand-100 border-brand-300 text-brand-700 font-medium' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Portion score */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Portion Score</label>
            <div className="flex gap-1">
              {[1,2,3,4].map((n) => (
                <button key={n} onClick={() => setPortionScore(portionScore === n ? null : n)}
                  className={`flex-1 py-1 rounded-lg text-xs font-bold border transition-all ${portionScore === n ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Main content area ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="bg-white border-b border-gray-200 px-6 flex gap-1 flex-shrink-0">
            {([
              ['details',     'Details & Tags'],
              ['components',  `Ingredients (${meal.components.length})`],
              ['portion-specs', 'Portion Specs'],
              ['label',         'Label & Macros'],
              ['pricing',       'Pricing'],
            ] as [Tab, string][]).map(([key, label]) => (
              <button key={key} onClick={() => { setTab(key); if (key === 'portion-specs') loadPortionSpec(); }}
                className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-brand-500 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">

            {/* ══ TAB: Details & Tags ══════════════════════════════════════════ */}
            {tab === 'details' && (
              <>
                {/* Names + description */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-gray-700">Names & Description</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Display Name <span className="text-gray-400">({displayName.length}/100)</span></label>
                      <input type="text" maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Internal Name (Admin)</label>
                      <input type="text" value={internalName} onChange={(e) => setInternalName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tagline / Short Description</label>
                    <input type="text" value={shortDescription} onChange={(e) => setShortDescription(e.target.value)}
                      placeholder="Sassy one-liner for the website…"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Full Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
                  </div>
                </div>

                {/* Allergens */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-gray-700">Allergens</h2>
                    <span className="text-xs text-gray-400">{allergenTags.length} selected</span>
                  </div>
                  <PillPicker options={ALLERGEN_OPTIONS} selected={allergenTags}
                    onToggle={(v) => toggleTag(allergenTags, setAllergenTags, v)} color="red" />
                </div>

                {/* Dislikes */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-gray-700">Dislikes</h2>
                    <span className="text-xs text-gray-400">{dislikes.length} selected</span>
                  </div>
                  <PillPicker options={DISLIKE_OPTIONS} selected={dislikes}
                    onToggle={(v) => toggleTag(dislikes, setDislikes, v)} color="orange" />
                </div>

                {/* Dietary Badges */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-gray-700">Dietary Badges</h2>
                    <span className="text-xs text-gray-400">{dietaryTags.length} selected</span>
                  </div>
                  <PillPicker options={DIETARY_BADGE_OPTIONS} selected={dietaryTags}
                    onToggle={(v) => toggleTag(dietaryTags, setDietaryTags, v)} color="green" />
                </div>

                {/* Protein Types + Starch */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-3">Protein Types</h2>
                    <PillPicker options={PROTEIN_TYPE_OPTIONS} selected={proteinTypes}
                      onToggle={(v) => toggleTag(proteinTypes, setProteinTypes, v)} color="purple" />
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-3">Starch</h2>
                    <div className="flex flex-wrap gap-2">
                      {STARCH_OPTIONS.map((opt) => (
                        <button key={opt} onClick={() => setStarchType(starchType === opt ? '' : opt)}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${starchType === opt ? 'bg-yellow-100 text-yellow-700 border-yellow-300' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                          {starchType === opt ? '✓ ' : ''}{opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Meal Variant Linking */}
                <div className="border border-slate-200 rounded-xl p-4">
                  <div className="font-semibold text-slate-800 mb-2">🔗 Meal Variant (Meat ↔ Vegan)</div>
                  {meal.linked_meal ? (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-xs text-green-600 font-medium">Linked variant:</span>
                        <a href={`/meals/${meal.linked_meal.id}`} className="ml-2 text-sm font-medium text-green-800 hover:underline">
                          {meal.linked_meal.display_name}
                        </a>
                        {(meal.linked_meal as any).meal_code && (
                          <span className="ml-1 text-xs text-green-600 font-mono">{(meal.linked_meal as any).meal_code}</span>
                        )}
                      </div>
                      <button onClick={handleUnlinkVariant} className="text-xs text-red-500 hover:underline">Unlink</button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">Link this meal to its meat or vegan counterpart</p>
                      {suggestedVariants.length > 0 ? (
                        <div className="space-y-1">
                          <div className="text-xs text-slate-500 font-medium mb-1">Suggested matches:</div>
                          {suggestedVariants.map((v: any) => (
                            <div key={v.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5">
                              <div>
                                <span className="text-sm text-slate-700">{v.display_name}</span>
                                {v.meal_code && <span className="ml-1 text-xs text-slate-400 font-mono">{v.meal_code}</span>}
                                <span className="ml-2 text-xs text-slate-400">{v.matchedWords?.join(', ')}</span>
                              </div>
                              <button
                                onClick={() => handleLinkVariant(v.id)}
                                className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                              >Link</button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic mb-2">No automatic matches found — search below</p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <input
                          type="text"
                          placeholder="Search meal to link..."
                          value={variantSearch}
                          onChange={(e) => setVariantSearch(e.target.value)}
                          className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      {variantSearchResults.length > 0 && (
                        <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden">
                          {variantSearchResults.map((v: any) => (
                            <div key={v.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                              <span className="text-sm">{v.display_name} <span className="text-xs text-slate-400 font-mono">{v.meal_code}</span></span>
                              <button onClick={() => handleLinkVariant(v.id)} className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700">Link</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {meal.variant_meals.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-xs text-gray-500">Also referenced from:</span>
                      {meal.variant_meals.map((v) => (
                        <button key={v.id} onClick={() => router.push(`/meals/${v.id}`)}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                          {v.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ══ TAB: Components ══════════════════════════════════════════════ */}
            {tab === 'components' && (
              <>
                {/* Components table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Code/SKU</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Station</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cost</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {meal.components.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.sub_recipe ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {c.sub_recipe ? 'Sub-recipe' : 'Ingredient'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {c.sub_recipe?.name ?? c.ingredient?.internal_name ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-400">
                            {c.sub_recipe?.sub_recipe_code ?? c.ingredient?.sku ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {c.sub_recipe?.station_tag ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {editingComponent === c.id ? (
                              <input type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right" autoFocus />
                            ) : (
                              <span className="text-gray-700">{c.quantity}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {editingComponent === c.id ? (
                              <select value={editUnit} onChange={(e) => setEditUnit(e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-sm">
                                {['gr','un','ml','kg','Kgs'].map((u) => <option key={u} value={u}>{u}</option>)}
                              </select>
                            ) : (
                              <span className="text-gray-500">{c.unit}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500 text-xs">
                            {componentCost(c) > 0 ? `$${componentCost(c).toFixed(3)}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 justify-end">
                              {editingComponent === c.id ? (
                                <>
                                  <button onClick={() => handleUpdateComponent(c.id)} className="text-xs text-green-600 font-medium hover:text-green-800">Save</button>
                                  <button onClick={() => setEditingComponent(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => { setEditingComponent(c.id); setEditQty(c.quantity.toString()); setEditUnit(c.unit); }}
                                    className="text-xs text-blue-500 hover:text-blue-700">Edit</button>
                                  <button onClick={() => handleRemoveComponent(c.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {meal.components.length === 0 && (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">No components yet. Add sub-recipes or ingredients below.</td></tr>
                      )}
                    </tbody>
                    {meal.components.length > 0 && (
                      <tfoot className="bg-gray-50 border-t border-gray-200">
                        <tr>
                          <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-gray-600 text-right">Total Production Cost:</td>
                          <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">${totalComponentCost.toFixed(3)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Add component form */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Add Component</h3>
                  <div className="flex gap-3 items-end flex-wrap">
                    {/* Type toggle */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Type</label>
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                        <button type="button"
                          onClick={() => { setAddType('sub_recipe'); setAddRefId(''); setAddSearch(''); setAddDropdownOpen(false); }}
                          className={`px-3 py-2 transition-colors ${addType === 'sub_recipe' ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                          Sub-Recipe
                        </button>
                        <button type="button"
                          onClick={() => { setAddType('ingredient'); setAddRefId(''); setAddSearch(''); setAddDropdownOpen(false); }}
                          className={`px-3 py-2 border-l border-gray-200 transition-colors ${addType === 'ingredient' ? 'bg-brand-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                          Ingredient
                        </button>
                      </div>
                    </div>

                    {/* Live search */}
                    <div className="flex-1 min-w-60">
                      <label className="block text-xs text-gray-500 mb-1">
                        {addRefId ? '✓ Selected' : `Search ${addType === 'sub_recipe' ? 'sub-recipes' : 'ingredients'} (${filteredAddList.length} available)`}
                      </label>
                      <div className="relative">
                        <input type="text"
                          placeholder={`Type to search or click to browse all…`}
                          value={addSearch}
                          onChange={(e) => { setAddSearch(e.target.value); setAddRefId(''); setAddDropdownOpen(true); }}
                          onFocus={() => setAddDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setAddDropdownOpen(false), 150)}
                          className={`w-full px-3 py-2 border rounded-lg text-sm transition-colors ${addRefId ? 'border-brand-400 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200'}`}
                        />
                        {addRefId && (
                          <button
                            type="button"
                            onClick={() => { setAddRefId(''); setAddSearch(''); setAddDropdownOpen(true); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs px-1"
                          >✕</button>
                        )}
                        {addDropdownOpen && !addRefId && filteredAddList.length > 0 && (
                          <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-56 overflow-y-auto mt-1">
                            {filteredAddList.slice(0, 20).map((item) => (
                              <button key={item.id} type="button"
                                onMouseDown={() => { setAddRefId(item.id); setAddSearch(addType === 'sub_recipe' ? (item as any).name : (item as any).internal_name); setAddDropdownOpen(false); }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-gray-900 truncate">
                                    {addType === 'sub_recipe' ? (item as any).name : (item as any).internal_name}
                                  </span>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {addType === 'sub_recipe' && (item as any).station_tag && (
                                      <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{(item as any).station_tag}</span>
                                    )}
                                    {addType === 'sub_recipe' && (item as any).computed_cost > 0 && (
                                      <span className="text-[10px] text-green-600 font-medium">${(item as any).computed_cost.toFixed(2)}</span>
                                    )}
                                    <span className="text-[10px] text-gray-400 font-mono">
                                      {addType === 'sub_recipe' ? (item as any).sub_recipe_code : (item as any).sku}
                                    </span>
                                  </div>
                                </div>
                              </button>
                            ))}
                            {filteredAddList.length > 20 && (
                              <div className="px-3 py-2 text-xs text-gray-400 text-center">
                                {filteredAddList.length - 20} more — type to narrow results
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="w-24">
                      <label className="block text-xs text-gray-500 mb-1">Qty</label>
                      <input type="number" min="0" step="0.1" value={addQty} onChange={(e) => setAddQty(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-gray-500 mb-1">Unit</label>
                      <select value={addUnit} onChange={(e) => setAddUnit(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                        {['gr','kg','Kgs','ml','L','un','pcs'].map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <button onClick={handleAddComponent} disabled={!addRefId}
                      className="px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-40 transition-colors">
                      + Add
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ══ TAB: Label & Macros ══════════════════════════════════════════ */}
            {tab === 'label' && (
              <div className="grid grid-cols-[1fr_280px] gap-5">
                {/* Left: inputs */}
                <div className="space-y-5">
                  {/* Macros */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">Nutrition Facts</h2>
                    <div className="grid grid-cols-5 gap-3">
                      {[
                        ['Calories', calories, setCalories, '490'],
                        ['Protein (g)', proteinG, setProteinG, '38'],
                        ['Carbs (g)', carbsG, setCarbsG, '44'],
                        ['Fiber (g)', fiberG, setFiberG, '8'],
                        ['Fats (g)', fatG, setFatG, '18'],
                      ].map(([label, val, setter, ph]: any) => (
                        <div key={label}>
                          <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                          <input type="number" min="0" step="0.1" value={val} onChange={(e) => setter(e.target.value)} placeholder={ph}
                            className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-400" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-700">Instructions</h2>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Heating Instructions</label>
                      <textarea value={heatingInstructions} onChange={(e) => setHeatingInstructions(e.target.value)} rows={3}
                        placeholder="e.g. Remove plastic film. Microwave for 2–2.5 mins. Let stand 1 min before eating."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Packaging Instructions</label>
                      <textarea value={packagingInstructions} onChange={(e) => setPackagingInstructions(e.target.value)} rows={2}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Cooking Instructions (Internal)</label>
                      <textarea value={cookingInstructions} onChange={(e) => setCookingInstructions(e.target.value)} rows={2}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                  </div>

                  {/* Label ingredients + shelf life */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-700">Product Label</h2>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Ingredient List (for label)</label>
                      <textarea value={labelIngredients} onChange={(e) => setLabelIngredients(e.target.value)} rows={3}
                        placeholder="Water, Chicken Breast, Olive Oil, Garlic…"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                    <div className="w-32">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Shelf Life (days)</label>
                      <input type="number" min="1" value={shelfLifeDays} onChange={(e) => setShelfLifeDays(e.target.value)}
                        placeholder="5"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                  </div>
                </div>

                {/* Right: live label preview */}
                <div className="space-y-3">
                  <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📋 Label Preview</h3>
                      <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">Live</span>
                    </div>

                    {/* Label mock-up */}
                    <div className="border-2 border-gray-900 rounded-xl overflow-hidden bg-white shadow-sm" style={{fontFamily:'system-ui,sans-serif'}}>
                      {/* Header band */}
                      <div className="bg-gray-900 px-3 py-1.5 flex items-center justify-between">
                        <span className="text-white text-[10px] font-bold tracking-widest uppercase">BetterDay Food Co.</span>
                        {meal.meal_code && <span className="text-gray-400 text-[9px] font-mono">{meal.meal_code}</span>}
                      </div>

                      {/* Meal image if available */}
                      {imageUrl && (
                        <div className="h-28 overflow-hidden">
                          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="p-3 space-y-2">
                        {/* Meal name */}
                        <div className="border-b border-gray-200 pb-2">
                          <p className="font-black text-gray-900 text-sm leading-tight">{displayName || meal.display_name}</p>
                          {shortDescription && <p className="text-gray-500 text-[10px] mt-0.5 italic leading-tight">{shortDescription}</p>}
                        </div>

                        {/* Dietary badges */}
                        {dietaryTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pb-1">
                            {dietaryTags.filter(t => ['Gluten Friendly','Dairy Free','Freezable','High Protein'].includes(t)).map((t) => (
                              <span key={t} className="px-1.5 py-0.5 bg-green-700 text-white rounded-sm text-[9px] font-bold uppercase tracking-wide">{t}</span>
                            ))}
                          </div>
                        )}

                        {/* Macros bar */}
                        {(calories || proteinG || carbsG || fatG) && (
                          <div className="grid grid-cols-4 gap-1 text-center border border-gray-200 rounded-lg overflow-hidden">
                            {[
                              {label:'Cal',   val: calories, unit: '', bg: 'bg-orange-50'},
                              {label:'Protein', val: proteinG, unit: 'g', bg: 'bg-blue-50'},
                              {label:'Carbs',  val: carbsG,  unit: 'g', bg: 'bg-yellow-50'},
                              {label:'Fat',    val: fatG,    unit: 'g', bg: 'bg-purple-50'},
                            ].map(({label, val, unit: u, bg}) => (
                              <div key={label} className={`${bg} py-1.5 px-1`}>
                                <p className="text-gray-500 text-[8px] font-semibold uppercase leading-none">{label}</p>
                                <p className="font-black text-gray-900 text-xs mt-0.5">{val || '—'}{u}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Heating instructions */}
                        {heatingInstructions && (
                          <div className="border-t border-gray-100 pt-2">
                            <p className="text-[9px] font-bold text-gray-700 uppercase tracking-wide mb-0.5">🔥 How to Heat</p>
                            <p className="text-[10px] text-gray-600 leading-tight">{heatingInstructions}</p>
                          </div>
                        )}

                        {/* Allergens */}
                        {allergenTags.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            <p className="text-[10px] text-amber-800"><span className="font-bold">⚠ Contains: </span>{allergenTags.join(', ')}</p>
                          </div>
                        )}

                        {/* Shelf life + net weight */}
                        <div className="border-t border-gray-100 pt-1.5 flex items-center justify-between">
                          {shelfLifeDays ? (
                            <p className="text-[9px] text-gray-500">Best by: delivery date + {shelfLifeDays} days</p>
                          ) : <span />}
                          {netWeightKg && parseFloat(netWeightKg) > 0 && (
                            <p className="text-[9px] text-gray-400 font-mono">Net {(parseFloat(netWeightKg) * 1000).toFixed(0)}g</p>
                          )}
                        </div>

                        {/* Ingredient list */}
                        {labelIngredients && (
                          <div className="border-t border-gray-100 pt-1.5">
                            <p className="text-[9px] text-gray-500 leading-tight">
                              <span className="font-bold text-gray-700">INGREDIENTS: </span>{labelIngredients}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="bg-gray-50 border-t border-gray-200 px-3 py-1.5 flex items-center justify-between">
                        <span className="text-[9px] text-gray-400">eatbetterday.ca</span>
                        <span className="text-[9px] text-gray-400">Made in Canada 🍁</span>
                      </div>
                    </div>

                    <p className="text-[10px] text-gray-400 mt-2 text-center">Preview updates as you type</p>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TAB: Pricing ═════════════════════════════════════════════════ */}
            {tab === 'pricing' && (
              <div className="grid grid-cols-2 gap-5">

                {/* Left: Ingredient cost breakdown */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-700">Ingredients / Sub-recipes</h2>
                    <span className="text-xs font-semibold text-gray-500">Prod. Price <span className="text-gray-900">${totalComponentCost.toFixed(2)}</span></span>
                  </div>
                  {meal.components.length === 0 ? (
                    <p className="text-sm text-gray-400 p-5">No components added yet.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {meal.components.map((c) => {
                        const lineCost = componentCost(c);
                        const code = c.sub_recipe?.sub_recipe_code ?? c.ingredient?.sku ?? '';
                        const num = code.replace(/^SR-|^ING-/i, '');
                        const name = c.sub_recipe?.name ?? c.ingredient?.internal_name ?? '';
                        const station = c.sub_recipe?.station_tag;
                        return (
                          <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                            {/* Avatar icon */}
                            <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" fill="#f59e0b" opacity="0.9"/>
                                <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 leading-tight">
                                {num && <span className="text-gray-400 mr-1">#{num}</span>}
                                {name}
                                {station && <span className="text-[10px] text-gray-400 ml-1">({station})</span>}
                              </p>
                              <p className="text-xs text-gray-400">{c.quantity.toFixed(2)} {c.unit}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-gray-900">${lineCost.toFixed(2)}</p>
                              <p className="text-[10px] text-gray-400">Prod. Price</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: Sell price + profit + margin analysis */}
                <div className="space-y-4">
                  {/* Production price + profit summary */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-lg">🔥</div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Production Price</p>
                          <p className="text-xl font-bold text-gray-900">${cost.toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-lg">💵</div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Profit</p>
                          <p className="text-xl font-bold text-green-700">{profit !== null ? `$${profit.toFixed(2)}` : '—'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Sell price input */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Sell Price ($)</label>
                      <input type="number" min="0" step="0.01" value={pricingOverride}
                        onChange={(e) => setPricingOverride(e.target.value)} placeholder="e.g. 16.99"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>

                    {profit !== null && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
                        <span className="text-sm text-green-700 font-medium">Gross Profit</span>
                        <div className="text-right">
                          <span className="text-lg font-bold text-green-700">${profit.toFixed(2)}</span>
                          <span className="text-xs text-green-600 ml-2">{((profit / cost) * 100).toFixed(1)}% markup</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Margin recommendations */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-700">Selling Price recommendations at Various Margins</h3>
                    <div className="space-y-1.5">
                      {[20, 25, 30, 35].map((pct) => {
                        const suggested = cost > 0 ? cost / (1 - pct / 100) : 0;
                        return (
                          <div key={pct} className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">{pct}%</span>
                            <button onClick={() => setPricingOverride(suggested.toFixed(2))}
                              className="font-semibold text-brand-600 hover:text-brand-800 hover:underline">
                              ${suggested.toFixed(2)}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Custom margin */}
                    <div className="border-t border-gray-100 pt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Custom Margin:</span>
                        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                          <span className="px-2 py-1.5 bg-gray-50 text-xs text-gray-500 border-r border-gray-200">%</span>
                          <input type="number" min="0" max="99" step="0.1" value={customMargin}
                            onChange={(e) => setCustomMargin(e.target.value)} placeholder="e.g. 40"
                            className="w-24 px-2 py-1.5 text-sm focus:outline-none" />
                        </div>
                      </div>
                      {customMargin && parseFloat(customMargin) > 0 && parseFloat(customMargin) < 100 && cost > 0 && (
                        <p className="text-sm text-gray-600">
                          Suggested selling price at <span className="font-semibold">{parseFloat(customMargin).toFixed(2)}%</span> margin is:{' '}
                          <button onClick={() => setPricingOverride((cost / (1 - parseFloat(customMargin) / 100)).toFixed(2))}
                            className="font-bold text-brand-700 hover:underline">
                            ${(cost / (1 - parseFloat(customMargin) / 100)).toFixed(2)}
                          </button>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TAB: Portion Specs ═══════════════════════════════════════════ */}
            {tab === 'portion-specs' && (
              <div className="space-y-5">

                {/* Meal Photo Upload */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">Meal Photo</h2>
                  <div className="flex items-start gap-4">
                    <div className="w-32 h-32 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0">
                      {imageUrl ? (
                        <img src={imageUrl} alt={meal.display_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 cursor-pointer transition-colors inline-block">
                        {imageUrl ? 'Change Photo' : 'Upload Photo'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const result = await api.uploadMealPhoto(meal.id, file);
                              setImageUrl(result.image_url);
                              setMeal(prev => prev ? { ...prev, image_url: result.image_url } : prev);
                            } catch (err: any) {
                              alert('Upload failed: ' + err.message);
                            }
                          }}
                        />
                      </label>
                      {imageUrl && (
                        <p className="text-xs text-gray-400">Photo will appear on production plan portion specs cards.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Header info */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-700">Portion Specifications</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Step-by-step portioning guide for kitchen staff — how much of each component goes in the container.</p>
                    </div>
                    {portionSpec && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Spec saved</span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Container Type</label>
                      <select value={psContainerType} onChange={e => setPsContainerType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                        <option value="">— select —</option>
                        <option>Regular Meal Container</option>
                        <option>Salad Container</option>
                        <option>Soup Container</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Min Total Weight (g)</label>
                      <input type="number" value={psWeightMin} onChange={e => setPsWeightMin(e.target.value)}
                        placeholder="e.g. 425"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Max Total Weight (g)</label>
                      <input type="number" value={psWeightMax} onChange={e => setPsWeightMax(e.target.value)}
                        placeholder="e.g. 460"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">General Portioning Notes</label>
                      <textarea value={psGeneralNotes} onChange={e => setPsGeneralNotes(e.target.value)} rows={2}
                        placeholder="e.g. Be careful not to get food on the rim of the container..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Tasting Checklist Notes</label>
                      <textarea value={psTastingNotes} onChange={e => setPsTastingNotes(e.target.value)} rows={2}
                        placeholder="e.g. Check seasoning, ensure sauce is evenly distributed..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
                    </div>
                  </div>
                </div>

                {/* Components table — sourced from actual meal ingredients, cross-referenced with spec data */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-700">Portioning Components ({meal.components.length})</h2>
                    <button onClick={addPsComponent}
                      className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600 font-medium">
                      + Add Row
                    </button>
                  </div>

                  {meal.components.length === 0 ? (
                    <div className="p-8 text-center text-sm text-gray-400">
                      No ingredients yet. Add sub-recipes or ingredients in the Ingredients tab first.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Ingredient / Sub-Recipe</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-24">Portion Min</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-24">Portion Max</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-20">Unit</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-32">Tool</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Placement Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {[...meal.components]
                            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                            .map((comp, idx) => {
                              const ingredientName = comp.ingredient?.internal_name || comp.sub_recipe?.name || 'Unknown';
                              const spec = specByName[ingredientName.toLowerCase()] || null;
                              const linkHref = comp.sub_recipe
                                ? `/sub-recipes/${comp.sub_recipe.id}`
                                : comp.ingredient
                                  ? `/ingredients/${comp.ingredient.id}`
                                  : null;
                              const placementNotes = spec?.notes || comp.portioning_notes || '';
                              return (
                                <tr key={comp.id} className="hover:bg-gray-50/50">
                                  <td className="px-4 py-3 text-xs text-gray-400 font-medium">{idx + 1}</td>
                                  <td className="px-4 py-3">
                                    {linkHref ? (
                                      <a href={linkHref}
                                        className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-sm">
                                        {ingredientName}
                                      </a>
                                    ) : (
                                      <span className="font-medium text-sm text-gray-800">{ingredientName}</span>
                                    )}
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${comp.sub_recipe ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                        {comp.sub_recipe ? 'Sub-recipe' : 'Ingredient'}
                                      </span>
                                      <span className="text-[10px] text-gray-400">{comp.quantity} {comp.unit}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-700">
                                    {spec?.portion_min ? spec.portion_min : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-700">
                                    {spec?.portion_max ? spec.portion_max : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-gray-500">
                                    {spec?.portion_unit || <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-gray-600">
                                    {spec?.tool ? (
                                      <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-amber-700 font-medium">{spec.tool}</span>
                                    ) : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-gray-600">
                                    {placementNotes || <span className="text-gray-300">—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                        {(psWeightMin || psWeightMax) && (
                          <tfoot className="bg-gray-50 border-t border-gray-200">
                            <tr>
                              <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-gray-700">Total Weight Range</td>
                              <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-gray-900">
                                {psWeightMin && psWeightMax ? `${psWeightMin} – ${psWeightMax} g` : psWeightMin ? `${psWeightMin} g` : `${psWeightMax} g`}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </div>

                {/* Editable spec rows (for adding/editing spec data per ingredient) */}
                {psComponents.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100">
                      <h2 className="text-sm font-semibold text-gray-700">Edit Spec Rows</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Fine-tune portion data for individual ingredients. Changes saved when you click "Update Portion Spec".</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Ingredient / Component</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-24">Min</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-24">Max</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-20">Unit</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 w-32">Tool</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Placement Notes</th>
                            <th className="px-4 py-2.5 w-20"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {psComponents.map((comp, idx) => (
                            <tr key={idx} className="hover:bg-gray-50/50">
                              <td className="px-4 py-2 text-xs text-gray-400">
                                <div className="flex flex-col gap-0.5">
                                  <button onClick={() => movePsComponent(idx, 'up')} disabled={idx === 0}
                                    className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none">▲</button>
                                  <button onClick={() => movePsComponent(idx, 'down')} disabled={idx === psComponents.length - 1}
                                    className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none">▼</button>
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <input value={comp.ingredient_name}
                                  onChange={e => updatePsComponent(idx, 'ingredient_name', e.target.value)}
                                  placeholder="e.g. Vegan Butter Chickn Curry"
                                  className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                              </td>
                              <td className="px-4 py-2">
                                <input type="number" value={comp.portion_min}
                                  onChange={e => updatePsComponent(idx, 'portion_min', e.target.value)}
                                  placeholder="300"
                                  className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                              </td>
                              <td className="px-4 py-2">
                                <input type="number" value={comp.portion_max}
                                  onChange={e => updatePsComponent(idx, 'portion_max', e.target.value)}
                                  placeholder="310"
                                  className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                              </td>
                              <td className="px-4 py-2">
                                <select value={comp.portion_unit}
                                  onChange={e => updatePsComponent(idx, 'portion_unit', e.target.value)}
                                  className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400">
                                  <option value="g">g</option>
                                  <option value="oz">oz</option>
                                  <option value="ml">ml</option>
                                  <option value="un">un</option>
                                  <option value="pcs">pcs</option>
                                </select>
                              </td>
                              <td className="px-4 py-2">
                                <input value={comp.tool}
                                  onChange={e => updatePsComponent(idx, 'tool', e.target.value)}
                                  placeholder="e.g. Orange Scoop"
                                  className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                              </td>
                              <td className="px-4 py-2">
                                <input value={comp.notes}
                                  onChange={e => updatePsComponent(idx, 'notes', e.target.value)}
                                  placeholder="e.g. Place on the left side as the base"
                                  className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                              </td>
                              <td className="px-4 py-2 text-right">
                                <button onClick={() => removePsComponent(idx)}
                                  className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Save button */}
                <div className="flex justify-end">
                  <button onClick={handleSavePortionSpec} disabled={psSaving}
                    className="px-5 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50">
                    {psSaving ? 'Saving…' : portionSpec ? 'Update Portion Spec' : 'Save Portion Spec'}
                  </button>
                </div>

              </div>
            )}

          </div>{/* end scrollable content */}
        </div>{/* end main content */}
      </div>{/* end flex layout */}
    </div>
  );
}
