# Deferred Decisions & Edge Cases

A running list of things that came up in chats but were consciously deferred — edge cases, pending design decisions, implementation TODOs, and future ideas. Every chat should **scan this file on startup** to see what's outstanding that might be relevant to the work it's about to do.

**Format:** each entry is dated, titled, and carries 1–2 lines of context. Add new entries at the top of the relevant section. When an item is resolved, either delete it or move it to the bottom of the section with a ✅ prefix.

**Rule:** if you're resolving an item here, double-check the original chat context (commit history + the discussion that led to the deferral) before acting on it — these are snapshots in time and may be out of date.

---

## 🔮 Edge cases to handle later

- [2026-04-10] **DOTW: admin edits delivery_week_sunday on a used coupon → data corruption**
  If admin moves a DOTW from April 13 to May 4 after 50 people used it, all
  historical CustomerCoupon records now link to "May 4" — April 13 history is
  silently rewritten. **Lock `delivery_week_sunday` after first use.** Add to
  `CouponAdminService.update()`: if `uses_count > 0` and field is changing,
  throw `BadRequestException`. Admin must create a new coupon instead.

- [2026-04-10] **DOTW targets a product removed from that week's menu**
  Admin schedules "Chicken Bowl BOGO" for May 4, then kitchen pulls Chicken
  Bowl. Coupon is valid but useless — nobody can add the product. No system
  breakage, but confusing. Fix in admin UI: show a warning when DOTW product
  targets don't overlap with the week's published menu.

- [2026-04-10] **Cross-week deal confusion in pre-ordering**
  Customer browsing April 13 + April 20 menus sees cookies on DOTW for
  April 13. Adds cookies to both weeks, expects the deal on both. April 20
  order has cookies at full price. Fix in UX: per-week deal badge on the
  menu page + clear "this deal applies to April 13 delivery only" callout.

- [2026-04-09] **Timezone issue in DOTW coupon week matching**
  `CouponValidationService.sameDateDay()` (line 743) compares delivery
  weeks using UTC. A Vancouver customer at 11pm Monday (Tuesday UTC) could
  get rejected from a Monday deal. Fix before DOTW coupons go live: compare
  in business timezone (Mountain Time) or the customer's timezone.

- [2026-04-09] **Brute-force coupon code guessing — no rate limiting**
  The validate endpoint can be called repeatedly with no throttle. Someone
  could script through `AAAA`, `AAAB`, etc. to find valid codes. Add rate
  limiting (max 5 attempts per customer per minute) and optionally log
  failed attempts for fraud detection. Fix before public launch if coupon
  codes are short or predictable.

- [2026-04-08] **Meal removed from menu after customer has it in a pre-order cart**
  Admin drops cookies from the April 20 menu but a subscriber already has cookies in their April 20 draft cart. Likely: show a warning in cart, silently drop at cutoff, optionally suggest an alternative. Needs UI + cart validation design. Not blocking Migration #3 coupon work.

- [2026-04-08] **Coupon deleted while customer has it applied to a draft cart**
  Related to above. If a coupon is removed from the Coupon table while a subscriber's pre-order cart has it applied, the draft references a non-existent coupon. Cart snapshot fields (Migration #4 scope) will make this moot because the discount is already frozen on the line item.

- [2026-04-08] **Multi-delivery-week coupon early termination**
  Admin wants to end a scheduled DOTW early (before its `expires_at`). What happens to draft carts that already have it applied? Per the price-ceiling rule, they keep their discount. But the admin UX needs to make this clear before they hit "delete."

---

## 🎯 Design decisions pending

