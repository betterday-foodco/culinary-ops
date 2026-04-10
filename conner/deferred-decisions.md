# Deferred Decisions & Edge Cases

A running list of things that came up in chats but were consciously deferred — edge cases, pending design decisions, implementation TODOs, and future ideas. Every chat should **scan this file on startup** to see what's outstanding that might be relevant to the work it's about to do.

**Format:** each entry is dated, titled, and carries 1–2 lines of context. Add new entries at the top of the relevant section. When an item is resolved, either delete it or move it to the bottom of the section with a ✅ prefix.

**Rule:** if you're resolving an item here, double-check the original chat context (commit history + the discussion that led to the deferral) before acting on it — these are snapshots in time and may be out of date.

---

## 🔮 Edge cases to handle later

- [2026-04-10] **Customer skips/pauses/cancels DURING the Tuesday pre-auth cron run**
  Customer hits "skip" on the website at 8:07 PM while the pre-auth cron is mid-loop. If their pre-auth already fired, the skip/pause endpoint must immediately void it via `POST /v2/payment/reverse`. If the cron hasn't reached them yet, skip them entirely. The skip/pause API handler must check "does an `authorized` order exist for this delivery week?" and void it on the spot. Do not wait for Thursday's capture cron to discover the skip.

- [2026-04-10] **Customer un-skips after their pre-auth was already voided**
  Customer skips Tuesday night (pre-auth voided), then changes their mind Wednesday morning. The old hold was released. The un-skip action must trigger a fresh pre-auth immediately. If it succeeds, the order re-enters the Thursday capture queue. If it fails, the customer gets the standard dunning email like any other decline. UI should say: *"We'll try to authorize your card now. If it goes through, your delivery is back on track."*

- [2026-04-10] **Admin edits an order after pre-auth (price change)**
  Shouldn't happen because carts lock at pre-auth time. But if a future admin-override feature lets someone adjust an order (wrong item, CS swap), the admin edit flow must: void the original pre-auth → update the order snapshot with the new total → run a fresh pre-auth for the new amount. If the new pre-auth fails, the admin sees the decline and decides what to do. Never capture an old pre-auth for a different amount than what the order now shows.

- [2026-04-10] **Pre-auth expires before Thursday capture (system outage)**
  Helcim pre-auths are valid ~7 days; our window is 48 hours. If Thursday's capture cron doesn't run until Saturday (deploy failure, Render outage, etc.), the hold could have dropped. The capture call will simply fail. Fallback: treat it as a fresh decline and run a direct `POST /v2/payment/purchase` (no pre-auth, just charge). Log an alert because a >48h capture gap means the cron infrastructure broke.

- [2026-04-10] **Customer sees two pending holds on their card (void + re-auth overlap)**
  Happens if: pre-auth Tuesday → void Wednesday (they skipped) → un-skip Wednesday evening (new pre-auth). Bank might show both the dying hold AND the new hold for a few hours. Confusing but harmless — the voided one drops off within 1-2 business days. Cover with messaging: *"You may see two pending charges from BetterDay briefly. The older one is being released — only the current one will post."*

- [2026-04-10] **Post-void customer messaging — where and how to display universally**
  When a pre-auth is voided (skip, pause, cancel, card removal), the customer may see a lingering "pending" charge on their bank statement for 1-2 business days. Need to show a clear message both (a) immediately in the UI when they take the action, and (b) in a follow-up email. Draft copy: *"You may see a pending charge of $XX.XX from BetterDay on your card statement. This is just a hold that's being released — you will not be charged. It typically drops off within 1-2 business days."* Needs UX decision on where this shows: toast notification? inline banner in subscriber hub? confirmation modal? all three? Track alongside the other customer-facing email copy review in this file.

