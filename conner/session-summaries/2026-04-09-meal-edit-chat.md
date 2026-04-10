# Session summary — meal-edit + new-meal-form refactor chat

**Date range:** 2026-04-08 → 2026-04-09
**Chat identity:** "meal-edit chat" in `conner/MULTI-CHAT-STATUS.md`
**Feature branch:** `conner/2026-04-08-meal-edit-menu-cats-refactor`
**Status at end of session:** ✅ **merged into `conner/universal-brand-folder`** via **PR #10** (`89c3502`)

> This is a retrospective of one Claude chat's work across two days, written
> at the end of the session for Conner's reference and for any future chat
> picking up where this one left off. Commit it if you want a permanent
> record; delete it when it's stale. It's a scratch handoff note, not a
> canonical spec — canonical docs live in `conner/data-model/decisions/`
> and `conner/data-model/flows/`.

---

## TL;DR

Built the "Diet Plan" classifier system end-to-end across schema, backend,
frontend, and data — every `MealRecipe` row now carries a mandatory foreign
key to one of two `SystemTag` rows (Omnivore / Plant-Based), the meal edit
page surfaces the choice as a required segmented toggle, and the new-meal
create form was rebuilt from a legacy kitchen skeleton into a focused Tier 1
e-commerce form. Plus two bug fixes, one N-to-1 variant-linking rewrite,
one full-DB backfill from a CSV, one smart word-match feature, and a lot of
documentation (including a multi-chat incident file that caught 5 separate
contamination events over the two days). All work is on
`conner/universal-brand-folder` as of the PR #10 merge.

---

## What got built / changed — in order

### 1. Diet Plan classifier (schema + backend + frontend + data)

**The rule:** every customer-facing `MealRecipe` row must belong to exactly
one Diet Plan — Omnivore or Plant-Based. Drives the customer-facing diet
selector on the website. Enforced at the database level with `NOT NULL`
after a full backfill.

**Schema (`backend/prisma/schema.prisma`):**
- Added `diet_plan_id String` column to `MealRecipe`. Initially nullable
  during backfill, then flipped to `NOT NULL`.
- Two migrations: `20260409025946_add_meal_diet_plan_id` (nullable add)
  and `20260409032836_diet_plan_id_not_null` (flip).

**Source of truth for valid values:** the two `SystemTag` rows under
`type = 'diets'` — already existed before this session, just weren't being
used.
- `fc0a70f3-644b-4248-b9c1-65882cc503de` — **Omnivore**
- `9c68ba40-f59d-40a8-8210-bdc1f3cd3973` — **Plant-Based**

**Backfill (on Neon branch `conner-local-dev`):**
Used `/Users/us/Downloads/Buffer + Weekly Labels - 7.1 Dish Masterlist (15).csv`
as the source, cross-referenced against production meals by `BD-NNN ↔ #NNN`
matching. Wrote a Python script (`/tmp/backfill_diet.py`) that parsed the
CSV with `csv.reader` (NOT `DictReader` — the CSV had two `Type` columns
and `DictReader` returned the wrong one), classified every meal, and
emitted 207 SQL UPDATE statements which were applied via `psycopg2` in a
single transaction.

Final distribution: **88 Omnivore + 71 Plant-Based = 159 meals, 0 nulls.**
Source breakdown: 140 from CSV, 17 from manual overrides (Breakfast +
Snacks meals documented in the ADR), 2 from `category` fallback.

**Also during the backfill:**
- 47 meat→plant variant pairings established via `MealRecipe.linked_meal_id`
  (one-directional — see variant linking rewrite below).
- Cleaned up legacy bidirectional plant-side `linked_meal_id` pointers
  (0 plant dishes now carry a forward link — N-to-1 model intact).
- Deleted 5 SPRWT-legacy "Bulk Prep" / "Bulk Sauce" `MealRecipe` rows
  that were kitchen-intermediate sub-recipes masquerading as dishes.
  Cascade removed 10 associated `MealComponent` rows.

### 2. Variant linking — rewrite to unidirectional N-to-1

**The problem:** `MealRecipe.linked_meal_id` is a single nullable
self-referencing FK. Gurleen's original `linkVariant` wrote to both rows
via `Promise.all`, which is impossible-by-construction for the N-to-1 case
Conner needs: one Vegan Alfredo dish can be the counterpart for Shrimp
Alfredo, Chicken Alfredo, AND Beef Alfredo. A single `String?` column on
the plant dish can only hold one meat UUID at a time.