- [2026-04-10] **Subscription cart coupon lifecycle — validate at confirmation, best-effort at charge**
  Decided architecture for coupons on subscription carts (Mon pick → Thu charge):
  1. **Draft** — light validation when coupon is applied (is it real, active?)
  2. **Confirmed** — full re-validation when customer confirms selections.
     If coupon fails, customer sees why and can fix it while still on page.
     This is the key checkpoint — customer is actively paying attention.
  3. **Charged** — Thursday EOD auto-charge re-validates inside the payment
     transaction (TOCTOU). If coupon fails here, order processes at full price.
  **Three-lane validation model (decided 2026-04-10):**
  Different coupon types validate on different axes:
  1. **Time-window coupons** (starts_at / expires_at only, no delivery_week):
     If *either* confirmation or charge timestamp falls in the valid window,
     honor the coupon. Confirmation timestamp is primary source of truth.
  2. **DOTW coupons** (delivery_week_sunday set): Subscriber-only
     (`subscription_restriction: active_subscribers_only` enforced by
     default). Validate on delivery week matching — does the order's
     delivery week match the coupon's `delivery_week_sunday`? The existing
     validator Rule 10 already works this way. DOTW visibility window is
     auto-set by the scheduler: `starts_at` = Monday of delivery week,
     `expires_at` = Thursday cutoff. One week at a time — never visible
     in advance. This is a deliberate product decision: the weekly surprise
     creates a reason to check in every Monday. Showing future weeks kills
     the excitement (Costco monthly flyer problem). If a subscriber
     pre-ordered meals before the DOTW was announced, they don't get the
     deal retroactively — Option C, don't worry about it. Worst case they
     paid full price for something they wanted anyway. Future enhancement:
     Smart Hub nudge when DOTW matches items already in a confirmed cart
     (Option A from 2026-04-10 discussion, not building now).
  **Overrides that trump everything:**
  - `is_active = false` (admin archive) kills a coupon regardless of
    timestamps or delivery week — emergency brake.
  - Cart-content rules (min_order_value, product targeting) validate against
    the actual cart at charge time (cart may change after confirmation).
  - Max-uses: honor if valid at confirmation (rare, not worth complexity).
  **DOTW auto-generated codes (decided 2026-04-10):**
  DOTW creation portal auto-builds codes from meal name + delivery date:
  `DOTW-GREEN-THAI-CURRY-20260426`. Self-documenting, unique, no admin
  guesswork. Implemented via slugify(meal_name) + date format in the DOTW
  scheduler (not yet built).
  **Failed coupon notification (decided 2026-04-10):**
  When the Thursday charge cron drops a coupon, write a notification record.
  Display in the customer's Rewards/account section as an unread alert:
  "Coupon code ___ failed to apply to your weekly plan payment due to ___.
  If you need assistance, please email hello@eatbetterday.ca." Message
  content comes from the existing error-messages catalog (`error-messages.ts`).
  Needs: `CustomerNotification` model, charge cron writes, account page reads.
  **Personal coupon grants** — separate action from coupon creation. ~10 times
  in 5 years. Simple `grantCoupon(couponId, customerId)` that creates a
  `CustomerCoupon` row with status `available`. No need to bundle into create.
  **Seam points:** `CouponApplyService.applyCoupon()` handles draft-time apply.
  `CouponApplyService.validatePreview()` handles confirmation-time check.
  Thursday charge cron (not yet built) calls the same validator one final time.

- [2026-04-10] **Revisit: CustomerCoupon as the universal coupon interaction layer**
  `CustomerCoupon` is the single table that tracks every coupon interaction
  regardless of source (clip, auto-apply, admin grant, checkout entry, streak
  reward). Confirmed 2026-04-10 that the status machine (available → applied
  → redeemed / expired / revoked) handles all flows. Revisit this concept
  after the coupon module is fully shipped to think through: (a) reporting
  queries (clip-through rate, redemption rate by source), (b) the offers
  feed query that powers the Discounts tab (clippable + personal + DOTW),
  (c) how streak/reward milestones auto-generate CustomerCoupon rows, and
  (d) whether `available` needs sub-states (e.g. `clipped` vs `granted` vs
  `earned` for analytics). No schema change needed now — just a thinking
  exercise once the dust settles.