- [2026-04-09] **Card removed from Helcim vault outside our admin UI**
  If someone deletes a card directly in the Helcim dashboard (not via our admin), our `PaymentMethod.processor_token` becomes orphaned and the next weekly charge fails with "invalid token." Need to either periodically refresh from `GET /customers/{id}/cards` or treat the specific error as "card removed" in the decline classifier and auto-pause. Surfaced during Helcim integration research — see `conner/data-model/helcim-integration.md` §4.

- [2026-04-09] **Reconciliation cron finds a transaction we don't recognize**
  The daily reconciliation cron may find a Helcim transaction with no matching `CustomerOrder.processor_charge_id`. Could be (a) an admin processing a manual charge in the Helcim dashboard, (b) a race condition between the weekly cron and the reconciliation cron, (c) a reconciliation bug. Current plan: log + alert ops, don't auto-create a placeholder order. Needs a policy decision before v1 ships.

- [2026-04-09] **Two worktrees running the weekly charge cron simultaneously**
  In dev, if two Claude chats both run the backend with `@Cron` registered, both will try to charge the same cart at the same time. Idempotency-key prevents the actual double-charge but we'd get two `CustomerOrder` rows racing to claim the same `processor_charge_id`. Mitigation: disable the weekly cron in dev entirely; trigger manually via a dev-only `POST /admin/commerce/weekly-charge/run-once` endpoint. Baked into the Helcim implementation plan (`helcim-integration-plan.md` §7).

- [2026-04-09] **Helcim checkout session expires mid-entry**
  `checkoutToken` + `secretToken` are valid for ~60 minutes. If a customer opens the HelcimPay.js modal, walks away to make dinner, comes back 90 minutes later, the iframe will fail silently. UI needs to detect this (via a timestamp check on `HelcimCheckoutSession.expires_at`) and gracefully re-initialize a fresh session instead of showing a broken form.

- [2026-04-08] **Meal removed from menu after customer has it in a pre-order cart**
  Admin drops cookies from the April 20 menu but a subscriber already has cookies in their April 20 draft cart. Likely: show a warning in cart, silently drop at cutoff, optionally suggest an alternative. Needs UI + cart validation design. Not blocking Migration #3 coupon work.

- [2026-04-08] **Coupon deleted while customer has it applied to a draft cart**
  Related to above. If a coupon is removed from the Coupon table while a subscriber's pre-order cart has it applied, the draft references a non-existent coupon. Cart snapshot fields (Migration #4 scope) will make this moot because the discount is already frozen on the line item.

- [2026-04-08] **Multi-delivery-week coupon early termination**
  Admin wants to end a scheduled DOTW early (before its `expires_at`). What happens to draft carts that already have it applied? Per the price-ceiling rule, they keep their discount. But the admin UX needs to make this clear before they hit "delete."

---

## 🎯 Design decisions pending

- [2026-04-10] **Post-void messaging UX — where to surface the "pending charge will drop off" notice**
  When a pre-auth hold is voided (customer skips, pauses, cancels, or removes card between Tuesday pre-auth and Thursday capture), the customer may see a lingering "pending" charge on their bank statement for 1-2 business days. Draft copy exists (see edge case entry above). Needs a UX decision: toast notification? inline banner in subscriber hub? confirmation modal? follow-up email? All of the above? This is a customer-trust issue — a confused customer seeing an unexpected pending charge after they skipped their delivery is exactly the kind of thing that triggers a chargeback. Getting the messaging right and visible is important. Track alongside the other customer-facing email copy review.

- [2026-04-09] **Tax calculation strategy — hardcoded AB GST 5% vs TaxJar vs manual**
  Helcim has no Stripe-Tax equivalent; we must compute tax on our side before calling `/v2/payment/purchase`. Three options in `conner/data-model/helcim-integration.md` §11. Recommended: ship Option A (hardcoded 5% behind a `TaxCalculator` interface) contingent on an accountant confirming BetterDay prepared meals are classified as taxable under CRA rules (prepared food, NOT basic groceries). Cannot be confirmed without accountant review.

