/**
 * BetterDay subscription pricing config — single source of truth
 * ──────────────────────────────────────────────────────────────
 * This file defines the constants that drive subscription discounts,
 * delivery thresholds, taxes, and reward-points conversion across
 * the customer-facing site (menu page + checkout page, today; plus
 * future pages as they're built).
 *
 * Both `conner/client-website/menu/index.html` and `conner/client-website/checkout.html`
 * load this file via a <script src="…/subscription-config.js" defer></script>
 * tag BEFORE their main <script> blocks. The constants below land in
 * the global scope so the consuming pages reference them by name
 * (PERK_TIERS, FREE_DELIVERY_MEALS, etc.) without needing imports.
 *
 * WHY ONE FILE
 * ────────────
 * Before this file existed, the menu page and the subscriber-hub
 * checkout prototype each declared their own copy of PERK_TIERS,
 * FREE_DELIVERY_MEALS, DELIVERY_FEE — and they had drifted into two
 * different pricing models (the menu page synthesized a fake
 * `retail_price` field; the checkout treated `meal.price` as the
 * already-discounted subscriber price). The corrected model is:
 *
 *   - There is ONE price column on the meal: `meal.price`. That's the
 *     regular / full retail price every customer sees on the card.
 *   - One-time customers pay `meal.price` exactly.
 *   - Subscribers pay `meal.price × (1 − tierPct / 100)`, where the
 *     tier percentage is looked up from PERK_TIERS using the customer's
 *     total cart quantity. More meals → higher tier → bigger discount.
 *
 * Centralizing the table here makes it impossible for the menu page
 * and the checkout page to disagree about what a subscriber pays.
 *
 * FUTURE: ADMIN-EDITABLE
 * ──────────────────────
 * The plan is to move these values into the existing `SystemConfig`
 * key-value table (backend/prisma/schema.prisma:511) and serve them
 * via the same `/api/system-config/public` endpoint that already
 * delivers `public.contact.email`, `public.delivery.areas`, etc.
 * Once that admin UI exists at frontend/app/(dashboard)/settings/subscription-plans/
 * (Gurleen's lane), this file becomes a thin shim that fetches the
 * live config and overrides the defaults below — the constants act
 * as a fallback for offline / first-load / fetch-failure cases.
 *
 * Tracking: see `conner/deferred-decisions.md` →  "Implementation TODOs"
 * → "Subscription pricing settings — admin dashboard UI."
 *
 * EDITING
 * ───────
 * If you're editing the tier table in this file, also update the
 * MILESTONES array in menu/index.html — it duplicates a few of the
 * tier values for the rewards-bar UI labels.
 */

/* ─── Subscriber discount tiers ─────────────────────────────────────
   Quantity-based tier table. PERK_TIERS[i] means: when the cart has
   `meals` or more items, the subscriber discount is `pct` percent off
   the regular subtotal. Lookup walks the array from the highest tier
   downward and picks the first one the customer qualifies for. Below
   the lowest threshold (4 meals), no discount applies.

   Format: { meals: minimum cart quantity, pct: discount percentage }
*/
const PERK_TIERS = [
  { meals: 4,  pct: 5  },
  { meals: 5,  pct: 8  },
  { meals: 7,  pct: 11 },
  { meals: 9,  pct: 14 },
  { meals: 11, pct: 17 },
  { meals: 13, pct: 20 }
];

/* ─── Delivery + tax ──────────────────────────────────────────────── */
const FREE_DELIVERY_MEALS = 8;     // subscribers with 8+ meals get free delivery
const DELIVERY_FEE        = 7.99;  // standard delivery fee, CAD
const GST_RATE            = 0.05;  // 5% Canadian GST (Alberta + most provinces)

/* ─── Reward points (loyalty) ─────────────────────────────────────── */
// Conversion rate: each redeemed point is worth this many dollars.
// Despite the name, this is NOT "points earned per dollar" — it's the
// dollar value of one point. The earn rate is hardcoded at 0.7 pts per
// $1 of subtotal in the checkout (~2.1% effective return).
// Renamed from the original prototype constant for clarity, but kept
// the legacy name as an alias so any other consumer keeps working.
const DOLLARS_PER_POINT = 0.03;
const POINTS_PER_DOLLAR = DOLLARS_PER_POINT;  // legacy alias — do not remove

/* ─── Helper: tier-discount lookup for a given cart quantity ──────── */
// Returns the percentage (0-20+) for the highest tier the cart qualifies
// for. Below the lowest threshold, returns 0. Both menu and checkout
// rely on this helper so the calculation is identical in both places.
function lookupSubscriberDiscountPct(totalMeals) {
  for (let i = PERK_TIERS.length - 1; i >= 0; i--) {
    if (totalMeals >= PERK_TIERS[i].meals) return PERK_TIERS[i].pct;
  }
  return 0;
}