- [2026-04-08] **DOTW scheduler access control — separate role for head chef / ops manager?**
  Should the DOTW scheduler be accessible to a restricted role (e.g. "Operations" or "Culinary") that can only touch DOTWs + menu planning, without seeing customer PII or full coupon admin? Worth resolving before the admin UI ships. Not urgent for the schema.

- [2026-04-08] **"Currently viewing" banner on future-week menus**
  Small UX nudge on the menu page when a subscriber is browsing a future week's menu: *"You're ordering for April 20 delivery. This week's deals apply to April 13 orders only."* Deferred until the menu display logic is finalized. No schema impact.

- [2026-04-08] **Retroactive DOTW grace period**
  If admin adds a DOTW after a customer has already ordered at full price, should there be a grace window where admins can re-apply the discount manually? Probably no — keep it simple. But worth naming.

---

## 🛠️ Implementation TODOs

- [2026-04-10] **Standardize skip/take pagination as a universal admin pattern**
  Gurleen's `corp-admin.service.ts` has the only pagination in the codebase
  (page/limit with parallel count query). Building the same pattern into
  coupon admin list. Once proven here, extract a shared DTO + helper so all
  future admin listing endpoints use the same shape:
  `{ data, total, page, limit }`. Candidate for a `conner/README.md` convention.

- [2026-04-09] **Customer order metrics — denormalized counters on Customer profile**
  Add 8 columns to the commerce `Customer` model: `total_orders`,
  `total_spend`, `last_order_at`, `consecutive_weeks`, `longest_streak`,
  `streak_broken_at`, `orders_this_month`, `meals_tried`. Schema columns
  are free to add; the work is wiring ~25-30 update triggers across
  order placement, cancellation, refund, and edit paths.
  **Business rules decided 2026-04-09:**
    - Minimum $25 order value to count toward milestones
    - Refunds over 80% of order value remove the count
    - Comp/free orders don't count
    - Gift orders count for the buyer (they paid)
    - Gift card payments count normally (just currency)
    - Gift recipients are NOT first-time customers (they've tasted the
      product) but get no milestone credit
  **Wire first (simple, needed now):** `total_orders`, `total_spend`,
  `last_order_at` — update on order events already being built.
  **Wire later (need cron infrastructure):** `consecutive_weeks`,
  `longest_streak`, `streak_broken_at` (weekly cron), `orders_this_month`
  (monthly reset cron), `meals_tried` (line item scanning).
  **Seam point:** `CouponValidationService.countCompletedOrders()` (line
  517) currently does a live DB query. When `Customer.total_orders` is
  wired, swap that one function from a query to a column read. The rest
  of the coupon module doesn't change.

- [2026-04-09] **Auto-computed marketing tags on Customer profile**
  Derived from the order metrics above. Tags to auto-compute:
  `vip` (spend > $2,000 or orders > 80), `at_risk` (subscriber + no
  order in 21+ days), `champion` (streak > 12 weeks), `new` (first
  order within 30 days), `lapsed` (no order in 60+ days), `high_value`
  (avg order > $100), `adventurous` (meals_tried > 50% of active menu),
  `creature_of_habit` (same 3-5 meals weekly), `gift_giver` (2+ gift
  orders), `referrer` (1+ referred customers who ordered). These update
  the existing `Customer.tags` array. Need the denormalized counters
  first + a scheduled job or event-driven recompute. Build when the
  email/notification automation system exists to act on them.

- [2026-04-09] **Missing Prisma migration for `menu_category` + `diet_plan` columns**
  These two columns on `MealRecipe` (culinary DB) were added via direct
  SQL on the `conner-local-dev` Neon branch during the diet-plan rename
  work (commit `5cca53e`). No migration file exists. Production database
  does NOT have these columns. Need to create a migration file before
  deploying to production, or the deployed app will crash trying to read
  columns that don't exist. Also: production still has `net_weight_kg`
  which dev removed — that migration file exists but hasn't been run on
  production.