- [2026-04-09] **Stored-credential consent copy — legal review before production ship**
  Visa/MC stored-credential framework requires language shown at card capture authorizing future merchant-initiated charges. Draft copy in `conner/data-model/helcim-integration.md` §4. Safe to ship to sandbox without review; cannot ship to production without a light legal review. Lower priority than the three Helcim-support blockers but a hard gate.

- [2026-04-09] **Customer-facing charge-failure email copy (3 templates)**
  First-decline / retry / fatal. Draft copy in `conner/data-model/helcim-integration.md` §6. Needs the same marketing-voice review that coupon error messages need — track together.

- [2026-04-08] **DOTW scheduler access control — separate role for head chef / ops manager?**
  Should the DOTW scheduler be accessible to a restricted role (e.g. "Operations" or "Culinary") that can only touch DOTWs + menu planning, without seeing customer PII or full coupon admin? Worth resolving before the admin UI ships. Not urgent for the schema.

- [2026-04-08] **"Currently viewing" banner on future-week menus**
  Small UX nudge on the menu page when a subscriber is browsing a future week's menu: *"You're ordering for April 20 delivery. This week's deals apply to April 13 orders only."* Deferred until the menu display logic is finalized. No schema impact.

- [2026-04-08] **Retroactive DOTW grace period**
  If admin adds a DOTW after a customer has already ordered at full price, should there be a grace window where admins can re-apply the discount manually? Probably no — keep it simple. But worth naming.

---

## 🛠️ Implementation TODOs

- [2026-04-09] **Email `tier2support@helcim.com` to request a test account**
  Provide existing Helcim merchant ID + description of the weekly-variable-amount MIT use case. Must be done on day 1 of the Helcim implementation chat since test-account provisioning is manual and takes 1–2 business days. Nothing in sandbox can be verified until this lands.

- [2026-04-09] **Draft Helcim support email covering the three blocking open questions**
  Q1: MIT flag parameter on `/v2/payment/purchase` (research §14 Q1). Q2: ipAddress population for cron-initiated MIT charges (§14 Q2). Q3: dispute/chargeback notification mechanism (§14 Q3). Single email, three questions. Block production ship until answers come back. Draft in the implementation chat, send before any production cutover attempt.

- [2026-04-09] **Sandbox decline classifier — run every CVV>=200 variation and record error strings**
  Helcim decline errors come back as free-text strings, not machine-readable codes. Build `sandbox-decline-catalog.ts` to hit `/v2/payment/purchase` with every decline variation (CVV=200, 500, 999, expired card, invalid card, etc.) and populate `helcim/decline-classifier.ts` patterns. Current classifier uses guessed regex patterns that will almost certainly be wrong.

- [2026-04-09] **Verify the Helcim "get transaction by ID" endpoint in sandbox**
  Server-side verification in Flow A (helcim-integration.md §4) depends on our backend being able to look up a transaction by its ID to validate what the browser reported. Legacy docs URL timed out during research; confirmed to exist but exact shape unverified. Test in sandbox before Phase 2 of implementation plan.

- [2026-04-09] **Write a sandbox webhook sender script**
  If Helcim's sandbox doesn't fire real webhooks (unknown — not documented), we need a local script that constructs a properly-signed webhook body and POSTs it to our dev backend for HMAC verification testing. One-off dev tool, lives in `backend/scripts/`.

- [2026-04-09] **Verify `customerCode` is Helcim-generated or merchant-supplied**
  Docs don't specify. Affects whether `Customer.helcim_customer_id` is written before or after the `POST /customers` call. Answer falls out of the first sandbox call — low-effort verification.


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

- [2026-04-09] **Port culinary-ops Helcim patterns back to betterday-app**
  Once the culinary-ops Helcim integration is proven in production, translate the NestJS patterns (secretToken validation, persistent `HelcimCheckoutSession` table, webhook HMAC verifier, daily reconciliation cron) back to `betterday-foodco/betterday-app`'s Flask codebase. That app's Helcim integration is a minimal first draft with known shortcuts (in-memory token store, no secretToken verification, no webhooks). culinary-ops becomes the canonical pattern; betterday-app inherits the fixes.