**The rewrite** in `backend/src/modules/meals/meals.service.ts`:
- `linkVariant(id, linkedId)` now writes **only the omnivore side**. One
  Prisma update, not `Promise.all` two.
- `unlinkVariant(id)` now clears only the omnivore side too. Simpler.
- The plant-based side is discovered via the existing `variant_meals`
  Prisma reverse relation, which naturally supports N-to-1 (a plant dish
  can have N entries in its `variant_meals` array).

**The flow doc** at `conner/data-model/flows/meal-variants.md` captures
the two-axes model (UX axis / data axis), the Vegan Alfredo reasoning,
and the current vs. target state for both. Written mid-session, updated
several times as my understanding improved.

### 3. Meal edit page (`frontend/app/(dashboard)/meals/[id]/page.tsx`) — full refactor

This is the commit `c7b2dec feat(meals/edit): diet-plan toggle + menu-cats
category + conditional variant picker`. The page went from "a list of
hardcoded constants and scattered cards" to "a focused left-aside panel
with the essentials + a main-panel tabbed editor."

**New at the top of the left aside (above the Active toggle):**
- **Diet Plan segmented control.** 🍖 Omnivore / 🌱 Plant-Based. Required,
  with a red "Required — pick one before saving" warning if null.
- **Conditional plant-based variant picker.** Only renders when the dish
  is Omnivore. Shows the current linked variant as a green pill with
  Unlink button, or a search input + smart-match suggestions (see next
  section). Switching Omnivore → Plant-Based while linked prompts before
  clearing.

**Category dropdown — swapped from hardcoded `CATEGORIES` const to live
SystemTag fetch:**
- Deleted the hardcoded `const CATEGORIES = [...]` list.
- Added a `SystemTag` interface and an `allTags` state variable.
- Added `api.getTags()` to the existing `Promise.all` that loads
  ingredients/sub-recipes/meals on mount.
- New `menuCats` useMemo filters tags to `type === 'menu-cats'`, sorted by
  `sort_order` then name.
- Dropdown renders one `<option>` per SystemTag row, with emoji prefix if
  present. Includes a "Manage" link to `/settings/tags` so admins have a
  one-click path to add/rename/reorder.
- **Legacy-value orphan handling:** if a meal has a category that's not in
  the current menu-cats list (e.g. `"Meat"` or `"Vegan"` before the Entree
  backfill), it surfaces as a disabled `⚠ {value} (legacy — not in
  menu-cats)` option with an amber warning. Prevents silent data loss on
  save when legacy values exist.

**Internal name — collapsed into toggle-revealed admin disclosure:**
- The old layout had Display Name and Internal Name side-by-side as equal
  fields. The new layout has Display Name as the single primary field,
  with a small `▸ Admin internal name` toggle in the corner that reveals
  the Internal Name input in a gray-background callout when expanded.
- Default is hidden. The backend auto-mirrors `display_name` into `name`
  when the field is blank (see backend DTO + service changes below).
- Documented as "grandfathered from the old SPRWT system where admins
  prefixed names like `[Meat] Chicken Alfredo` to sort them." In the new
  model, sorting happens via `diet_plan_id` + `category`, so the internal
  name is no longer routinely needed.

**Allergens + Dislikes merged into one section:**
- Three stacked sub-blocks in one card: (1) **"From ingredients"** — auto-
  detected read-only rollup from every ingredient the dish touches,
  including nested sub-recipe components, rendered as red pills; (2)
  **"Manual overrides"** — the existing `allergen_tags` PillPicker,
  positioned as additive to the ingredient list above; (3) **"Dislikes"**
  — the existing `dislikes` PillPicker, positioned under a "customer
  preference filters" subhead.
- Matches the layout in `conner/betterday-kitchen-v4.html` reference.
- The ingredient rollup is a new `useMemo` named `ingredientAllergens`
  that walks `meal.components` and nested `sub_recipe.components`.
  Limitation: doesn't recursively walk sub-recipes-of-sub-recipes. Fine
  for current data; could be improved later.

**Removed the old "🔗 Meal Variant (Meat ↔ Vegan)" card from the bottom
of the Details tab** — the picker moved to the conditional left-aside
block. In its place on plant-based dishes only: a new **"Referenced from
omnivore dishes"** card that renders `variant_meals` as red-pill buttons.
This is the N-to-1 reverse-relation display — on a shared-base plant like
Vegan Alfredo, it'll show Shrimp Alfredo / Chicken Alfredo / Beef Alfredo
all in a row.