- [2026-04-09] **Rename `MealRecipe.pricing_override` → `item_price`**
  The customer-facing sell price on the culinary `MealRecipe` model is
  named `pricing_override` (`backend/prisma/schema.prisma:116`), which is
  misleading — there's nothing for it to override (no auto-pricing-from-cost
  feature exists or is planned). Rename to `item_price` so the column name
  matches the meaning. **Confirmed safe by testing the SQL on a throwaway
  Neon child branch off `production` on 2026-04-09:** before/after counts
  and price stats matched exactly (164 meals, 142 priced, range $15.99–
  $16.99, avg $16.52). **Touches ~19 files:** the schema.prisma + auto-generated
  Prisma migration, `backend/src/modules/meals/{meals.service.ts,dto/meal.dto.ts}`,
  `backend/src/modules/mealprep-sync/mealprep-sync.service.ts`, 7 frontend
  admin pages under `frontend/app/(dashboard)/{meals/*,reports/cooking,dashboard}/page.tsx`
  + `frontend/app/lib/api.ts`, plus 5 backend scripts under `backend/scripts/`
  and `backend/prisma/`. **Does NOT touch the corporate `/work` flow** —
  verified by grep on `backend/src/modules/corporate/` and `frontend/app/(corporate)/`,
  zero matches. The corporate B2B program uses its own tier price config
  from `CorporateCompany.extra` JSONB and never reads `pricing_override`.
  **Lane:** majority of consumers are in Gurleen's `frontend/(dashboard)/`
  and `backend/src/modules/meals/` territory. Coordinate with her — text
  message draft is in the calculator-fix commit body on
  `conner/2026-04-09-checkout-page` (or just look at the chat transcript).
  **Atomic execution:** schema rename + Prisma migration on `conner-local-dev`
  + all 19 find/replace edits + `npx prisma generate` + restart dev server,
  in one PR. Splitting the halves leaves the running NestJS server in a
  state where queries return `column "pricing_override" does not exist`
  errors.

- [2026-04-09] **Update `entities.md` `meal` entity to single-price model**
  `conner/data-model/entities.md:297-329` (the canonical spec) currently
  defines the `meal` entity with TWO price fields: `price` (subscriber
  price) and `retail_price` (one-time price ~8% higher). Both are wrong
  per the corrected pricing model: there is ONE price (the regular full
  retail price) and the subscriber discount is applied at order time as
  a percentage from `PERK_TIERS` based on cart quantity. **Fix:** drop the
  `retail_price` row entirely; rename `price` → `item_price` (matches the
  rename above) and clarify it's the regular full retail price every
  customer sees, with the subscriber discount applied at checkout. One-line
  doc edit. Pair with the column rename PR or do separately — both are
  small.

- [2026-04-09] **Corporate `placeOrder()` over-fetches MealRecipe rows**
  `backend/src/modules/corporate/portal/corp-portal.service.ts:137` does
  `prisma.mealRecipe.findMany({ where: { id: { in: mealIds } } })` with no
  `select` clause, which loads every column on every meal (including
  `pricing_override`, `computed_cost`, `final_yield_weight`, `description`,
  etc) when only `id`, `meal_code`, `display_name`, `name` are actually
  used in the loop that builds the order line items. Add a `select`
  clause naming just the fields the code reads. Tiny perf win, not urgent.
  Same file's `getWeeklyMenu()` already does this correctly (lines 35-52).

