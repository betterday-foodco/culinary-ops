'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

// ─── Diet Plan SystemTag IDs (source of truth: /settings/tags) ────────────────
// These two rows in SystemTag (type='diets') are the classifier for every dish.
// See conner/data-model/decisions/2026-04-08-mandatory-diet-plan-on-dishes.md
const DIET_PLAN_OMNIVORE_ID    = 'fc0a70f3-644b-4248-b9c1-65882cc503de';
const DIET_PLAN_PLANT_BASED_ID = '9c68ba40-f59d-40a8-8210-bdc1f3cd3973';

/**
 * SystemTag row shape (from /api/tags). Same interface as meals/[id]/page.tsx.
 */
interface SystemTag {
  id: string;
  name: string;
  type: string;   // 'menu-cats' | 'diets' | 'allergens' | ...
  subtype: string | null;
  source: string | null;
  visible: boolean;
  sort_order: number;
  emoji: string | null;
}

/**
 * New Meal Recipe — focused Tier 1 create form.
 *
 * Only collects the four fields required to put a dish on the customer-facing
 * menu: Display Name, Diet Plan, Category, Sell Price. Everything else
 * (components, photo, description, macros, allergens, variant linking, etc.)
 * is filled in on the full edit page after the dish is created.
 *
 * Legacy fields like `internal_name`, `final_yield_weight`, and `components`
 * are deliberately NOT on this form. The backend auto-fills `name` from
 * `display_name` when it's missing, so the NOT NULL DB constraint on the
 * legacy `name` column is satisfied silently. Fringe "admin internal name"
 * cases are handled via the disclosure toggle on the edit page.
 */
export default function NewMealPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [dietPlanId, setDietPlanId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [pricingOverride, setPricingOverride] = useState('');
  const [allTags, setAllTags] = useState<SystemTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load SystemTag rows on mount so the Category dropdown can filter to
  // type='menu-cats' at render time. Same pattern as the edit page.
  useEffect(() => {
    api.getTags().then((t) => setAllTags(t as SystemTag[])).catch(() => {});
  }, []);

  // Memoized menu categories — sorted by sort_order then name so admins can
  // re-order in /settings/tags without touching code.
  const menuCats = useMemo(
    () =>
      allTags
        .filter((t) => t.type === 'menu-cats')
        .sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name)),
    [allTags],
  );

  const canSave = Boolean(displayName.trim()) && dietPlanId !== null && categoryName !== '' && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const created = await api.createMeal({
        // Internal `name` is intentionally omitted — backend mirrors display_name.
        // See meals.service.ts:create (auto-fill logic + ADR 2026-04-08).
        display_name: displayName.trim(),
        diet_plan_id: dietPlanId,
        category: categoryName || undefined,
        pricing_override: pricingOverride ? Number(pricingOverride) : undefined,
        // final_yield_weight is required by the DB (@default(0) in the schema)
        // but the API client interface still marks it required, so pass 0. The
        // admin fills it in on the edit page via the ⚡ Calc from components button.
        final_yield_weight: 0,
      } as any);
      // Redirect to the full edit page so the admin can fill in photo,
      // description, macros, components, variant link, etc.
      const newId = (created as any)?.id;
      if (newId) {
        router.push(`/meals/${newId}`);
      } else {
        router.push('/meals');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create meal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => router.push('/meals')}
          className="text-gray-400 hover:text-gray-600 text-lg"
          aria-label="Back to meals list"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold text-gray-900">New Meal Recipe</h1>
      </div>
      <p className="text-sm text-gray-500 mb-8 ml-8">
        The essentials to get this dish on the menu. Photo, description, components, and macros
        are filled in on the edit page after you save.
      </p>

      {/* ── The form ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dish Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="All Hail the Chicken Caesar"
            autoFocus
            maxLength={100}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            The only name customers ever see — on the menu card, the cart, the order, the label.
          </p>
        </div>

        {/* Diet Plan */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Diet Plan <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 p-1 bg-gray-50">
            <button
              type="button"
              onClick={() => setDietPlanId(DIET_PLAN_OMNIVORE_ID)}
              className={`py-2 rounded text-sm font-semibold transition-all ${
                dietPlanId === DIET_PLAN_OMNIVORE_ID
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🍖 Omnivore
            </button>
            <button
              type="button"
              onClick={() => setDietPlanId(DIET_PLAN_PLANT_BASED_ID)}
              className={`py-2 rounded text-sm font-semibold transition-all ${
                dietPlanId === DIET_PLAN_PLANT_BASED_ID
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🌱 Plant-Based
            </button>
          </div>
          {dietPlanId === null && (
            <p className="mt-1 text-[11px] text-red-500 font-medium">Required — pick one before saving</p>
          )}
        </div>

        {/* Category + Sell Price side-by-side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Category <span className="text-red-500">*</span>
              </label>
              <a
                href="/settings/tags"
                className="text-[10px] text-gray-400 hover:text-brand-600 font-medium"
                title="Manage menu-cats in Settings → Tags"
              >
                Manage
              </a>
            </div>
            <select
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">— pick one —</option>
              {menuCats.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.emoji ? `${c.emoji} ${c.name}` : c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-400">Which menu tab this dish belongs to.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sell Price ($) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={pricingOverride}
              onChange={(e) => setPricingOverride(e.target.value)}
              placeholder="16.99"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="mt-1 text-[11px] text-gray-400">What the customer pays.</p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-between items-center pt-3 border-t border-gray-100">
          <p className="text-[11px] text-gray-400 italic">
            After saving, you'll be redirected to the full edit page to add photo, description,
            components, and macros.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/meals')}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Creating…' : 'Create Meal Recipe'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
