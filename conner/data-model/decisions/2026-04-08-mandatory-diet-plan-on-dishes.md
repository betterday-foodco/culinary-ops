# ADR: Every customer dish must belong to exactly one Diet Plan

**Date:** 2026-04-08
**Status:** Proposed — needs Gurleen sign-off before any code changes
**Deciders:** Conner (proposer), Gurleen (required reviewer — touches `schema.prisma`)

---

## Context

The customer-facing website has a **diet selector** as the first decision point after "get started" (see `conner/app/diet-selector.html` → eventual `conner/client-website/onboarding/`). The user picks between two cards:

- **Meat & Plants** (the omnivore plan)
- **Plants Only** (the plant-based plan)

This is not a soft filter or a recommendation — every downstream page (menu browse, cart, subscription hub, renewals) depends on knowing which plan the customer is on. The whole catalog has to be filterable by plan with zero ambiguity.

Today the data does not support this cleanly:

1. `SystemTag` has two rows with `type = 'diets'`, `subtype = 'Plan'`:
   - `fc0a70f3-644b-4248-b9c1-65882cc503de` — **Omnivore**
   - `9c68ba40-f59d-40a8-8210-bdc1f3cd3973` — **Plant-Based**
2. **Zero meals reference either of these tags** — they're visible in the admin UI at `/settings/tags` but have no write path that connects them to `MealRecipe`.
3. `MealRecipe.dietary_tags` (`String[]`) is used for badges: `Dairy Free`, `Gluten Friendly`, `Freezable`, `Family Friendly`, `Gluten Free`. None of the five distinct values in production is a diet plan.
4. The closest thing to a meat-vs-plant split today is `MealRecipe.category` — a freeform `String?` with values `Meat` (75), `Vegan` (67), `Breakfast` (10), `Snacks` (7), `Bulk Prep` (4), `Bulk Sauce` (1). Meat + Vegan covers 142 of 164 meals; the other 22 are ambiguous.
5. `MealRecipe.linked_meal_id` is a self-reference meant to pair meat↔vegan counterparts. Only **5 of 164 meals** have it populated, so the "swap a meal to its plant-based version" feature exists structurally but not in data.

The two Diet Plans tags are the missing link. This ADR proposes making them the mandatory, typed diet-plan attribute on every customer-facing dish.

---

## Decision

**Every customer-facing `MealRecipe` row must carry a required foreign key to one of the two `SystemTag` rows with `type = 'diets'`.** The column is called `diet_plan_id`, non-nullable, referencing `SystemTag(id)`, with a CHECK constraint (or app-layer guard) that the referenced tag has `type = 'diets'`.

Not an enum. Not a `String[]` convention. A real FK into the existing registry.

### Why FK and not Prisma enum

Conner chose this explicitly. The reasoning:

- The admin UI at `/settings/tags` already renders the two Diet Plan rows. If we introduce a Prisma enum alongside, we have **two sources of truth** (the enum in code + the SystemTag rows in the DB) and they will drift.
- Using the existing IDs means the admin can rename "Omnivore" → "Mixed" later, or tweak the emoji, without any code change. Enum values are frozen in code.
- The `SystemTag.rule` and `visible` fields become usable for diet-plan-level metadata (future: "show this plan on the marketing site", "auto-apply if X", etc.) without inventing a parallel config store.
- Cost: one extra JOIN at query time. Negligible.

### Why not a boolean like `is_vegan`

Binary columns don't scale if a third plan (e.g. Pescatarian) is ever added. An FK to the registry means "new plan = insert a row, no migration."

---

## Target schema change (proposed)

In `backend/prisma/schema.prisma`:

```prisma
model MealRecipe {
  // ... existing fields ...

  diet_plan_id  String      // NOT NULL — every dish has a plan
  diet_plan     SystemTag   @relation("MealDietPlan", fields: [diet_plan_id], references: [id])

  @@index([diet_plan_id])
}

model SystemTag {
  // ... existing fields ...
  dishes MealRecipe[] @relation("MealDietPlan")
}
```