- [2026-04-09] **Move corporate tier config out of `CorporateCompany.extra` JSONB**
  Today the corporate B2B tier pricing (free / tier1 / tier2 / tier3 ×
  meals/employeePrice/bdSubsidy/companySubsidy) is stored as stringly-typed
  keys inside `CorporateCompany.extra` JSONB (`'FreeMealsPerWeek'`,
  `'Tier1_EmployeePrice'`, `'Tier1_BDSubsidy'`, etc — see
  `backend/src/modules/corporate/portal/corp-portal.service.ts:96-125`).
  No schema enforcement, no admin UI to edit it without poking JSON
  directly. Same drawback as the subscription tier config drift the
  calculator-fix commit just resolved with `subscription-config.js`.
  **Direction:** when the subscription-plans admin page eventually ships
  at `frontend/app/(dashboard)/settings/subscription-plans/`, build a
  sibling page `(dashboard)/settings/corporate-tiers/` and back it with
  proper schema columns on `CorporateCompany` (or a new
  `CorporateTierConfig` model) instead of JSONB. Bonus: also gives the
  corporate `getEmployeeTierConfig()` lookup a real type instead of the
  current `(level?.tier_config as any)` cast. Defer until the subscription
  admin page work is in flight — same lane (Gurleen's frontend dashboard).

- [2026-04-09] **Subscription pricing settings — admin dashboard UI** *(partially done)*
  **Done (2026-04-09):** Seed keys added to `brand/site-info.seed.json`
  (`public.pricing.perkTiers`, `public.pricing.freeDeliveryMeals`,
  `public.pricing.deliveryFee`, `public.pricing.gstRate`,
  `public.pricing.dollarsPerPoint`). `subscription-config.js` now fetches
  from `/api/system-config/public` on load, with hardcoded fallbacks if
  the API is unreachable. Constants changed from `const` to `let` so the
  fetch can overwrite them. Exported `pricingReady` promise for pages
  that need to `await` before computing totals (e.g. checkout).
  **Still TODO:**
  1. Run `npx prisma db seed` on the Neon dev branch to insert the new
     keys into the SystemConfig table (or add them manually via the admin
     PATCH endpoint).
  2. Build admin UI at `frontend/app/(dashboard)/settings/subscription-plans/page.tsx`
     — Gurleen's lane. Should display a form for editing tiers, delivery
     fee, GST rate, points config. PATCH to `/api/system-config`.
  3. Wire `subscription-config.js` into account/index.html and
     index.html (homepage) — both currently re-declare their own copies
     of PERK_TIERS and DELIVERY_FEE instead of loading the shared file.

- [2026-04-09] **Remove DEV-CART-FILLER test code before production**
  `conner/client-website/account/index.html` has a temporary cart-filling
  function (`DEV_fillTestCart()`) that auto-loads 12 meat entrees, 8
  plant-based entrees, and all snacks/breakfasts on page load. Search
  `DEV-CART-FILLER` to find the block. Also includes 8 placeholder
  plant-based meals (ids 150–157, search `PLANT-BASED-TEST-DATA`). Both
  blocks need to be removed before the account page goes live — the real
  data should come from the API. To disable without removing, set
  `DEV_AUTO_FILL_CART = false`.

- [2026-04-09] ✅ **Account page + homepage now use shared pricing constants**
  Both `account/index.html` and `index.html` (homepage) now load
  `shared/subscription-config.js` and use `lookupSubscriberDiscountPct()`.
  Local re-declarations removed. Account page's hardcoded `gstRate = 0.05`
  replaced with `GST_RATE` from shared config. Fake `*1.08+0.99` one-time
  price formula removed (one-time price = `meal.price`, no markup).
  Hardcoded `$7.99` replaced with `DELIVERY_FEE`. Homepage's `TIERS`
  object (different structure) replaced with shared `lookupSubscriberDiscountPct()`.
  **Still open:** category naming convention differs (`'Entrees'` in
  account vs `'Entree'` in menu page) — reconcile when wiring to API.

- [2026-04-09] **Free delivery rule divergence — quantity vs dollar threshold**
  Three different rules exist:
  - `subscription-config.js:74` → `FREE_DELIVERY_MEALS = 8` (qty-based, subscribers)
  - `checkout.html:2774` → uses `FREE_DELIVERY_MEALS` from shared config (correct)
  - `index.html:1612-1613` → `const free = _type==='plant' ? wt>=119.5 : wt>=120;` (dollar-based, everyone)
  Business intent (Conner, 2026-04-09): $120 for everyone, 8 meals for
  subscribers, undecided for one-time orders. Reconcile before launch.
  The homepage's dollar-based rule should be a separate constant in
  subscription-config.js (e.g. `FREE_DELIVERY_SPEND = 120`).

- [2026-04-09] **Build a wiring/inventory scanner + per-page inventory report**
  Conner asked for "an absolute inventory of every button, endpoint, tag, and connection" so any new feature can reference a database of what populates what (e.g., what fills the discount tiers, where macros come from, what the submit-order button does). Decided to defer building it. The plan when picked up:
  1. **Scanner script** at `conner/tools/wiring-scanner.py` — Python, walks a list of HTML files, extracts every event handler (`onclick`/`onsubmit`/etc.), every `getElementById` lookup, every `<a href>`, every `<img src>`, every `fetch()`, every `window.location` nav. Cross-references against function definitions and HTML ids in the same file. Outputs both a "broken/suspect" report (verdicts: OK / STUB / BROKEN / EMPTY) and a per-page interaction inventory (markdown tables: Element | File:Line | Triggers | Mutates/Reads | Notes).
  2. **`conner/inventory.md`** — auto-generated by running the scanner. Re-runnable any time. Always fresh because it reads straight from source.
  3. **`conner/inventory-notes.md`** — small hand-curated sidecar for the design intent the scanner can't see (the "why" behind each button, cross-references to data-model entities, etc.).
  Throwaway version of the scanner already exists in chat history (built during the subscriber-hub-v2 work, used to find the navPointsDisplay null-deref bug fixed in 8ce5be4); the formal version needs to live in the repo. **Industry vocabulary:** what Conner is asking for is closest to a "wire map" / "interaction map" / "event registry" — there's no single off-the-shelf tool for raw HTML projects (Storybook is React-only, OpenAPI is API-only). The auto-generated approach is the right one for a non-programmer founder because it can never go stale.

- [2026-04-09] **15 broken `<a href>` targets in shared marketing-header.html and marketing-footer.html**
  The shared shell fragments link to a bunch of pages that don't exist yet: `about.html`, `login.html` (header); `gift.html`, `about.html`, `sustainability.html`, `press.html`, `careers.html`, `wholesale.html`, `faq.html`, `delivery-areas.html`, `allergens.html`, `legal/refund.html`, `legal/accessibility.html` (footer). All are in `client-website/README.md` as 💭 planned. Every `client-website/` page that loads the shared shell shows them as 404s. Build the missing pages, OR temporarily soften the links to `#` until each page exists.

- [2026-04-09] **Subscriber Hub port: tokenize inline hex codes**
  `conner/client-website/account/index.html` was ported from the v2 prototype with the conservative approach: link `/brand/tokens.css`, add the data-shell placeholders + `site-shell.js`, but leave the existing ~1,750 lines of inline CSS hex codes alone for now. The page works and looks identical to the prototype, but it doesn't yet honor brand-token rebranding. Follow-up: walk the inline `<style>` block and replace literal hex codes with `var(--brand-*)` from tokens.css. Hottest targets: `#00465e` → `var(--brand-navy)`, `#003141` → `var(--brand-navy-dark)`, `#4EA2FD` → `var(--brand-primary)`, `#FAEBDA` → `var(--brand-cream)`, `#ffc600` → `var(--brand-yellow)`, `#6bbd52` → `var(--brand-green)`, `#dc2626` → `var(--brand-red)`. Long-tail rgba()s and one-off shades can stay literal until they actually need to change.

- [2026-04-09] **conner/client-website/login.html does not exist yet**
  The ported account hub's auth gate redirects to `../login.html` when there is no active session. That file is planned (see `client-website/README.md` status table) but not built. Until then, append `?preview=1` to the URL to bypass the gate (the prototype's existing dev escape hatch). Build login.html as a separate task — its prototype lives at `conner/app/login.html`.

