# Flow: Meal Variants (Omnivore ↔ Plant-Based Linking)

How the "this omnivore dish has a plant-based counterpart" relationship is represented, created, edited, and consumed across the BetterDay codebase. This doc captures the **current state** (as of 2026-04-08) plus the **target state** once the mandatory diet-plan ADR lands, so anyone wiring up a new feature in this area has a single source of truth.

**Related:** `../decisions/2026-04-08-mandatory-diet-plan-on-dishes.md`

---

## Mental model

Every customer-facing dish is classified as **one of two diet plans**: Omnivore or Plant-Based. The classification is mandatory and lives on the dish row itself (post-ADR: `MealRecipe.diet_plan_id`; today: inferred from `MealRecipe.category`).

**A variant link is a directed "this omnivore dish has a counterpart on the plant-based menu" pointer.** When a customer clicks "Swap to plant-based" on the weekly menu, the system follows the link to serve the counterpart. When the customer is on the Plants Only plan, the menu filters out everything except plant-based dishes, and the link is only used in reverse for "which omnivore dish was this derived from" admin visibility.

Two design axes are independent and have been confused in the past:

| Axis | Possible values | What it means |
|---|---|---|
| **UX axis** | `one-way` / `symmetric` | Does the UI show the link picker on both sides, or only on the omnivore side? |
| **Data axis** | `one-way` / `bidirectional` | Does the DB store the FK on both rows, or only on the omnivore row with the plant-based side using the reverse relation? |

These can be mixed. Current state vs. target state of each:

| | UX axis | Data axis |
|---|---|---|
| Conner's HTML mockup (`conner/betterday-kitchen-v4.html`) | **one-way** (picker only visible when the "Omnivore Dish" toggle is on) | **no persistence** — it's a mockup, `pickOmni()` only updates DOM |
| Gurleen's live code, pre-2026-04-08 | **symmetric** (the "🔗 Meal Variant" card renders on every meal's Details tab, meat or vegan) | **bidirectional** (`linkVariant` wrote `linked_meal_id` on both rows via `Promise.all`) — **broken for N-to-1**, silently corrupted the moment two meat dishes were linked to the same plant pair |
| Current state on `conner/universal-brand-folder` | symmetric (UI unchanged until diet-plan ADR lands) | **unidirectional** (`linkVariant` now writes only the omnivore side — see `backend/src/modules/meals/meals.service.ts`) |
| Target state after the diet-plan ADR | **one-way** (picker only renders when `diet_plan_id === omnivore`) | **unidirectional, as now** — reads via `variant_meals` reverse relation on the plant side |

**Why unidirectional matters:** per Conner (2026-04-08), the product model is N-to-1 — a single plant dish can be the counterpart for multiple meat dishes (e.g. one "Vegan Alfredo" paired with Shrimp Alfredo, Chicken Alfredo, and Beef Alfredo). The `linked_meal_id` column on the plant dish can only hold one uuid, so the moment you try to bidirectionally link the second meat dish, the plant's pointer gets overwritten and the first link is silently lost. Unidirectional storage (meat owns the pointer, plant discovered via reverse relation) is the only way a single `String?` FK column can represent N-to-1.

---

## Entities involved

- `MealRecipe` — the dish catalog (culinary schema). Holds `linked_meal_id String?` self-referencing FK and the reverse-relation `variant_meals`.
- `SystemTag` — the tag registry with two rows under `type = 'diets'`:
  - `fc0a70f3-644b-4248-b9c1-65882cc503de` — **Omnivore**
  - `9c68ba40-f59d-40a8-8210-bdc1f3cd3973` — **Plant-Based**
- `MenuQueueItem` — weekly rotation queue. Reads `linked_meal_id` to present meat/omni/vegan pairings in the menu builder.

---

## Data shape (current)

```prisma
// backend/prisma/schema.prisma
model MealRecipe {
  id              String        @id @default(uuid())
  meal_code       String?       @unique
  display_name    String
  category        String?       // "Meat" | "Vegan" | ... (will become legacy post-ADR)
  linked_meal_id  String?       // nullable self-FK
  linked_meal     MealRecipe?   @relation("MealVariants",
                                  fields: [linked_meal_id],
                                  references: [id],
                                  onDelete: SetNull)
  variant_meals   MealRecipe[]  @relation("MealVariants")  // reverse relation

  // Target state (after ADR):
  // diet_plan_id  String        // NOT NULL, FK → SystemTag.id (type='diets')
  // diet_plan     SystemTag     @relation("MealDietPlan", ...)

  @@index([linked_meal_id])
}
```

One self-referencing FK column. Either side *could* technically point at the other, but as of 2026-04-08 the write path only sets it on the omnivore side. The plant side's `linked_meal_id` stays null; plant-to-meat discovery happens through the `variant_meals` reverse relation, which naturally supports N-to-1.