Plus a CHECK constraint (raw SQL in the migration, not expressible in Prisma):

```sql
ALTER TABLE "MealRecipe"
  ADD CONSTRAINT meal_diet_plan_is_diet
  CHECK (diet_plan_id IS NOT NULL);

-- Enforce "only diets-type tags can be referenced" at app layer AND
-- via a trigger that rejects inserts/updates where the referenced
-- SystemTag row does not have type = 'diets'. Not expressible as a
-- pure CHECK constraint because it crosses tables.
```

---

## Backfill plan

The migration adds `diet_plan_id` as `NULL` first, populates it, then sets `NOT NULL`. Three phases:

### Phase 1 — obvious backfill from `category` (142 meals, automatic)

```sql
UPDATE "MealRecipe" SET diet_plan_id = 'fc0a70f3-644b-4248-b9c1-65882cc503de'
  WHERE category = 'Meat';
UPDATE "MealRecipe" SET diet_plan_id = '9c68ba40-f59d-40a8-8210-bdc1f3cd3973'
  WHERE category = 'Vegan';
```

### Phase 2 — Breakfast + Snacks (17 meals, manual review)

Conner reviews each of these and assigns a plan:

**Breakfast (10):**

| meal_code | Name | Conner's call |
|---|---|---|
| BD-369 | Bacon Cheddar Egg Bites (6-Pack) | **Omnivore** (Conner, 2026-04-08) |
| BD-528 | Up & At 'Em Omelette | **Omnivore** (Conner, 2026-04-08) |
| BD-458 | Mediterranean Omelette | **Omnivore** (Conner, 2026-04-08) |
| BD-530 | Spinach & Red Pepper Egg Bites [6-Pack] | **Omnivore** (Conner, 2026-04-08) |
| BD-529 | Spartan Sunrise Breakfast Wrap | **Omnivore** (Conner, 2026-04-08) |
| BD-363 | Sausage & Swiss Melt | **Omnivore** (Conner, 2026-04-08) |
| BD-532 | Sausage & Cheddar Melt | **Omnivore** (Conner, 2026-04-08) |
| BD-531 | Rise & Dine Protein Platter | **Omnivore** (Conner, 2026-04-08) |
| BD-378 | Pro-gurt Parfait | **Omnivore** (Conner, 2026-04-08) |
| BD-403 | Mango Chia | **Plant-Based** (Conner, 2026-04-08) |

**Snacks (7):**

| meal_code | Name | Conner's call |
|---|---|---|
| BD-426 | Grilled Chicken | **Omnivore** (Conner, 2026-04-08) |
| BD-428 | Soy Curl Protein Pack | **Plant-Based** (Conner, 2026-04-08) |
| BD-431 | Quinoa Almond Granola | **Plant-Based** (Conner, 2026-04-08) |
| BD-430 | Tropical Granola | **Plant-Based** (Conner, 2026-04-08) |
| BD-412 | Energy Balls PB | **Plant-Based** (Conner, 2026-04-08) |
| BD-404 | PB Cookies | **Plant-Based** (Conner, 2026-04-08) |
| BD-406 | Morning Glory (cookies) | **Plant-Based** (Conner, 2026-04-08) |

**Phase 2 total:** 10 Omnivore + 7 Plant-Based = 17 ✅ all resolved (Conner, 2026-04-08)

### Phase 3 — Bulk Prep + Bulk Sauce (5 meals) — **RESOLVED: these shouldn't exist as MealRecipe rows in the new model**

