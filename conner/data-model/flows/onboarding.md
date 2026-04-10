# Flow: Onboarding

The entry path for a first-time visitor who clicks "Start your first order" on
the homepage. Two linear steps today, room to grow as the funnel is refined.

**Status:** 🚧 In progress. Diet selector page landed 2026-04-08. Subsequent
steps (address capture, plan size, delivery window) not yet built.

---

## Current steps

### Step 1 — Diet preference

**Page:** `conner/client-website/onboarding/index.html`
**Source of truth for design:** `conner/app/diet-selector.html` (reference only — the new page is a clean port using `brand/tokens.css` + shared shell)
**Decision record:** `decisions/2026-04-08-diet-as-preference-not-product.md` — captures the choice to keep diet as a simple customer preference rather than a rich subscription product.

> **Framing:** this page sets a **preference on the customer profile**. It
> is *not* a subscription product picker. Every customer subscribes to one
> universal BetterDay subscription with global discount tiers, global add-on
> rules, and global cadence options — the diet preference just determines
> which meals they see in their weekly menu.

The user lands here from any "Order now" / "Start your first order" CTA on a
marketing page. Two cards side-by-side (stacked vertically on mobile), one
per diet preference value:

| Option | Short description | Allowed meal categories | Card image |
|---|---|---|---|
| **Meat & Plants** (slug `meat-and-plants`) | "Mixed protein options" — mix of omnivore + plant-based meals in any ratio. Default for mixed-diet households. | `Vegan`, `Meat` | `/brand/photos/diet-meat-and-plants.jpg` |
| **Plants Only** (slug `plants-only`) | "100% plant-based" — no meat or dairy dishes ever appear in this customer's menu. Includes a 🛡️ "100% plant-based menu, always" safety badge on the card. | `Vegan` only | `/brand/photos/diet-plants-only.jpg` |

**Outcome:** clicking a card triggers a brief loading overlay and redirects to:

```
/conner/client-website/menu/?diet=<slug>
```

(Target page does not yet exist. Until it does, the redirect lands on a 404;
this is acceptable during staged development. When `menu/index.html` ships,
the link will start working automatically.)

---

### What the subscription looks like — universal, not per-diet

BetterDay has **one subscription product**, not one per diet. Global settings
(admin-configurable but not per-diet) include:

- **Discount tier ladder** — one table (4→5%, 5→8%, 7→11%, 8→free delivery, 9→14%, 11→17%, 13→20%). Already lives on `subscription.savings_tier`. See the `subscription` entity in `entities.md`.
- **Free-delivery threshold** — 8 meals (hardcoded today, eventually admin-editable).
- **Cadence options** — weekly / biweekly / monthly. Not diet-specific.
- **Add-on / extras categories** — whichever categories admin decides are eligible as add-ons. One list, site-wide. Lives in `SystemConfig` or a dedicated admin form once built.
- **Skip / pause rules** — global cutoff day/time and pause presets.