### 4. Smart word-match suggestions for variant picker

New `smartPairSuggestions` useMemo in the meal edit page. When editing an
omnivore dish with no linked variant, the picker shows up to 3 "⚡ Smart
matches" — plant-based dishes ranked by shared word count in their
`display_name`. Implementation:

- Tokenizes both the current meal's name and every plant-based meal's
  name.
- Filters out stopwords and "protein noise" words that wouldn't
  meaningfully match (chicken, beef, veggie, tofu, etc.) and generic
  noise (bowl, salad, plate, dish, new, improved).
- Scores by shared-token count.
- Sorts descending, returns top 3.

Rendered with `⚡ Smart matches (by shared words)` label, `×N` score
badge per suggestion, and the matched words as a tooltip. Hovering a
suggestion previews "matched: caesar · kale" or whatever.

Example: editing "All Hail the Chicken Caesar" (`BD-463`) should surface
"Blackened Chick'n Caesar Bowl" (`BD-62`) as the #1 smart match via the
shared "caesar" token.

### 5. New meal create form rebuild (`frontend/app/(dashboard)/meals/new/page.tsx`)

This is the commit `df48543 feat(meals/new): rebuild create form around
Tier 1 e-commerce essentials`. The form went from 156 lines of kitchen-
operational skeleton (name / yield / components) to a focused 4-field
Tier 1 e-commerce form.

**The 4 required Tier 1 fields:**
1. **Display Name** — the only customer-facing name
2. **Diet Plan** — 🍖 Omnivore / 🌱 Plant-Based segmented toggle, same
   component as the edit page
3. **Category** — `menu-cats` dropdown, same source as the edit page
4. **Sell Price** — what the customer pays

**Fields deliberately NOT on the form** (filled in on the edit page after
redirect): internal name, final yield weight, components, photo, full
description, macros, allergens, container type, portion score, cooking
instructions, variant link.

**Backend changes to support the Tier 1 form:**
- `backend/src/modules/meals/dto/meal.dto.ts`: `name` on `CreateMealDto`
  changed from required `@IsString()` to `@IsOptional() @IsString()`.
  Legacy admin-only field no longer routinely required at the UI level.
- `backend/src/modules/meals/meals.service.ts`: `create()` now mirrors
  `display_name` into `name` when the DTO omits it. The NOT NULL DB
  constraint is satisfied silently. Fringe cases can still set a distinct
  internal name via the edit page's Admin disclosure.

**Why this rewrite was needed urgently:** the old form was broken as a
side-effect of the `diet_plan_id` NOT NULL flip. Every submit 400'd
because the old form didn't collect a `diet_plan_id`. The Tier 1 rewrite
was also the fix.

### 6. Menu builder pair modal bug fix

**The bug** (at `frontend/app/(dashboard)/menu-builder/page.tsx:968-975`):
the pair modal's click handler had **three compounding bugs** that made
every click silently fail:

1. **Wrong URL** — used a raw relative `fetch('/api/meals/...')` which
   resolved against the Next.js frontend origin (`localhost:3000`) instead
   of the NestJS backend (`localhost:3001`).
2. **Wrong auth token key** — read `localStorage.getItem('token')` but
   the rest of the app stores it as `'access_token'`. JWT header was
   literally `Bearer ` (empty).
3. **Silent error swallow** — `catch {}` with no logging.

Because `fetch()` doesn't throw on 4xx/5xx, the 404 from Next.js looked
like success, the modal closed, the queue re-fetched unchanged, and the
teal `⚠ ???` cell stayed put. Looked like the feature was just "doing
nothing."

**The fix** was a 7-line replacement that uses the existing typed
`api.linkMealVariant()` helper (which already handles URL, auth, and
errors correctly). Plus a loading-state addition on top:
- `pendingPairId` state tracks which row is being linked
- Clicked row turns blue with a Tailwind `animate-spin` spinner and
  italicized "Linking…" label
- Non-clicked rows dim to 35% opacity with `pointer-events: none`
- Double-click guard via the `pendingPairId` check

### 7. Category column bulk backfill to "Entree"

Before this session, 142 meals had `category = 'Meat'` or `'Vegan'`
(duplicating what `diet_plan_id` now carries). After the rename, every
priced dish is `Entree`:

```sql
UPDATE "MealRecipe" SET category = 'Entree'
WHERE pricing_override IN (16.99, 15.99);
-- 142 rows affected
```