> **Architectural context (Conner, 2026-04-08):** These 5 rows are **SPRWT-era workarounds**. Before BetterDay built its own internal production-plan system, the company used an external e-commerce platform called SPRWT that could only order top-level meals. Whenever the kitchen needed to bulk-prep a sub-recipe for independent production (donair beef, Pad Thai sauce, seasoned chicken), someone had to create a fake `MealRecipe` row just to make it orderable through SPRWT. With Gurleen's new production-plan system, sub-recipes can be scheduled for independent production directly — so there is no longer any reason to promote a sub-recipe into a `MealRecipe` row.
>
> **Therefore the rule "every MealRecipe must have a diet plan" has zero exceptions.** The table is exclusively customer-facing dishes in the new model. The 5 SPRWT-legacy rows should be cleaned up on Gurleen's main branch as part of a separate migration — either soft-deleted via `is_active = false` or moved to `SubRecipe` — but that cleanup is independent of this ADR. This ADR's constraint can be `diet_plan_id NOT NULL` with no conditional carve-out.
>
> **Local branch status:** Conner deleted all 5 rows from his personal Neon branch `conner-local-dev` (`br-little-hall-aeffmfdm`) on 2026-04-08. Cascade removed 10 associated `MealComponent` rows. **Gurleen's main branch still contains all 5 rows** and needs its own cleanup decision before this ADR's migration can run against production. The branch can be reset to parent to restore them if needed.

~~These are not customer meal-plan items — they are grocery retail sides and kitchen sauces:~~ (superseded by the architectural context above)

| meal_code | Name | Category |
|---|---|---|
| BD-499 | Grocery Donair Beef | Bulk Prep |
| BD-555 | Grocery Seasoned Chicken | Bulk Prep |
| BD-505 | Grocery Viet Chicken | Bulk Prep |
| BD-553 | Grocery Sauce Cups | Bulk Prep |
| BD-500 | Pad Thai Sauce | Bulk Sauce |

The "every dish must have a diet plan" rule does not sit cleanly on these because they are not "dishes" in the customer meal-plan sense. Three options, **needs Conner + Gurleen decision:**

