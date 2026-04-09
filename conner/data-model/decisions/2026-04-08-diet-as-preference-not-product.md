# ADR: Diet is a customer preference, not a rich subscription product

**Date:** 2026-04-08
**Status:** Accepted
**Deciders:** Conner
**Related:**
- `decisions/2026-04-08-mandatory-diet-plan-on-dishes.md` — tagging meals with a diet plan (still applies)
- `flows/onboarding.md` — the diet selector page that implements this decision

---

## Context

During the diet-selector page work on 2026-04-08, we briefly went down the
path of modeling BetterDay's diet picker after **Happy Meal Prep's "Meal
Plans" module** — a rich admin-configured product entity with 7 tabs:

1. **Basic Info** — title, slug, short/full description, highlights, plan icon, stores
2. **Selection** — min/max products, included/excluded categories, step-by-step flow
3. **Pricing** — per-plan base prices, per-meal-count overrides
4. **Discounts** — per-plan stacking cart-size tiers (4+→5%, 5+→8%, 7+→11%, …)
5. **Additions** — per-plan add-on products and categories
6. **Subscriptions** — per-plan cadence options, renewal behaviour, skip/pause rules
7. **Display** — per-plan card order, visibility, featured flag

HMP's admin screenshots are in `/Happy Meal Admin Photos/` (6 PDFs).

The BetterDay website has exactly two options — "Meat & Plants" and
"Plants Only" — so the question was: **do we need HMP's full structural
model for two options?**

---

## Options considered

### Option A — Rich meal plan entity (HMP model)

Create a full `meal_plan` entity in the commerce DB with its own nested
`meal_plan_discount_rule` rows, per-plan add-on config, per-plan
subscription settings. Build an admin UI with 7 tabs per plan. Let
marketing spin up new plans anytime (Keto plan, Athlete plan, Kids plan,
etc.) without engineering involvement.

- **Pro:** matches HMP. Future-proof for many plans.
- **Pro:** marketing can create new plans without code changes.
- **Pro:** per-plan discount tiers give marketing more A/B-testable levers.
- **Con:** BetterDay has **two options**, not twenty. This is YAGNI.
- **Con:** the commerce DB schema grows by ~30 fields + a child table just to
  support two rows.
- **Con:** requires Gurleen to build a 7-tab admin UI, which is weeks of work.
- **Con:** blocks the diet-selector page from shipping cleanly — it becomes
  entangled with backend/admin work that doesn't yet exist.
- **Con:** duplicates concepts BetterDay already has. `savings_tier` is
  already a global tier ladder on subscription. `category` already exists
  on `MealRecipe`. Everything needed is already in place.

### Option B — Diet as a simple customer preference (chosen)

Diet is a single enum-ish field on `customer` (and/or `subscription`).
Values: `'meat-and-plants'` or `'plants-only'`. The diet selector page just
sets this field (today: URL param + localStorage, eventually: API call).
Menu browse filters meals by category matching the customer's preference.

Subscription-level settings stay **universal** — one global config for the
whole system, administered once:

- **Discount tiers** — one ladder (`subscription.savings_tier`), applied to
  every subscription regardless of diet. Already exists and works.
- **Add-on / extras categories** — one global list of what categories can
  appear as add-ons, configured in `SystemConfig` or a simple admin form.
  Not per-plan.
- **Subscription cadences** — global (weekly/biweekly/monthly), not per-plan.
- **Skip/pause rules** — global, not per-plan.

- **Pro:** matches BetterDay's actual scope (two choices, universal rules).
- **Pro:** ships immediately — no new schema, no new admin UI, no new backend.
- **Pro:** maps cleanly onto the existing `subscription.savings_tier`
  ladder and `MealRecipe.category` freeform strings that are already there.
- **Pro:** the diet-selector HTML page can be built as a two-card
  prototype with hardcoded content and still work indefinitely. When the
  real backend lands, all that changes is where the customer record gets
  written.
- **Pro:** avoids over-engineering a future we don't have. If we ever
  launch a third plan ("Keto", "Athlete"), we revisit the decision then.
- **Con:** if we ever need per-plan discount tiers for marketing reasons,
  that's a future migration. Accepted risk.
- **Con:** doesn't match HMP's model exactly. We're not copying HMP — we're
  borrowing the parts that fit.

---

## Decision