- [2026-04-09] **Automated dispute evidence submission to Helcim**
  When the daily reconciliation cron detects a dispute, automatically gather order details (line items, delivery confirmation, customer correspondence) and submit via Helcim's dispute-evidence API — if one exists. Currently v1 handles evidence submission manually via the Helcim dashboard. Low priority until disputes actually happen at volume.

- [2026-04-09] **Pre-authorization + delayed capture for perishable orders**
  Instead of charging on Thursday cutoff, pre-auth via `/v2/payment/preauth` on Thursday and capture via `/v2/payment/capture` on actual delivery day. Locks in funds without collecting them until the meal actually ships. Better customer experience for delivery failures (no refund loop needed). Extra state-machine complexity — defer until we see real fulfillment failures that would benefit from it.

- [2026-04-09] **Helcim Recurring API for fixed-price add-ons**
  If we ever sell something that IS a fixed-amount subscription (e.g., a $29/mo meal-planning coaching add-on separate from the weekly cart), that's where Helcim's Recurring API fits. Out of scope for the cart-based core product, but would be a clean use case.

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

- ✅ [2026-04-10] **Monthly plan = every 4th Thursday, no special payment logic**
  Resolved: BetterDay's "monthly" plans are literally 4-week plans that follow the same weekly rhythm. A monthly subscriber simply has their `WeeklyCartRecord` generated every 4th week instead of every week. The payment pipeline (pre-auth Tuesday → capture Thursday) is identical for weekly and monthly subscribers. The cadence logic lives entirely in the cart generation cron, upstream of payments. The payment cron is cadence-agnostic — if a cart record exists for the delivery week, it gets charged. If no record exists, nothing happens. No per-subscriber renewal dates, no special monthly billing path.

- ✅ [2026-04-10] **Cart generation cron owns cadence, payment cron is cadence-agnostic**
  Resolved: the separation of concerns is: (1) cart generation cron creates `WeeklyCartRecord` rows for the right subscribers at the right cadence, (2) payment cron operates on whatever records exist for the delivery week without knowing or caring about cadence. This means `Subscription.cadence` is only read by the cart generation cron, never by the payment flow. Clean boundary.

- ✅ [2026-04-10] **Payment architecture = pre-auth Tuesday → capture Thursday (not just-in-time)**
  Resolved: the original Phase 3 plan was just-in-time charging at Thursday cutoff (lock + charge in one pass). Changed to a two-phase pre-auth model after analyzing BetterDay's real failure rate (~2-5 out of 125 charges/week = 1.6-4%) and $130K/month volume. The 48-hour buffer between pre-auth and capture gives customers time to fix card issues before their delivery is affected. Estimated $35K/year in recovered revenue from dunning vs just-in-time. Design details in `helcim-integration-plan.md` §18.

- ✅ [2026-04-10] **Lock carts BEFORE charging, not during**
  Resolved: the lock phase (snapshot cart → create order as `pending`) happens in bulk in ~2 seconds before any Helcim calls. The charge phase (sequential API calls) can take 5-15 minutes. Because carts are locked first, no amount of charge-phase latency can cause cart drift. The order is the source of truth; the payment is a status field on the order.

- ✅ [2026-04-10] **Helcim Recurring API is NOT used — confirmed card-on-file is the correct model**
  Resolved: BetterDay's variable-amount weekly carts don't fit Helcim's Recurring API (which is designed for fixed-amount subscriptions like gym memberships). We use `/v2/payment/preauth` + `/v2/payment/capture` with saved `cardToken` via the Payment API instead. Helcim's Recurring API is only relevant if BetterDay ever sells a fixed-price add-on product. Full analysis in `helcim-integration.md` §1.

*(Move completed items here with a ✅ prefix and the resolution date.)*