---

## Creating a link (current backend behavior)

### API

```
PATCH /api/meals/:id/link-variant
Content-Type: application/json
Authorization: Bearer <jwt>

{ "linked_meal_id": "uuid" }    ← link
{ "linked_meal_id": null }      ← unlink
```

Single endpoint, nullable body field discriminates between link and unlink.

### Controller — `backend/src/modules/meals/meals.controller.ts:74-83`

```typescript
@Patch(':id/link-variant')
linkOrUnlinkVariant(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() body: { linked_meal_id: string | null },
) {
  if (body.linked_meal_id === null) return this.service.unlinkVariant(id);
  return this.service.linkVariant(id, body.linked_meal_id);
}
```

### Service — `backend/src/modules/meals/meals.service.ts:415-442`

```typescript
/** Bidirectionally link two meals as variants */
async linkVariant(id: string, linkedId: string) {
  await Promise.all([
    this.prisma.mealRecipe.update({ where: { id },       data: { linked_meal_id: linkedId } }),
    this.prisma.mealRecipe.update({ where: { id: linkedId }, data: { linked_meal_id: id } }),
  ]);
  return this.findOne(id);
}

/** Bidirectionally unlink a meal variant */
async unlinkVariant(id: string) {
  const meal = await this.prisma.mealRecipe.findUnique({
    where: { id }, select: { linked_meal_id: true },
  });
  const updates = [
    this.prisma.mealRecipe.update({ where: { id }, data: { linked_meal_id: null } }),
  ];
  if (meal?.linked_meal_id) {
    updates.push(
      this.prisma.mealRecipe.update({
        where: { id: meal.linked_meal_id },
        data: { linked_meal_id: null },
      }),
    );
  }
  await Promise.all(updates);
  return this.findOne(id);
}
```

**Key observations:**

1. **Both sides get the FK written.** After `linkVariant(A, B)`, row A has `linked_meal_id = B` AND row B has `linked_meal_id = A`.
2. **No diet check.** The service accepts any two meal IDs — there's nothing preventing a meat dish from being linked to another meat dish. This is a known gap; the ADR proposes a server-side guard.
3. **No self-link check.** A dish could be linked to itself (`linkVariant(A, A)`) and the two Prisma updates would just both set `A.linked_meal_id = A`. Should probably be caught.
4. **`unlinkVariant` is safe to call on an already-unlinked dish** — the `if (meal?.linked_meal_id)` guard skips the second update if there's nothing to clear.

---

## Reading a link

### Detail endpoint — `meals.service.ts:41-44`

```typescript
include: {
  linked_meal:   { select: { id: true, name: true, display_name: true, category: true, meal_code: true } },
  variant_meals: { select: { id: true, name: true, display_name: true, category: true, meal_code: true } },
  ...
}
```

The detail endpoint returns **both** the forward link (`linked_meal`) and the reverse relation (`variant_meals`). Since the write path became unidirectional on 2026-04-08, `variant_meals` is **load-bearing** for the plant-dish-edit-page's "Referenced from" row — a single Vegan Alfredo dish will see all N omnivore Alfredos that point at it in its `variant_meals` array. The list endpoint uses a lighter include (`linked_meal` only, no `variant_meals`) for efficiency on the meat side.

### List endpoint — `meals.service.ts:25-27`

```typescript
include: {
  linked_meal: { select: { id: true, display_name: true, meal_code: true } },
  ...
}
```

This is what powers the 🔗 icon next to meal names in the meals list page.

---

## UI surfaces where links are created, viewed, or edited

### 1. Meal edit page — `frontend/app/(dashboard)/meals/[id]/page.tsx:754-825`

The dedicated "🔗 Meal Variant (Meat ↔ Vegan)" card on the **Details** tab. Rendered on every meal's page today (symmetric UX). Three states:

**Already linked:** Green pill showing the linked variant's `display_name` + `meal_code`, clickable to navigate, with an `[Unlink]` button.

**Not linked, suggestions available:** Calls `GET /api/meals/:id/suggested-variants` on load. Shows a list of auto-matched candidates with `matchedWords` annotations and a `[Link]` button per row.

**Not linked, no suggestions:** Plain freeform text search against all meals. Results render as a list with a `[Link]` button per row.

**Plus at the bottom:** "Also referenced from: [pill] [pill] [pill]" — renders from `variant_meals`, the reverse-relation list. Since the write path became unidirectional, this list now **accurately reflects every omnivore dish that points at this plant dish** and can contain N entries. On a shared-base plant like Vegan Alfredo, expect multiple entries here.

### 2. Menu builder page — `frontend/app/(dashboard)/menu-builder/page.tsx:967-974`