- [2026-04-09] **Subscriber Hub "Deal of the Week" Add-to-Delivery button is a stub**
  In `conner/app/subscriber-hub-2.0.html`, the Subscriber Perks card has a static "Deal of the Week" sub-card (currently hardcoded to "Protein Energy Bites"). The "Add to Delivery" button just toasts a success message — it doesn't actually add anything to the cart. Wire this for real once the DOTW data model + customer-side coupon resolver is wired up (see DOTW scheduler entry below). The whole `#perksDealSlot` is meant to be JS-rendered from real DOTW data; the static HTML is just a visual placeholder.

- [2026-04-08] **Cart line item snapshot fields** *(Migration #4 scope)*
  Add `menu_price_at_add`, `promised_price_at_add`, `promised_coupon_id` to the cart line item table. Implements the "price ceiling" rule — customers always get the best price they were ever shown. See `project_dotw_preorder_rules` memory for the full rule. NOT Migration #3 coupon scope.

- [2026-04-08] **Customer-facing coupon error message catalog**
  Backend `coupon-error-messages.ts` mapping error codes → warm, action-oriented copy in BetterDay voice. One source of truth for all validation failures. To build: after the Coupon validation engine is implemented. Optional HTML preview tool (`coupon-error-catalog.html`) to preview and edit the copy visually before wiring into backend.

- [2026-04-08] **Coupon validation telemetry table** *(optional, analytics)*
  Log every coupon validation attempt with `{ coupon_code, customer_id, error_code, cart_total, timestamp }`. Lets you answer "what's the top failure reason for this campaign?" — useful for tuning thresholds. Deferrable until there's real traffic.

- [2026-04-08] **DOTW scheduler admin UI — real implementation**
  Backend: coupon creation endpoint with `purpose=deal_of_the_week` preset. Frontend: the calendar view + modal from `conner/dotw-scheduler-mockup.html`, wired to real data. Mockup is the reference.

- [2026-04-08] **Auto-apply "best coupon" logic at checkout**
  When multiple `auto_apply=true` coupons are eligible for a cart, the system should pick the one that saves the customer the most money. Pure backend logic, no schema change. Needed before auto_apply is actually useful.

- [2026-04-08] **Deep-link coupon auto-apply on landing**
  `/?coupon=WELCOME10&utm_source=email&utm_campaign=spring2026` should auto-apply the coupon AND populate `source_channel` + `source_campaign` on the `CustomerCoupon` redemption row. No schema change — just wire it in the client website.

- [2026-04-08] **Coupon performance reporting dashboard**
  Admin page showing: redemptions, revenue, avg first-order value, avg LTV, retention curves, ROI by category/tag. Queries join `Coupon ← CustomerCoupon ← Order ← Customer`. Build after Migration #3 ships and there's real data to report on.

---

## 💡 Future ideas (not on the roadmap yet)

- [2026-04-10] **Subscriber Smart Hub — unified dashboard for alerts, actions, deals, news**
  Replace the current flat subscriber dashboard with a two-zone layout:
  **Zone 1 — Persistent quick-actions strip** (always visible, same for all):
  Edit my meals, adjust plan slots, pause/skip week, view order history.
  **Zone 2 — Dynamic cards feed** (personal + broadcast, dismissable):
  Alerts (failed coupon, expiring card, cutoff approaching), deals (DOTW
  spotlight, personal coupons, clippable offers), content (weekly menu
  update, company announcements, newsletter-style messages from founders),
  rewards (streak tracker, milestone badges, points balance).
  **Foundation model — `CustomerHubCard`:**
  `id, customer_id (nullable = broadcast), type (alert/deal/action/news),
  category (coupon_failed/card_expiring/dotw/menu_update/etc), priority
  (urgent/normal/low), title, body, action_label, action_url, image_url,
  target_customer_tags[] (empty = everyone), dismissed_at, expires_at,
  created_at`. Broadcast cards use `customer_id = NULL` — one row reaches
  all subscribers. Tag-targeted broadcasts filter by `target_customer_tags`
  against `Customer.tags` (same field the auto-computed marketing tags
  will populate). Cards auto-expire via `WHERE expires_at IS NULL OR
  expires_at > NOW()`. Priority drives sort order (urgent pins to top).
  **Connects to:** failed coupon notifications (error-messages.ts copy),
  auto-computed marketing tags (customer metrics), DOTW scheduler, and
  any future email/push notification system (hub cards become the
  canonical "what to tell this customer" source, channels just deliver).
  **Build when:** client-profile account hub page is ready for dynamic
  content. Foundation model can land anytime as a migration.

- [2026-04-10] **Recurring DOTW template — generate N coupon rows from one form**
  Admin wants "cookies 50% off" every week for 4 weeks. Currently must
  create 4 separate coupons with different codes + delivery_week_sunday.
  Convenience shortcut: one form generates N coupon rows with auto-suffixed
  codes (e.g. COOKIES50-APR13, COOKIES50-APR20). Thin wrapper over the
  existing `CouponAdminService.create()`. Build when DOTW scheduler UI ships.

- [2026-04-08] **Welcome series / birthday / abandoned cart automation**
  All T3 in the coupon feature picker. Require a scheduled-job runner that doesn't exist yet. Layer in as a separate migration once execution infrastructure is in place.

- [2026-04-08] **Partner portal for external coupon generation**
  Let partners (gyms, studios, offices) generate their own branded coupons within a scoped allowance. Overlaps with bulk-unique-code generation.

- [2026-04-08] **Bulk unique code generation**
  Generate 1,000 single-use codes from one template for a partnership or giveaway. Requires a code generator utility + parent_coupon_id link.

- [2026-04-08] **Gift coupons**
  Customer A sends a coupon to Customer B via SMS/email. Links two customers at redemption time. Overlaps with referral system.

- [2026-04-08] **Dual-sided referral program built on coupon infrastructure**
  "Refer a friend, you both get $10." Field on Coupon: `referrer_customer_id` + `referrer_credit`. Already toggled on in the picker — build in Migration #3.

- [2026-04-08] **QR code output for physical marketing**
  CLI tool that takes a coupon code and generates a QR that links to a deep-link URL. No schema change.

- [2026-04-08] **Tag autocomplete in the coupon admin form**
  Prevents tag fragmentation like `jane_fitness` vs `janefitness`. Client-side: query distinct tags across all Coupons and suggest as the admin types. No schema change.

- [2026-04-08] **Household limits (max uses per delivery address)**
  Fraud prevention — prevent multi-account abuse by normalizing delivery address and capping redemptions per household. Field toggled on in the picker.

- [2026-04-08] **A/B test variant tracking**
  Toggled OFF in the picker for Migration #3. Can be achieved manually by creating two coupons (`WELCOME-A`, `WELCOME-B`) and tagging them with a shared experiment identifier. Upgrade to a first-class concept later if the manual flow gets painful.

---

## ✅ Resolved

- ✅ [2026-04-09] **Customer-facing coupon error message catalog**
  Built as `backend/src/modules/commerce-coupons/error-messages.ts`.
  Maps all 26 error codes to warm customer-facing copy with placeholder
  interpolation ({shortfall}, {required}, {startsAt}, etc.). Resolves
  the 2026-04-08 TODO entry below.

- ✅ [2026-04-09] **Coupon apply/remove endpoints (Phase 1 leaves 3 + 4)**
  Built as `coupon-apply.service.ts` + `commerce-coupons.controller.ts`.
  Three endpoints: POST apply, POST remove, POST validate (preview).
  Includes: last-one-wins stacking, manual beats auto, TOCTOU re-validation
  inside serializable transaction, global limit race fix, order total
  recalculation. 15 tests, all passing.