These are all documented in `decisions/2026-04-08-diet-as-preference-not-product.md`
(the decision that rejected Happy Meal Prep's per-plan structural model).

### Menu filtering (where the diet preference actually matters)

The customer's `diet_preference` is read on every menu browse request.
The flow is simple:

1. Read `customer.diet_preference` (or the `?diet=` URL param for anonymous
   guests who haven't signed up yet)
2. Query `MealRecipe` rows where the meal's diet tag matches — see ADR
   `2026-04-08-mandatory-diet-plan-on-dishes.md` for how meals are tagged.
   Summary: `meat-and-plants` → `category IN ('Vegan', 'Meat')`, `plants-only`
   → `category = 'Vegan'`.
3. Return the filtered menu.

No cross-database joins are involved — the meal-side filtering happens entirely
in the culinary DB using existing `MealRecipe.category` data. The commerce
side only stores the customer's preference value.

### Step 2+ — (planned)

Future onboarding steps, tentative order:

1. **Address / delivery area check** — confirm the customer is inside the
   Calgary delivery zone. Early rejection if not (or "notify me when you serve
   my area" capture).
2. **Plan size picker** — 4, 6, 8, 10, 12 meals. Shows per-meal price drop
   as plan size increases.
3. **Delivery day selection** — if multi-day delivery ever exists; today this
   is always Sunday so the step is skipped.
4. **First menu selection** — browse the week's menu filtered to the chosen
   diet plan.
5. **Cart review + checkout** — address, payment, Apple Pay / card.
6. **Account creation** — fired AFTER checkout (anonymous-friendly flow),
   see `decisions/2026-04-08-apple-pay-and-accounts.md`.

---

## Data used by Step 1

| Field | Type | Origin | Notes |
|---|---|---|---|
| `customer.diet_preference` | enum (`meat-and-plants` \| `plants-only`) | user click on a card | Single source of truth. Picked value lives as a URL query param `?diet=<slug>` while the flow is anonymous; once the customer signs up, it persists on `customer.diet_preference`. See the entity definition in `entities.md`. |

Both card options are currently **hardcoded in the HTML** — there's only two,
they don't change, and there's no point building an API for two rows. If we
ever need more than two diets (unlikely per the decision ADR), revisit.

### Data NOT yet introduced (but needed later)

Downstream onboarding steps will need:

- `customer.first_name`, `email` — captured at account creation (post-checkout)
- `address.*` — full address capture for delivery zone check
- `subscription.default_meal_count` — how many meals per week, already exists
- `subscription.cadence` — weekly / biweekly / monthly, already exists

None of the downstream steps require per-diet configuration. The global
subscription settings (discount tiers, add-on categories, cadences, skip
rules) apply identically regardless of diet preference.

---

## Anonymous-to-account transition

Onboarding starts fully anonymous — no signup required just to pick a diet or
browse meals. The first point where an identity is captured is **checkout**,
and even then, an explicit account with a password is optional (Apple Pay can
create a minimal account on the customer's behalf).

This is the core principle from ADR `2026-04-08-apple-pay-and-accounts.md`:
friction goes at the end, not the beginning. The diet selector therefore
does not need auth state, does not need to call any API, and works with
anonymous traffic.

---

## Edge cases to test (mock-data bias warning)

Per the HTML-first workflow ADR — mock data hides edge cases. Things to watch
when the real backend wires up:

- **Returning user lands on the diet selector again.** Should we preselect
  their previous choice, or treat it as a fresh pick? Product decision, not
  design — leave it unopinionated for now, default to "fresh pick each time".
- **User picks Plants Only, then tries to add a meat meal in the menu page.**
  Hard block, soft nudge, or silent allow? The diet ADR implies this should
  be a hard filter (meat meals don't appear at all for a Plants Only user).
- **Mobile deeplink from Instagram / Facebook.** Users arriving from social
  ads should land directly on the diet selector if they clicked an "Order
  now" ad, or on a specific meal page if they clicked a meal ad. Deep links
  need to preserve the selected diet through to the menu.
- **Accessibility:** the current cards are `<div onclick>`, not `<button>` or
  `<a>`. Keyboard users can't activate them. **Fix in a follow-up pass** —
  the clean port kept the original structure but this is a real bug.

---

## Questions for Gurleen (when she reviews)

1. **Where should `diet_preference` map on the meal side?** The existing
   ADR `2026-04-08-mandatory-diet-plan-on-dishes.md` proposes tagging every
   `MealRecipe` with a required FK to a `SystemTag` where `type = 'diets'`
   (`Omnivore` or `Plant-Based`). The diet selector uses friendlier slugs
   (`meat-and-plants`, `plants-only`). We need to decide: (a) store the
   customer's preference as the SystemTag slug directly (`omnivore` /
   `plant-based`) and translate on the UI layer, or (b) store the
   friendly slug (`meat-and-plants` / `plants-only`) and map at the query
   layer when filtering meals. Either works; Conner leans (b) for URL
   readability.
2. **Anonymous diet pick — persist or not?** When a user picks a diet but
   doesn't check out, should we record the pick server-side for funnel
   analytics? Cheaper to keep client-side until account creation, but we
   lose drop-off insight.
3. **Where do universal subscription settings live in the admin UI?**
   The decision ADR (`2026-04-08-diet-as-preference-not-product.md`) calls
   for one global "Subscription Settings" screen rather than per-plan
   editors — containing discount tier ladder, free delivery threshold,
   cadence options, add-on categories, skip/pause rules, cutoff timing.
   Gurleen's dashboard doesn't have this section yet; who builds it?

---

## Related

- **ADR:** `decisions/2026-04-08-diet-as-preference-not-product.md` — the
  decision to keep diet as a customer preference rather than a rich
  subscription product entity. Contains the Happy Meal Prep comparison and
  the reasons for rejecting that structural approach.
- **ADR:** `decisions/2026-04-08-mandatory-diet-plan-on-dishes.md` — the
  data-level case for making diet_plan a required FK on every meal
- **ADR:** `decisions/2026-04-08-apple-pay-and-accounts.md` — why onboarding
  doesn't require signup upfront
- **ADR:** `decisions/2026-04-08-html-first-workflow.md` — the methodology
  this flow doc participates in
- **Source prototype:** `conner/app/diet-selector.html` — original design,
  kept as reference
- **Rejected reference:** `/Happy Meal Admin Photos/` — 6 PDFs of Happy Meal
  Prep's "Meal Plans" module admin. We looked at this pattern and
  explicitly chose not to copy it; see the decision ADR.