A secondary linking path. The menu builder has a `pairModal` that lets Gurleen link dishes directly while organizing the weekly rotation. It hits the same `PATCH /api/meals/:id/link-variant` endpoint via a raw `fetch()` call.

**Notable:** the menu builder at `menu-builder/page.tsx:511-514` currently **infers diet classification from the presence of a link**:

```typescript
let diet: 'meat' | 'omni' | 'vegan' = 'omni';
if (cat.includes('vegan') || cat.includes('plant') || tags.includes('vegan')) diet = 'vegan';
else if (m.linked_meal_id)                                                     diet = 'omni';
else if (cat.includes('meat only') || (!m.linked_meal_id && cat.includes('meat'))) diet = 'meat';
```

Read literally: "if this dish has a linked_meal_id, it's omnivore." This is **backwards from the target model** — in the target, diet classification is the source of truth and the link is conditional on it. The ADR's ripple effect includes updating this inference code to read `diet_plan_id` directly.

### 3. Meal list page — `frontend/app/(dashboard)/meals/page.tsx:205-206`

A tiny `🔗` icon next to any meal with a linked variant, with a tooltip showing the counterpart's `display_name`. Read-only indicator only.

---

## Conner's HTML mockup (`conner/betterday-kitchen-v4.html`)

The mockup was built before Gurleen's linking code was fully visible. It differs from the live code in two ways:

### Mockup structure

```html
<!-- Lines 343-364 -->
<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
  <div class="toggle-wrap">
    <div class="toggle" id="omni-toggle" onclick="toggleOmni(this)"></div>
    <span class="toggle-label" style="font-weight:600;">Omnivore Dish</span>
  </div>
  <span>Has both a meat and plant-based version — links the two together</span>
</div>

<div id="omni-section">
  <div class="omni-box">
    <span>Plant-based version:</span>
    <div class="omni-sw">
      <input id="omni-search" placeholder="Search dishes..." ... />
      <div class="omni-dd" id="omni-dd"></div>
    </div>
    <div class="omni-sel" id="omni-sel">
      <span>#54</span>
      Under the Tuscan Sun
    </div>
  </div>
</div>
```

The mockup has a **separate "Omnivore Dish" toggle** that reveals the linked-variant picker when on. The picker is only intended for meat dishes; vegan dishes don't get a picker at all. This is the `one-way` UX pattern.

### Mockup JS — `conner/betterday-kitchen-v4.html:894-915`

```javascript
function toggleOmni(el){
  el.classList.toggle('off');
  document.getElementById('omni-section').style.display =
    el.classList.contains('off') ? 'none' : 'block';
}
function filterOmni(v){
  showOmniDD();
  const filtered = dishes.filter(d => d.id !== '#463' && d.name.toLowerCase().includes(v.toLowerCase()));
  renderOmniDD(filtered.slice(0, 12));
}
function pickOmni(id, name){
  document.getElementById('omni-search').value = name;
  document.getElementById('omni-sel').innerHTML = `<span>${id}</span>${name}`;
  document.getElementById('omni-dd').style.display = 'none';
}
```

**The mockup has zero persistence.** `pickOmni()` only updates DOM elements (the search input value and the selected pill display). There's no backend call, no local state, nothing written anywhere. So the "one-way" vs "bidirectional" data question doesn't apply to the mockup — there simply is no data storage to be one-way or bidirectional in. It's purely a visual prototype.

The mockup's data source is a hardcoded JavaScript array (`const dishes = [...]` at line 858) with 22 entries each shaped `{ id: '#54', name: 'Under the Tuscan Sun', type: 'veg' }`. Note the `type: 'veg' | 'meat'` field — the mockup already thinks of diet classification as a required discriminator on every dish, which reinforces the diet-plan ADR.

### Two bugs in the mockup JS that need fixing when it's ported

1. **`filterOmni()` hardcodes self-exclusion with `d.id !== '#463'`** (line 899) — that's the current dish's ID baked in. In real code this must be `d.id !== currentMealId`.
2. **No diet filtering.** The search shows all dishes regardless of their `type` field. The picker is inside the "Omnivore" branch, so it should only show `type: 'veg'` results, but it doesn't. A meat dish can be accidentally linked to another meat dish through the mockup.

Both bugs get baked into the target-state rules below.

---

## Target state (after the diet-plan ADR lands)

### UI rules