**Option B. Diet is a customer preference; subscription settings are
universal.**

Specifics:

1. **`customer.diet_preference`** (new field, added to `entities.md`) —
   enum: `'meat-and-plants'` | `'plants-only'`. Nullable until the user
   picks one (guest browsing is allowed). Persists across all of the
   customer's subscriptions.
2. **No `meal_plan` entity.** The branch of work that added it to
   `entities.md` on 2026-04-08 is rolled back in the same commit as this ADR.
3. **`subscription.savings_tier` stays global.** One tier ladder for the
   whole system (4→5%, 5→8%, 7→11%, 8→free delivery, 9→14%, 11→17%,
   13→20%), exactly as already documented in the subscription entity notes.
4. **Add-on/extras categories stay global.** When we eventually build cart
   + checkout, add-on categories live in `SystemConfig` (key/value) or in a
   simple dedicated admin form, not as a per-plan configuration.
5. **Menu filtering** still needs a meal-to-diet link — that's what
   `decisions/2026-04-08-mandatory-diet-plan-on-dishes.md` already handles
   (every `MealRecipe` gets a required FK to a `SystemTag` where
   `type = 'diets'`). The diet selector and that ADR work together: the
   selector picks which diet tag the customer wants; the mandatory-FK ADR
   ensures every meal IS tagged with one of those diets.

---

## What "admin subscription settings" looks like

Per the rollback, the mega-hub admin does NOT need a per-plan editor.
Instead, it needs **one "Subscription Settings" screen** with global config:

| Setting | Current source | Where it goes in the admin |
|---|---|---|
| Discount tier ladder | Hardcoded 4→5%, 5→8%, … | One editable table in Subscription Settings |
| Free delivery threshold | Hardcoded at 8 meals | One numeric input |
| Cadence options | Enum on subscription | Checkbox list (weekly / biweekly / monthly) |
| Skip window | Hardcoded | One date-range or days-out input |
| Pause presets | Hardcoded | Editable list |
| Add-on categories | Not yet implemented | Multi-select pointing at SystemTag rows |
| Cutoff day/time | Hardcoded to Thursday | Day + time picker |

Everything above applies site-wide. No "duplicate this for Plan B" required.

---

## Consequences

### Good
- Diet selector page ships today with no backend dependency.
- `entities.md` stays lean — just one new field on `customer`.
- No admin UI for meal plans needed; Gurleen's territory stays untouched.
- BetterDay's operational model (one discount ladder, one set of rules)
  is preserved and documented.
- The existing `mandatory-diet-plan-on-dishes` ADR becomes the only
  meal-tagging mechanism — no duplicate concept competing with it.

### Costs
- If BetterDay ever needs per-plan discounts (e.g. "Plants Only gets 2%
  extra off as a launch promo"), that's a future migration. It's a
  reasonable risk given the two-option scope today.
- Admin flexibility for marketing is slightly reduced — they can't spin up
  a new plan without engineering. Again: acceptable for two options.

### Explicitly rejected
- We will NOT build a 7-tab "Edit Meal Plan" admin form.
- We will NOT create a `meal_plan` or `meal_plan_discount_rule` table in
  the commerce schema.
- We will NOT add `subscription.meal_plan_id` (the field was briefly added
  during the 2026-04-08 branch and is rolled back in the same commit as
  this ADR).

---

## What this means for the diet selector page

The page (`conner/client-website/onboarding/index.html`) stays essentially
what it already was — the clean port of `conner/app/diet-selector.html`:

- **Headline:** "Choose your diet" (reverted from "Choose your meal plan")
- **Two cards:** Meat & Plants, Plants Only
- **Outcome on click:** redirect to `/menu/?diet=<slug>` with the picked
  slug as a URL param; the eventual menu page reads it and filters meals
  accordingly

No functional change. Just framing — the page is UX for setting
`customer.diet_preference`, not for choosing a commerce product.

---

## Lesson for future ADRs

When pattern-matching off another product's admin UI (Happy Meal Prep in
this case), **check whether the complexity matches your scope**. HMP's Meal
Plans module makes sense for a multi-brand SaaS serving dozens of meal prep
companies that each need different plan structures. BetterDay is one brand
with two plans. Borrow the ideas that fit; leave the ones that don't.

Saved in this ADR so we don't re-discover it in six weeks.
