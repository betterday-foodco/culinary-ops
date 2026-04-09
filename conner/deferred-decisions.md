# Deferred Decisions & Edge Cases

A running list of things that came up in chats but were consciously deferred — edge cases, pending design decisions, implementation TODOs, and future ideas. Every chat should **scan this file on startup** to see what's outstanding that might be relevant to the work it's about to do.

**Format:** each entry is dated, titled, and carries 1–2 lines of context. Add new entries at the top of the relevant section. When an item is resolved, either delete it or move it to the bottom of the section with a ✅ prefix.

**Rule:** if you're resolving an item here, double-check the original chat context (commit history + the discussion that led to the deferral) before acting on it — these are snapshots in time and may be out of date.

---

## 🔮 Edge cases to handle later

- [2026-04-08] **Meal removed from menu after customer has it in a pre-order cart**
  Admin drops cookies from the April 20 menu but a subscriber already has cookies in their April 20 draft cart. Likely: show a warning in cart, silently drop at cutoff, optionally suggest an alternative. Needs UI + cart validation design. Not blocking Migration #3 coupon work.

- [2026-04-08] **Coupon deleted while customer has it applied to a draft cart**
  Related to above. If a coupon is removed from the Coupon table while a subscriber's pre-order cart has it applied, the draft references a non-existent coupon. Cart snapshot fields (Migration #4 scope) will make this moot because the discount is already frozen on the line item.

- [2026-04-08] **Multi-delivery-week coupon early termination**
  Admin wants to end a scheduled DOTW early (before its `expires_at`). What happens to draft carts that already have it applied? Per the price-ceiling rule, they keep their discount. But the admin UX needs to make this clear before they hit "delete."

---

## 🎯 Design decisions pending

- [2026-04-08] **DOTW scheduler access control — separate role for head chef / ops manager?**
  Should the DOTW scheduler be accessible to a restricted role (e.g. "Operations" or "Culinary") that can only touch DOTWs + menu planning, without seeing customer PII or full coupon admin? Worth resolving before the admin UI ships. Not urgent for the schema.

- [2026-04-08] **"Currently viewing" banner on future-week menus**
  Small UX nudge on the menu page when a subscriber is browsing a future week's menu: *"You're ordering for April 20 delivery. This week's deals apply to April 13 orders only."* Deferred until the menu display logic is finalized. No schema impact.

- [2026-04-08] **Retroactive DOTW grace period**
  If admin adds a DOTW after a customer has already ordered at full price, should there be a grace window where admins can re-apply the discount manually? Probably no — keep it simple. But worth naming.

---

## 🛠️ Implementation TODOs

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

- [2026-04-09] **Subscription pricing settings — admin dashboard UI**
  `conner/client-website/shared/subscription-config.js` is currently the
  single source of truth for `PERK_TIERS`, `FREE_DELIVERY_MEALS`,
  `DELIVERY_FEE`, `GST_RATE`, and `POINTS_PER_DOLLAR`. Both the menu page
  and the checkout page consume it via `<script src>`. The values are
  hardcoded JS constants — they should move into the existing
  `SystemConfig` key-value table (`backend/prisma/schema.prisma:511`) and
  be served via `/api/system-config/public` (the same endpoint that
  already delivers `public.contact.email`, `public.delivery.areas`, etc).
  Then `subscription-config.js` becomes a thin shim that fetches the live
  config and falls back to the hardcoded defaults if the fetch fails.
  **Where the admin UI lives:** `frontend/app/(dashboard)/settings/subscription-plans/page.tsx`
  (new — sibling of `settings/integration`, `settings/staff`, `settings/tags`).
  Schema for the seed: encode the tier table as a JSON-stringified value
  on a single key (e.g. `public.subscription.tiers = "[{...},{...}]"`)
  since `SystemConfig.value` is a `String` column. **Lane:** the admin UI
  is in Gurleen's `frontend/` territory and needs to ship through her
  worktree. Backend changes (seed file + endpoint passthrough) are
  Conner's. See the calculator-fix commit on
  `conner/2026-04-09-checkout-page` for the full context of why this
  matters — the menu page and checkout page used to have drifted copies
  of these constants, which produced math bugs.

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

*(Move completed items here with a ✅ prefix and the resolution date.)*