- **Option Y (Conner's lean):** Treat `category IN ('Bulk Prep', 'Bulk Sauce')` as "not a customer dish" and exclude them from the rule. `diet_plan_id` becomes `NULL` for these rows, and the NOT NULL constraint is replaced with a conditional constraint: `diet_plan_id IS NOT NULL OR category IN ('Bulk Prep', 'Bulk Sauce')`. Uses signal that already exists.
- **Option X:** Add a new `is_meal_plan_item Boolean` column. `diet_plan_id` is required only when `is_meal_plan_item = true`. Cleaner semantically, but introduces a second column that duplicates what `category` already implies.
- **Option Z:** Force-assign all 5 to Omnivore because the 4 meats + 1 sauce aren't plant-based. Simplest, mildly lies in the data, gets unblocked fastest.

This ADR **does not resolve Phase 3.** It flags it for the Gurleen review.

---

## Admin UI requirement — `/meals/` interface

The rule only works if it's **impossible to create or save a dish without picking a plan.** That means the edit form at `frontend/app/(dashboard)/meals/[id]/page.tsx` (and the create form at `frontend/app/(dashboard)/meals/new/page.tsx`) need to enforce it at the UI level, not just trust the backend to reject bad input.

### What the toggle looks like

Two-option segmented control on the **Details** tab of the meal edit page, rendered near the top (above category/protein_types, because it's the most fundamental attribute):

```
┌─ Diet Plan (required) ────────────────────────────────┐
│  ◉ Omnivore              ○ Plant-Based                │
└───────────────────────────────────────────────────────┘
```

Rules:
- Radio-style segmented control (not a dropdown and not a checkbox) — exactly one must be selected, always.
- **No "neither" state.** On new-meal create, one of the two must be pre-selected before the form can submit. Suggested default: `Omnivore`, because it's the larger bucket historically, but this is a UX call.
- **Cannot be cleared.** The unselect interaction is deliberately impossible.
- On existing meals without a plan (during the migration window, before NOT NULL flips), the toggle shows an empty state with a red "required" flag and the Save button is disabled until a choice is made. This turns the migration backfill into a human-visible workflow instead of silent data.
- The `SystemTag.name` value is displayed ("Omnivore" / "Plant-Based") so that renaming in `/settings/tags` propagates automatically. No hardcoded strings in the meal edit component.

### How the dropdown values get fetched

The meal edit page should fetch the two diet-plan tag rows via the existing `api.getTags()` call and filter client-side to `type === 'diets'`. Memoize so every meal edit doesn't re-fetch. If the two tags aren't present (empty DB), the form surfaces an error and disables the save button rather than silently falling back — because the rule requires the tags exist as the source of truth.

### Conditional "link a plant-based version" picker (replaces the old Omnivore toggle)

**Refined UX (Conner, 2026-04-08):** Conner's `betterday-kitchen-v4.html` mockup had a separate "Omnivore Dish" toggle + a "Plant-based version" search picker underneath. Under the mandatory diet-plan rule, the toggle becomes redundant — **the diet plan value IS the omnivore/plant-based designation**. The mockup's `toggleOmni()` JS function should not be ported. Instead:

- The two-option segmented control above is the one and only classifier. It replaces both `category = 'Meat' | 'Vegan'` AND the old Omnivore toggle in one move.
- **When** the meal's `diet_plan_id` equals the Omnivore SystemTag ID (`fc0a70f3-644b-4248-b9c1-65882cc503de`), a second UI block appears immediately below the toggle: a "Plant-based version" search picker that lets the user link this dish to its plant-based counterpart. This writes to the existing `MealRecipe.linked_meal_id` column.
- **When** the meal's `diet_plan_id` equals the Plant-Based SystemTag ID (`9c68ba40-f59d-40a8-8210-bdc1f3cd3973`), the picker does **not** render. Plant-based dishes are the "terminal" side of the pairing — the relationship is stored on the omnivore side only and discovered from the plant-based side via the existing reverse relation (`variant_meals` in `schema.prisma`).
- Changing the diet plan from Omnivore → Plant-Based while a link exists should prompt: "This will unlink the current plant-based version. Continue?" and clear `linked_meal_id` on save if confirmed.

### Why the link MUST be unidirectional: the Vegan Alfredo case (N-to-1)

**Implementation note (Conner, 2026-04-08):** Conner confirmed the product model is **N-to-1** — a single plant dish can be the counterpart for multiple meat dishes. Concrete example: one "Vegan Alfredo" paired simultaneously with Shrimp Alfredo, Chicken Alfredo, AND Beef Alfredo. This hasn't appeared in production data yet but is a planned use case.

`MealRecipe.linked_meal_id` is a single `String?` column. It can hold exactly one uuid or null. In an N-to-1 world where Vegan Alfredo is the counterpart for three omnivore dishes:

```
Shrimp Alfredo   → linked_meal_id = VeganAlfredo.id  ✓
Chicken Alfredo  → linked_meal_id = VeganAlfredo.id  ✓
Beef Alfredo     → linked_meal_id = VeganAlfredo.id  ✓
Vegan Alfredo    → linked_meal_id = ???  (can only be one value)
```

A bidirectional write (where `linkVariant` updates BOTH rows) would silently corrupt the data the moment the second meat-side link fires: the plant's `linked_meal_id` would get overwritten and the first omnivore's reverse reference would be broken. The only way a single `String?` column can represent N-to-1 is to store the FK exclusively on the "many" side (meat dishes) and discover the "one" side (plant dish) via the Prisma `variant_meals` reverse relation — which naturally returns N rows.

**Status as of 2026-04-08:** `backend/src/modules/meals/meals.service.ts` has been updated on the `conner/universal-brand-folder` branch to make `linkVariant` unidirectional. The bidirectional `Promise.all` write pattern has been replaced with a single `prisma.mealRecipe.update` on the omnivore side. `unlinkVariant` similarly clears only the omnivore side. A self-link guard (`id === linkedId`) and `NotFoundException` checks were added at the same time. The full diet-equality guard (rejecting two-omnivore or two-plant links) is deferred until `MealRecipe.diet_plan_id` exists — marked with a `TODO` comment in the service.

This change is a **correctness fix**, not an optimization. Shipping a bidirectional `linkVariant` would make the first Vegan Alfredo case in production silently break data. Gurleen should review the service-layer change as part of the diet-plan ADR rollout, but it's independently necessary regardless of the diet-plan column.

### Search picker behavior (adapted from `betterday-kitchen-v4.html` lines 894-915)

The picker reuses the mockup's search-dropdown UX but fixes two bugs in the original JS:

1. **Self-exclusion must use the live meal ID**, not the hardcoded `'#463'` in the mockup. Filter: `WHERE other.id != currentMeal.id`. (This guard was added to `linkVariant` in the backend on 2026-04-08 as an `id === linkedId` check.)
2. **Results must be filtered to the opposite diet plan only.** The mockup's `filterOmni()` lets you accidentally link a meat dish to another meat dish. The real query should be `WHERE other.diet_plan_id = PLANT_BASED_ID` — the picker is inside the omnivore branch, so by definition it should only show plant-based results.

Debounced autocomplete (Gurleen's existing variant search on the live page already has this pattern — reuse it), top 12 results, monospace meal_code prefix + display_name in each option row. On pick, write `linked_meal_id` to the selected meal's id and close the dropdown.

### Known prerequisite bug — pair modal click handler (fixed 2026-04-08)

The menu builder at `frontend/app/(dashboard)/menu-builder/page.tsx` has a "Pair assignment modal" that opens when a user clicks the teal `⚠ ???` half of an omni cell whose meat dish has no `linked_meal_id`. Until 2026-04-08, the modal's click handler had three compounding bugs that silently prevented any link from ever being created through it:

1. **Wrong URL** — raw relative `fetch('/api/meals/...')` hit the Next.js frontend origin (`:3000`) instead of the NestJS backend (`:3001`)
2. **Wrong auth token key** — read `localStorage.getItem('token')` but the app stores it as `'access_token'`, so every request was sent with an empty `Bearer ` header
3. **Silent error handling** — empty `catch {}` swallowed all failures, so the modal appeared to "close successfully" while the DB was never mutated

Fixed on the `conner/universal-brand-folder` branch by replacing the raw fetch with the typed `api.linkMealVariant(mealId, linkedId)` helper, which uses the correct `NEXT_PUBLIC_API_URL`, pulls the token via `getToken()`, and throws on non-2xx so errors surface via an `alert()`. 7-line change. Independent of the diet-plan ADR but blocking for the omni-pair-assignment workflow this ADR depends on.

### Interaction with existing fields on the form

The Details tab already has fields for `category` (Meat/Vegan/Vegetarian/Fish & Seafood/Breakfast/Snack/Soup/Salad/Granola/Other), `dietary_tags` (including a `Vegan` badge), and `protein_types` (including `Plant Protein`). These three fields all partially encode diet-ness today and the new `diet_plan_id` will partially duplicate them. That's fine for now — the new field becomes the source of truth for the customer diet selector, and the existing fields stay as additional metadata for badges, labels, and kitchen workflows. Long-term cleanup (retire redundant values, remove `Vegan` from `dietary_tags`, collapse `category`'s meat/vegan distinction) is out of scope for this ADR.

### Where it shows up elsewhere

Once the field exists, the following should also display it (read-only or tiny) but don't block this ADR:

- `/meals/` list page — add a column or chip next to the category
- `/meals/pricing` — filter by plan
- `/menu-builder/` — ensure the meat/omni/vegan rotation columns respect the plan
- Customer-facing client-website `/menu/` page — filter by the customer's chosen plan
- Label printing — "Plan: Omnivore" on the product label if Gurleen wants

---

## Bundled cleanup: remove `MealRecipe.net_weight_kg`

Since this ADR is already touching `MealRecipe` for the `diet_plan_id` addition, bundling the removal of an orphan column into the same review saves Gurleen one context switch.

### The column is orphan data

`MealRecipe.net_weight_kg` (`Float @default(0)`) is declared at `backend/prisma/schema.prisma:122` and has **9 references across the whole repo**, none of which are load-bearing:

| File | Line | Purpose |
|---|---|---|
| `backend/prisma/schema.prisma` | 122 | Column declaration |
| `backend/src/modules/meals/dto/meal.dto.ts` | 121 | Optional field on the update body |
| `backend/src/modules/meals/meals.service.ts` | 338 | Single `select: { net_weight_kg: true }` in the meal detail query |
| `backend/scripts/export-meals.js` | 35, 76, 112 | Manually-run CSV export script |
| `frontend/app/(dashboard)/meals/[id]/page.tsx` | 26, 208, 385 | Interface type, setState on load, submit payload |

**Crucially, it's NOT referenced by:**

- The cost engine (`cost-engine.service.ts`) — doesn't factor into price or margin
- Production planning, kitchen portal, menu queue, corporate, orders — no operational use
- Label printing — not on the physical product label
- Any of the reports (meals, cooking, sub-recipes, shopping-list, inventory)
- The meals list page, the meals pricing page
- **The "new meal" form (`meals/new/page.tsx`)** — meaning new meals start with `net_weight_kg = 0` and it's only editable *after* creation. The field has no entry point in the create flow at all.

No foreign keys, no cost calculations, no downstream consumers. It's a column that exists because someone added it once and nothing ever used it.

### `final_yield_weight` is the real weight field

For comparison, `final_yield_weight` has **16 references** across schema, DTO, service (two separate select queries — list + detail), the import script, API type definitions (3 entries), the meal list page (shown as "{n}g" per row), the pricing page, CSV export, the meal edit form, AND the meal create form. That's the load-bearing weight column.

Conner's call: "We can delete `net_weight_kg` from the interface. `final_yield_weight` should be the only one we need." Confirmed by the grep — nothing blocks the removal.

### What the removal migration touches

Six files, no FK cascades, no data loss risk:

1. **`backend/prisma/schema.prisma`** — drop the column declaration
2. **New Prisma migration file** — `ALTER TABLE "MealRecipe" DROP COLUMN "net_weight_kg";`
3. **`backend/src/modules/meals/dto/meal.dto.ts:121`** — remove the DTO field
4. **`backend/src/modules/meals/meals.service.ts:338`** — remove from the select clause
5. **`backend/scripts/export-meals.js:35,76,112`** — remove from the CSV export (or leave as empty column for backward-compatible CSV consumers, Gurleen's call)
6. **`frontend/app/(dashboard)/meals/[id]/page.tsx:26,208,385`** — remove interface field, remove `setNetWeightKg` state + load hook, remove from the update submit body

Items 1–5 are shared `backend/` review. Item 6 is Gurleen's `frontend/` territory. This ADR proposes all 6 but makes no assumption about who writes each change.

### Why bundle instead of split

- Both changes are to `MealRecipe` — one review, one migration window, one deploy
- The cleanup is small enough (no product impact, no data decisions) that splitting creates more overhead than it saves
- If Gurleen vetoes the `diet_plan_id` change, she can still approve the `net_weight_kg` removal as a standalone pick-out — the two are independent

---

## Consequences

### What gets easier

- The customer diet selector becomes a 1-line filter: `WHERE diet_plan_id = :chosen_plan_id`. No fuzzy string matching, no category heuristics, no "linked_meal_id or fallback."
- The `MealRecipe.category` field can eventually be retired or repurposed as a pure UI category (Entree, Sandwich, Bowl) without carrying the meat/vegan distinction.
- `MealRecipe.linked_meal_id` becomes more meaningful: "this is my counterpart on the other plan." Pairs become a property of the relationship, not a fragile denormalization.
- The admin `/settings/tags` Diet Plans section finally does something — editing the tag name updates the label everywhere because the FK resolves at read time.

### What gets harder / riskier

- **This is Gurleen's schema.** Per `.github/CODEOWNERS`, `backend/prisma/` is shared territory and any change needs her review. This ADR exists specifically so the conversation happens before code.
- Backfill phase 2 is manual — Conner has to assign 17 meals by hand (or Gurleen does, if she knows the recipes better).
- Kitchen-side features that currently filter by `category = 'Vegan'` continue to work, but any new code should prefer `diet_plan_id`. We'll have two overlapping signals until a cleanup pass removes the old one.
- The `SystemTag.type = 'diets'` constraint is enforced by app layer + trigger, not a pure CHECK constraint, because it's cross-table. Means a future dev who bypasses the service layer can technically write a garbage FK. Tradeoff of using the generic registry instead of an enum.
- If Gurleen ever renames the Omnivore/Plant-Based SystemTag rows, the display changes but the IDs stay — safe. But if she ever **deletes** one of those rows, the FK breaks every meal. Mitigation: mark those two SystemTag IDs as "protected" at the service layer and refuse to delete them.

### What this changes for Conner's workflow

- The data model for the client-website diet selector is now defined. `conner/data-model/entities.md` gets a `customer.diet_plan_id` FK to match (customers also have a persistent plan selection).
- `conner/client-website/onboarding/diet-selector.html` can finally be wired up with real data shapes instead of mocks.
- This is a **culinary schema** change (`schema.prisma`), not a commerce schema change (`schema.commerce.prisma`). So it breaks Conner's usual "I only touch commerce" rule. That's why this ADR is explicitly framed as a Gurleen-review item.

---

## Open questions (must resolve before writing code)

1. **Phase 3 — Bulk Prep / Bulk Sauce.** Option X, Y, or Z above? (Gurleen + Conner)
2. **Phase 2 backfill assignments.** Who decides each of the 17 Breakfast + Snack meals — Conner, Gurleen, or review together?
3. **Protected SystemTag rows.** Should the tags service refuse to delete the two diet-plan rows? Any other "system-critical" tags that should get the same protection?
4. **Customer side.** Does `Customer` in `schema.commerce.prisma` also get a `diet_plan_id` (persistent preference, set at onboarding)? Almost certainly yes, but that's a commerce-schema change and belongs in a separate commit.

   **Conner's framing (2026-04-08):** the client-side diet selector step is conceptually just "pick one of the two `SystemTag` rows with `type = 'diets'`." The selection IS the FK. The selector does not compute, infer, or translate — it writes a `SystemTag.id` onto the customer record, then every downstream page filters meals by matching `MealRecipe.diet_plan_id = customer.diet_plan_id`. This reinforces the FK-not-enum decision because it means both sides of the join (customer → dish) reference the same two rows, and renaming "Omnivore" to something else in the admin UI changes the label on both sides with zero code change.
5. **Migration timing.** Do we ship this before or after the Conner client-website pages start consuming it? Probably before — the HTML-first workflow says the page is built against a data shape that already exists.

---

## Rollout sketch (when this is approved)

1. Gurleen + Conner resolve the SPRWT-legacy row cleanup (5 Bulk Prep/Bulk Sauce rows on main branch — independent of this ADR's rule).
2. Phase 2 assignments already resolved (Conner, 2026-04-08 — see table above).
3. Branch `conner/diet-plan-on-meal` off `main`.
4. Prisma schema change + migration SQL (add nullable column, backfill Phase 1 + Phase 2 in a transaction, flip to NOT NULL).
5. Trigger for the cross-table CHECK (referenced SystemTag must have `type = 'diets'`).
6. Small service-layer change in `tags.service.ts` to refuse deleting the two protected tag IDs (`fc0a70f3-...` Omnivore, `9c68ba40-...` Plant-Based).
7. Backend Meals service and DTOs updated to require `diet_plan_id` on create/update, reject without it.
8. **Frontend `/meals/[id]/page.tsx` and `/meals/new/page.tsx`** — add the required two-option toggle (Gurleen's territory, see UI requirement section above). Fetches tag options via existing `api.getTags()` filtered to `type === 'diets'`.
9. Update `conner/data-model/entities.md` with the new `meal.diet_plan_id` field and a matching `customer.diet_plan_id` proposal (separate commit/PR for the commerce side).
10. **Bundled cleanup:** drop `MealRecipe.net_weight_kg` in the same migration — remove column from schema, drop DTO field, remove service `select`, remove frontend interface/state/submit, clean up `export-meals.js`. See "Bundled cleanup" section above.
11. PR, Gurleen review, merge.
12. Then — and only then — the Conner client-website `diet-selector.html` can reference the field.

No code touched as part of this ADR. This is a proposal only.