1. The "🔗 Meal Variant" card on `meals/[id]/page.tsx` becomes **conditional** — only renders when `meal.diet_plan_id === omnivore_tag_id`. On plant-based dishes, the card is hidden entirely.
2. The diet-plan segmented toggle (added by the ADR) becomes the single classifier. The mockup's separate "Omnivore Dish" toggle is **not ported** — the diet plan value IS the omnivore designation.
3. Changing a dish from Omnivore → Plant-Based while a link exists prompts: "This will unlink the current plant-based version. Continue?" and clears `linked_meal_id` on save if confirmed.
4. The variant search results **filter to the opposite diet plan only**. Concretely: `WHERE other.id != currentMeal.id AND other.diet_plan_id = PLANT_BASED_ID` when editing an omnivore dish.
5. The "Also referenced from" reverse-relation pill row stays unchanged — it's harmless and informative.

### Backend rules

6. `linkVariant` is unidirectional as of 2026-04-08 (writes only the omnivore side). The backend behavior already matches the target; no further change needed.
7. `linkVariant` gains a server-side diet check:

   ```typescript
   const [a, b] = await Promise.all([
     this.prisma.mealRecipe.findUnique({ where: { id },       select: { diet_plan_id: true } }),
     this.prisma.mealRecipe.findUnique({ where: { id: linkedId }, select: { diet_plan_id: true } }),
   ]);
   if (!a || !b) throw new NotFoundException();
   if (a.diet_plan_id === b.diet_plan_id) {
     throw new BadRequestException('Linked variants must have different diet plans');
   }
   ```

   This guard enforces the invariant at the service boundary so it holds even against curl/scripts bypassing the UI.

8. `getSuggestedVariants` should filter its candidate pool to the opposite diet plan. Current behavior (name-matching heuristic) is untouched, just the candidate set narrows.

9. The menu-builder's diet inference (`if (m.linked_meal_id) diet = 'omni'`) is removed. `diet = m.diet_plan_id === omnivore_id ? 'omni' : 'vegan'` replaces it.

### Migration considerations

- During the ADR's nullable-column window (before NOT NULL flips), the diet check guard in step 7 has to tolerate `diet_plan_id = null` — probably by rejecting any link attempt involving an unclassified dish with an explicit "classify this dish first" error.
- Existing links on the 5 meals in production that currently have `linked_meal_id` set will need to be validated post-backfill — if the backfill somehow produces two same-diet meals with a pre-existing link, that's an invariant violation that needs a manual fix.

---

## Edge cases to test

- Link two dishes on different plans → both rows update, `linked_meal` and `variant_meals` both return the counterpart. ✅
- Attempt to link two dishes on the same plan → 400 BadRequest. ✅
- Attempt to link a dish to itself → should 400 (not currently guarded; add to ADR as a bonus fix).
- Unlink a dish that was never linked → no-op, 200 OK. ✅
- Delete one side of a linked pair → `onDelete: SetNull` fires on the FK, the other side's `linked_meal_id` becomes null. ✅
- Change a linked omnivore dish's `diet_plan_id` to plant-based → prompt and unlink on save. Must not silently break the invariant.
- Rename the "Omnivore" or "Plant-Based" SystemTag row → display updates everywhere because the FK resolves at read time. ✅
- Delete one of the two diet-plan SystemTag rows → every linked meal breaks. The tags service should refuse to delete them (see ADR open question #3).
- Concurrent `linkVariant(A, B)` and `linkVariant(A, C)` — race condition where A ends up pointing at one and B/C point at A. Currently unhandled; accept the race or wrap in a transaction with row locks.

---

## Known gaps / open questions

1. **Self-link guard** — `linkVariant(A, A)` is currently allowed. Should be rejected.
2. **Transaction safety** — the two Prisma updates in `linkVariant` run via `Promise.all`, not wrapped in `$transaction`. If one fails, the DB ends up in a half-linked state.
3. **`suggested-variants` heuristic** — I haven't opened that endpoint's implementation. Worth a read before the ADR ships to understand whether it already does diet-aware filtering or needs updating.
4. **Menu-builder pair modal** — uses a raw `fetch()` instead of the `api.linkMealVariant` client helper. Should converge on the client helper so error handling is uniform.

---

## Summary for future readers

If you're touching anything involving `linked_meal_id` or the variant picker:

- **The source of truth for "is this dish omnivore or plant-based"** is going to be `MealRecipe.diet_plan_id` post-ADR, and `MealRecipe.category` until then. **NOT** the presence of `linked_meal_id`.
- **The FK is unidirectional on write** (meat → plant only) as of 2026-04-08. On the omnivore side, check `linked_meal` to find the plant pair. On the plant side, use `variant_meals` (reverse relation) to find all meat dishes that point at this plant — this list can have N entries for shared-base plants like Vegan Alfredo.
- **The picker UI is only shown on the omnivore side** after the ADR. Don't port Conner's separate "Omnivore Dish" toggle — it's replaced by the diet-plan classifier.
- **Invariant:** linked meals must have **different** `diet_plan_id` values. Enforce at both UI and service layers.