Note on the price check: Conner's initial memory said `$15.49` for the
vegan price; actual DB has `$15.99`. Correlation is 1:1 with zero noise
— every meat dish is $16.99, every vegan dish is $15.99, no mixed cases.

**Final category distribution after backfill:** Entree 142, Breakfast 10,
Snacks 7.

### 8. Snacks / Snack singular-plural tag rename

The `menu-cats` SystemTag was seeded as `Snack` (singular) but the 7
affected meals in production were tagged `Snacks` (plural). After the
Entree backfill, this was the only remaining mismatch between meal
`category` values and valid `menu-cats` tag names. Renamed the tag:

```sql
UPDATE "SystemTag" SET name = 'Snacks', slug = 'snacks'
WHERE id = 'a393d4f2-1e90-4ee1-bc81-0993b4e474f3';
```

Now every meal's category matches a real `menu-cats` tag. No more "⚠
legacy — not in menu-cats" orphan warnings in the meal edit page
dropdown.

### 9. Bonus backend cleanup — `slug` column backfill on 5 models

The linter (or another chat) had added a `slug` column to Ingredient,
SubRecipe, MealRecipe, SystemTag, and CorporateCompany, but no code was
setting the column on create. Backend was failing to compile with 8 TS
errors. Fixed by:

- **New file:** `backend/src/lib/slugify.ts` — `slugify()` and
  `slugifyOr()` helpers. NFKD diacritic strip, lowercase, replace
  non-alphanumerics with dashes, collapse runs.
- Updated 5 service create() methods (ingredients, sub-recipes, meals,
  tags, and two in `import-data.ts`) to derive and pass a unique slug.
- `slug` uniqueness checks live as `unique{Ingredient,SubRecipe,Meal,Tag}Slug`
  private helpers that loop with `-2`, `-3`, etc. suffixes on collision.

Not really part of the "diet plan" mission — just incidental cleanup that
was blocking the backend from compiling so I could test everything else.

### 10. Schema bonus: `MealRecipe.net_weight_kg` removal proposal (not shipped)

Grep showed `net_weight_kg` is an orphan column — 9 references total, none
load-bearing (not in the cost engine, reports, label printing, or the
create form). `final_yield_weight` is the real weight field with 16
references spread across schema/DTO/service/frontend/exports.

Documented in the ADR as a "bundled cleanup" proposal but NOT actually
removed in this session — would have required another schema migration
and there was enough going on. Gurleen can approve/reject via the ADR.

---

## Git commits I authored (now on `conner/universal-brand-folder`)

