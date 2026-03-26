'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Ingredient, SubRecipe } from '../../../lib/api';

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
  id: string; name: string; display_name: string; category: string | null;
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
  ingredient_id: string | null; sub_recipe_id: string | null;
  ingredient: { id: string; internal_name: string; display_name: string; sku: string; cost_per_unit: number; unit: string; } | null;
  sub_recipe: { id: string; name: string; sub_recipe_code: string; station_tag: string | null; computed_cost: number; priority: number; } | null;
}

type Tab = 'details' | 'components' | 'label' | 'pricing';

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
    ? allSubRecipes.filter((s) => !addSearch || s.name.toLowerCase().includes(addSearch.toLowerCase()) || s.sub_recipe_code.toLowerCase().includes(addSearch.toLowerCase()))
    : allIngredients.filter((i) => !addSearch || i.internal_name.toLowerCase().includes(addSearch.toLowerCase()) || i.sku.toLowerCase().includes(addSearch.toLowerCase()));

  const totalComponentCost = meal?.components.reduce((sum, c) => {
    const unitCost = c.sub_recipe ? c.sub_recipe.computed_cost : (c.ingredient ? c.ingredient.cost_per_unit : 0);
    return sum + unitCost * c.quantity;
  }, 0) ?? 0;

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
              ['details',    'Details & Tags'],
              ['components', `Components (${meal.components.length})`],
              ['label',      'Label & Macros'],
              ['pricing',    'Pricing'],
            ] as [Tab, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
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

                {/* Linked Variant */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-gray-700">Meat / Vegan Variant Link</h2>
                    <span className="text-xs text-gray-400">Link to the counterpart version (e.g. Mango Chicken ↔ Mango Curry)</span>
                  </div>
                  {meal.linked_meal && (
                    <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-blue-500">🔗</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-800">{meal.linked_meal.display_name}</p>
                        <p className="text-xs text-blue-400">{meal.linked_meal.category}</p>
                      </div>
                      <button onClick={() => router.push(`/meals/${meal.linked_meal!.id}`)}
                        className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
                        Go to variant →
                      </button>
                      <button onClick={() => setLinkedMealId(null)} className="text-xs text-red-400 hover:text-red-600">Unlink</button>
                    </div>
                  )}
                  {meal.variant_meals.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs text-gray-500">Also linked from:</span>
                      {meal.variant_meals.map((v) => (
                        <button key={v.id} onClick={() => router.push(`/meals/${v.id}`)}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                          {v.display_name} ({v.category})
                        </button>
                      ))}
                    </div>
                  )}
                  {!meal.linked_meal && (
                    <div className="space-y-2">
                      <input type="text" placeholder="Search meal to link…" value={linkedMealSearch}
                        onChange={(e) => setLinkedMealSearch(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                      {linkedMealSearch && (
                        <div className="border border-gray-200 rounded-lg divide-y max-h-40 overflow-y-auto">
                          {allMeals.filter((m) => m.id !== id && (
                            m.display_name.toLowerCase().includes(linkedMealSearch.toLowerCase()) ||
                            m.name.toLowerCase().includes(linkedMealSearch.toLowerCase())
                          )).slice(0, 6).map((m) => (
                            <button key={m.id} onClick={() => { setLinkedMealId(m.id); setLinkedMealSearch(''); }}
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left">
                              <p className="text-sm font-medium text-gray-800">{m.display_name}</p>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{m.category}</span>
                            </button>
                          ))}
                        </div>
                      )}
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
                            {(c.sub_recipe?.computed_cost ?? c.ingredient?.cost_per_unit ?? 0) > 0
                              ? `$${((c.sub_recipe?.computed_cost ?? c.ingredient?.cost_per_unit ?? 0) * c.quantity).toFixed(3)}`
                              : '—'}
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
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Type</label>
                      <select value={addType} onChange={(e) => { setAddType(e.target.value as any); setAddRefId(''); setAddSearch(''); }}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                        <option value="sub_recipe">Sub-Recipe</option>
                        <option value="ingredient">Ingredient</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-48">
                      <label className="block text-xs text-gray-500 mb-1">Search & Select</label>
                      <div className="relative">
                        <input type="text" placeholder={`Search ${addType === 'sub_recipe' ? 'sub-recipes' : 'ingredients'}…`}
                          value={addSearch} onChange={(e) => { setAddSearch(e.target.value); setAddRefId(''); }}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        {addSearch && !addRefId && filteredAddList.length > 0 && (
                          <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto mt-1">
                            {filteredAddList.slice(0, 10).map((item) => (
                              <button key={item.id}
                                onClick={() => { setAddRefId(item.id); setAddSearch(addType === 'sub_recipe' ? (item as any).name : (item as any).internal_name); }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                                <span className="font-medium">{addType === 'sub_recipe' ? (item as any).name : (item as any).internal_name}</span>
                                <span className="ml-2 text-xs text-gray-400 font-mono">{addType === 'sub_recipe' ? (item as any).sub_recipe_code : (item as any).sku}</span>
                              </button>
                            ))}
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
                        {['gr','un','ml','kg','Kgs'].map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <button onClick={handleAddComponent} disabled={!addRefId}
                      className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-40">
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
                  <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-0">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Label Preview</h3>
                    <div className="border-2 border-gray-800 rounded-lg p-3 text-xs space-y-2 bg-white">
                      {/* Title */}
                      <div>
                        <p className="font-bold text-gray-900 text-sm leading-tight">{displayName || meal.display_name}</p>
                        {shortDescription && <p className="text-gray-500 text-xs mt-0.5 italic">{shortDescription}</p>}
                      </div>

                      {/* Tags */}
                      {dietaryTags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {dietaryTags.slice(0, 4).map((t) => (
                            <span key={t} className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">{t}</span>
                          ))}
                        </div>
                      )}

                      <hr className="border-gray-300" />

                      {/* Macros */}
                      {(calories || proteinG || carbsG || fatG) && (
                        <div className="grid grid-cols-4 gap-1 text-center">
                          {[['Cal', calories],['Pro', proteinG ? proteinG+'g' : ''],['Carb', carbsG ? carbsG+'g' : ''],['Fat', fatG ? fatG+'g' : '']].map(([l,v]) => (
                            <div key={l} className="bg-gray-50 rounded p-1">
                              <p className="text-gray-400 text-xs">{l}</p>
                              <p className="font-bold text-gray-800">{v || '—'}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Heating */}
                      {heatingInstructions && (
                        <>
                          <hr className="border-gray-200" />
                          <div>
                            <p className="font-semibold text-gray-700 mb-0.5">How to Heat</p>
                            <p className="text-gray-600 leading-tight">{heatingInstructions}</p>
                          </div>
                        </>
                      )}

                      {/* Allergens */}
                      {allergenTags.length > 0 && (
                        <>
                          <hr className="border-gray-200" />
                          <p className="text-gray-600"><span className="font-semibold">Contains: </span>{allergenTags.join(', ')}</p>
                        </>
                      )}

                      {/* Shelf life */}
                      {shelfLifeDays && (
                        <p className="text-gray-500">Best before: +{shelfLifeDays} days</p>
                      )}

                      {/* Ingredient list */}
                      {labelIngredients && (
                        <>
                          <hr className="border-gray-200" />
                          <p className="text-gray-500 leading-tight"><span className="font-semibold text-gray-700">Ingredients: </span>{labelIngredients}</p>
                        </>
                      )}

                      {/* Net weight */}
                      {netWeightKg && parseFloat(netWeightKg) > 0 && (
                        <p className="text-gray-400 text-xs text-right">Net Wt: {(parseFloat(netWeightKg) * 1000).toFixed(0)}g</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TAB: Pricing ═════════════════════════════════════════════════ */}
            {tab === 'pricing' && (
              <div className="grid grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-gray-700">Pricing</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Sell Price ($)</label>
                      <input type="number" min="0" step="0.01" value={pricingOverride}
                        onChange={(e) => setPricingOverride(e.target.value)} placeholder="16.99"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Production Cost</label>
                      <p className="px-3 py-2 bg-gray-50 rounded-lg text-sm font-semibold text-gray-800">${cost.toFixed(3)}</p>
                    </div>
                  </div>
                  {profit !== null && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-green-700 font-medium">Gross Profit</span>
                        <span className="text-lg font-bold text-green-700">${profit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-green-600">Markup</span>
                        <span className="text-sm font-semibold text-green-600">{((profit / cost) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">Cost Breakdown</h2>
                  {meal.components.length === 0 ? (
                    <p className="text-sm text-gray-400">No components added yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {meal.components.map((c) => {
                        const unitCost = c.sub_recipe ? c.sub_recipe.computed_cost : (c.ingredient?.cost_per_unit ?? 0);
                        const lineCost = unitCost * c.quantity;
                        return (
                          <div key={c.id} className="flex justify-between text-sm">
                            <span className="text-gray-600 truncate flex-1">{c.sub_recipe?.name ?? c.ingredient?.internal_name}</span>
                            <span className="text-gray-500 ml-2">{c.quantity}{c.unit}</span>
                            <span className="text-gray-800 font-medium ml-3">${lineCost.toFixed(3)}</span>
                          </div>
                        );
                      })}
                      <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold">
                        <span className="text-gray-700">Total</span>
                        <span className="text-gray-900">${totalComponentCost.toFixed(3)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>{/* end scrollable content */}
        </div>{/* end main content */}
      </div>{/* end flex layout */}
    </div>
  );
}