Merged via **PR #10** (`89c3502 Merge pull request #10 from
betterday-foodco/conner/2026-04-08-meal-edit-menu-cats-refactor`):

| Commit | Summary |
|---|---|
| `c7b2dec` | `feat(meals/edit): diet-plan toggle + menu-cats category + conditional variant picker` |
| `df48543` | `feat(meals/new): rebuild create form around Tier 1 e-commerce essentials` |

The `972c1f2 feat(coupons): add DOTW scheduler mockup` commit was also
sandwiched between these two on the feature branch due to an earlier
contamination incident, but it's the coupons chat's work — not mine.

---

## Neon database changes (on `conner-local-dev` branch only — production untouched)

Applied to Neon project `rapid-lake-47793035`, branch `br-little-hall-aeffmfdm`.

| Operation | Rows | Notes |
|---|---|---|
| DELETE 5 SPRWT-legacy Bulk Prep/Sauce meals | 5 MealRecipe + 10 MealComponent cascades | Kitchen intermediates wrongly stored as dishes |
| ADD COLUMN `MealRecipe.diet_plan_id` (nullable) | 1 schema change | Migration `20260409025946` |
| UPDATE `diet_plan_id` from CSV cross-reference | 159 rows | 88 Omnivore + 71 Plant-Based |
| UPDATE `linked_meal_id` for meat→plant pairs | 47 rows | Unidirectional, meat-side only |
| UPDATE `linked_meal_id = NULL` on plant-based dishes | ~2-3 rows | Cleanup of legacy bidirectional writes |
| ALTER COLUMN `diet_plan_id` NOT NULL | 1 schema change | Migration `20260409032836` |
| UPDATE `category = 'Entree'` WHERE `pricing_override IN (16.99, 15.99)` | 142 rows | Bulk rename of Meat+Vegan to Entree |
| UPDATE `SystemTag` rename `Snack` → `Snacks` | 1 row | Tag + slug both updated |

**Final state on the Neon branch:**
- 159 MealRecipe rows, 0 nulls in `diet_plan_id`
- 3 category values: Entree (142), Breakfast (10), Snacks (7) — all match valid menu-cats tags
- 47 meat→plant variant links, all one-directional

---

## Documents created / updated

### Canonical docs (meant to be committed)

| Path | Type | Status |
|---|---|---|
| `conner/data-model/decisions/2026-04-08-mandatory-diet-plan-on-dishes.md` | ADR | Created — Proposed, pending Gurleen's review |
| `conner/data-model/flows/meal-variants.md` | Flow doc | Created — captures the two-axes model, N-to-1 reasoning, Vegan Alfredo example |

### Scratch / ephemeral docs (untracked by design)

| Path | Type | Status |
|---|---|---|
| `conner/MULTI-CHAT-STATUS.md` | Cross-chat incident tracker | Untracked. Captures 5 contamination incidents with recovery notes. Includes verified merge-conflict verdict for the 4 files that diverged between meal-edit and coupons branches (all resolve "take meal-edit"). |
| `conner/session-summary-2026-04-09-meal-edit-chat.md` | This file | Untracked. Retrospective of this chat's work. |

### Memory files (automatic context for future chats)

Written to `/Users/us/.claude/projects/-Users-us-Downloads-culinary-ops/memory/`:

- `user_conner.md` — Conner's profile and collaboration preferences
- `project_html_first_workflow.md` — the HTML-first + data-model co-evolution workflow
- `project_two_db_split.md` — culinary vs commerce DB architecture
- `project_sprwt_legacy_meals.md` — why Bulk Prep/Sauce rows existed
- `project_diet_plan_rule.md` — the mandatory diet_plan_id rule
- `reference_data_model.md` — entities.md is source of truth
- `reference_brand_tokens.md` — brand/tokens.css is source of truth

---

## Multi-chat contamination incidents and recoveries

The shared-working-tree problem was the dominant pain point of the
session. Documented in full in `conner/MULTI-CHAT-STATUS.md`. Summary:

| # | Incident | Recovery |
|---|---|---|
| 1 | DOTW scheduler commit from coupons chat leaked onto meal-edit branch | Coupons chat cherry-picked it to their own branch; duplicate left on meal-edit branch was deduped by git at PR #10 merge time |
| 2 | New-meal-form commit landed on commerce-customers branch instead of meal-edit (working tree `HEAD` was swapped by a parallel chat at commit time) | Meal-edit chat cherry-picked `f0796bd` → `df48543` onto the correct branch. Commerce-customers chat later cleaned up their branch before pushing. |
| 3 | Working tree swapped to coupons branch while the meal-edit dev server was running — user saw the old skeleton form in the browser | Meal-edit chat ran `git checkout conner/2026-04-08-meal-edit-menu-cats-refactor` to put files back on disk |
| 4 | SPRWT ingredient work was mislabeled as coupons-chat scope in earlier status-file drafts; turned out to be the client-website-followup chat's work | Client-website-followup chat committed `a7e7d74` on its correct branch; status file updated |
| 5 | Second working-tree swap to the coupons branch; user noticed the meal-edit page "broke again"; diagnostic discovered a partial-snapshot divergence on 4 files | Meal-edit chat ran `git checkout` recovery, then did a file-by-file diff audit confirming the divergence was directional (coupons = older snapshot, meal-edit = newer version) with zero coupons-specific work that would be lost on merge. Resolution verdict is "take meal-edit for all 4 divergent files." Documented in the MULTI-CHAT-STATUS.md PR-reviewer note. |

**Durable fix:** the worktrees-per-chat setup was codified in
`conner/README.md` (commit `214849d docs(readme): switch multi-chat
workflow to git worktrees`). Future chats should each have their own
worktree so they never share `.git/HEAD`.

---

## Bug fixes shipped

| Bug | Where | Fix |
|---|---|---|
| Menu builder pair modal silent-fail (3 compounding bugs) | `frontend/app/(dashboard)/menu-builder/page.tsx:968-975` | Swapped raw `fetch()` for `api.linkMealVariant()`, added loading state |
| Snacks/Snack singular/plural mismatch | `SystemTag` row on Neon branch | Renamed tag from `Snack` to `Snacks` |
| Backend 8 TS compile errors from `slug` column | 5 service files + 1 DTO + import script | New slugify helper + 5 uniqueSlug helpers |
| New meal create form 400'd every submit after `diet_plan_id` NOT NULL | `meals/new/page.tsx` + backend DTO + service | Tier 1 rewrite + optional `name` field + auto-mirror |
| `linkVariant` silently corrupted N-to-1 pairings | `meals.service.ts` | Rewrote to unidirectional meat-side-only |
| 149 meals showing orphan category warnings in the dropdown | Data on Neon branch | Bulk backfill to Entree via pricing_override cross-reference |

---

## What's still pending / deferred

Things that came up during the session but weren't finished. Mostly
small, none blocking PR #10.

| Item | Lane | Status |
|---|---|---|
| Menu builder diet inference: replace `cat.includes('vegan')` with `diet_plan_id === PLANT_BASED_ID` | Frontend | Flagged, not touched. Works by accident today. |
| Make `getSuggestedVariants` backend endpoint filter to opposite diet plan | Backend | Flagged, not touched. The frontend manual search already filters correctly. |
| Add Photo + Tagline to the Tier 1 create form as Tier 2 | Frontend | Explicit "deferred" in the new meal page decision. Everything else goes on the edit page. |
| Add public `/api/public/menu-categories` endpoint for the future client-website menu tabs | Backend | Noted, not built. `/api/tags` currently requires JWT auth. |
| Drop `MealRecipe.net_weight_kg` column (9 orphan references, no load-bearing use) | Schema | Documented in ADR as bundled cleanup; migration not run. |
| Protected SystemTag rows — tags service should refuse to delete the two diet-plan rows | Backend | Noted in the ADR as an open question. |
| `Customer.diet_plan_id` in `schema.commerce.prisma` for persistent preference | Commerce schema | Noted in the ADR; belongs in a separate commerce-side commit. |
| Verify the other 4 unverified Section 15 checklist items (peanut allergen, portion score, pinned columns, column lock) | Menu-builder gap analysis | Started but interrupted. Results would go in the gap-verification doc. |

---

## Running local state at the end of the session

**Running dev servers** (background tasks, may still be alive or may have
died when the chat ended):

| Service | Port | Task ID | Status |
|---|---|---|---|
| NestJS backend (watch mode) | 3001 | `b67pc0j5z` | Last known: healthy, `200` on `/api/health` |
| Next.js frontend (dev mode) | 3000 | `bl8l7zuzw` | Last known: healthy, serving from `conner/universal-brand-folder` |

**Neon branch:** `conner-local-dev` (`br-little-hall-aeffmfdm`) on project
`rapid-lake-47793035`. All data changes were applied here. Production
untouched. Branch can be deleted when Conner is done with it.

**Untracked files in the shared working tree (safe to delete, or leave alone):**

- `backend/.env.backup-before-neon-branch` — contains real Neon credentials;
  DELETE when done with the Neon branch
- `conner/MULTI-CHAT-STATUS.md` — incident tracker; keep as reference
- `conner/session-summary-2026-04-09-meal-edit-chat.md` — this file
- `conner/deferred-decisions.md` — another chat's work
- `conner/data-model/exports/sprwt-*` — client-website-followup chat's
  SPRWT work, now committed on that chat's branch; the working-tree copies
  can be removed when convenient

---

## Where to pick up

If you're a future chat or a future-Conner opening this session summary,
here's the concrete "what to do next":

1. **Verify PR #10 merged correctly** in the live app — open
   `/meals/{some-id}` and confirm the Diet Plan toggle is visible in the
   left aside; open `/meals/new` and confirm the Tier 1 form (no components
   editor, Diet Plan toggle, menu-cats category dropdown).
2. **Send the diet-plan ADR to Gurleen for review.** It's at
   `conner/data-model/decisions/2026-04-08-mandatory-diet-plan-on-dishes.md`.
   Status is still "Proposed". Her signoff is what promotes it from
   proposal to accepted.
3. **Decide the remaining deferred items** in the table above. None are
   urgent but all are small and worth closing out before the customer-
   facing website pages start consuming meal data.
4. **Run the production diet_plan backfill** when ready. The Neon branch
   has all 159 meals classified; the same SQL can run against production
   after Gurleen approves the ADR. This is the big unlock for the customer-
   facing website.
5. **Delete the Neon branch** `conner-local-dev` and the
   `backend/.env.backup-before-neon-branch` file when you're done. The
   branch only exists to hold this chat's dev-data and will otherwise
   stay live and billable indefinitely.

---

**Chat ended with PR #10 merged, all code working, dev servers running,
and the multi-chat incident file documenting every cross-branch drama
for the next chat to read before making any destructive moves.**
