# Deferred Decisions & Edge Cases

A running list of things that came up in chats but were consciously deferred — edge cases, pending design decisions, implementation TODOs, and future ideas. Every chat should **scan this file on startup** to see what's outstanding that might be relevant to the work it's about to do.

**Format:** each entry is dated, titled, and carries 1–2 lines of context. Add new entries at the top of the relevant section. When an item is resolved, either delete it or move it to the bottom of the section with a ✅ prefix.

**Rule:** if you're resolving an item here, double-check the original chat context (commit history + the discussion that led to the deferral) before acting on it — these are snapshots in time and may be out of date.

---

## 🔮 Edge cases to handle later

- [2026-04-09] **`diet_plan_id` cross-database referential integrity**
  Commerce `Customer.diet_plan_id` is a bare UUID (not a Prisma `@relation`) pointing at culinary `SystemTag.id` where `type='diets'`. Write-time validation lives in `CommerceCustomersService.updatePreferences()`. Gaps: (1) if a SystemTag row is later DELETED on the culinary side, existing commerce Customer rows retain a stale UUID — no cascade fires. Need a periodic orphan check or a culinary-side admin guard that refuses to delete a diets tag while any Customer references it. (2) `diet_plan_id` is validated on PATCH but NOT on read; stale values flow through `getMe()` and may break the client if the UI can't find the id in its dietPlans list. The account page logs a console warning in that case — escalate to a schema-level repair if it ever happens in prod.

- [2026-04-09] **Customer with `allergens` containing strings that don't map to any SystemTag slug**
  The account page's allergen checkboxes use a fixed `ALLERGEN_OPTIONS` vocabulary. A legacy Customer row with an allergen that isn't in that list (e.g. "Mustard", "Sulfites") will not display and will be silently dropped on save. Either (a) fetch the full allergen list from culinary SystemTag on page load, or (b) keep the fixed vocabulary and run a one-time backfill that normalizes all existing Customer.allergens[] to the canonical slugs. Probably (a) once the catalog endpoint is live.

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

- [2026-04-09] **Apply the diet lock to every other meal-listing surface**
  The fail-closed diet filter landed on `conner/client-website/menu/index.html` but the same invariant needs to be enforced everywhere a meal card (or meal-code URL) can appear: the cart (`cart.html`), the meal detail page (`/menu/[meal-code]/`), the subscriber hub's weekly cart (`account/subscription.html`), and any build-a-cart / auto-swap flow. Pattern to copy: extract `resolveDietLock()` to `shared/diet-lock.js` first, then import it on every page.

  **UX for deep-link access to a non-compliant meal (meal detail page):**
  NOT a 404. A plant-based customer who follows a bookmark or a marketing link to a meat meal needs to land somewhere helpful, not an error page. The flow:
  1. Resolve the diet lock on the meal detail page as usual.
  2. If the meal's `diet_plan` matches the customer's plan → render normally.
  3. If it doesn't AND the meal has a `linked_meal_id` → render a gentle redirect screen: "We're showing you the Plant-Based version of this dish" + a card linking to the sibling, with a one-click "Take me there" button. Use the existing `MealRecipe.linked_meal_id` pair.
  4. If it doesn't AND there's no linked sibling → render the meal in read-only mode (image, name, description) with the Add-to-cart button replaced by "This dish isn't part of your Plant-Based plan" + links to (a) browse Plant-Based menu, (b) change diet.
  5. Never throw a 404 at a real customer. A 404 is for URLs that don't match ANY meal, not for meals that don't match the customer.

- [2026-04-09] **Sibling swap UX when a customer changes from Omnivore → Plant-Based**
  `MealRecipe.linked_meal_id` already pairs every omnivore dish with its plant-based counterpart (one-directional, set only on the omnivore side). When a customer with meals already in their weekly cart switches to Plant-Based, the UI should walk the cart, find each meat meal, look up its `linked_meal_id`, and offer a one-click "swap all 4 to their plant-based equivalents" action instead of just silently dropping the non-compliant lines. Needs: (a) a cart-editing endpoint that accepts a meal-id swap list, (b) a modal surfacing the proposed swaps, (c) copy in the voice of the brand.

- [2026-04-09] **Refactor onboarding picker's legacy `'vegan'` slug to `'plant-based'`**
  `conner/client-website/onboarding/index.html:318–345` calls `selectDiet('vegan')` and redirects with `?diet=vegan`. The canonical SystemTag slug is `plant-based`. The menu filter currently accepts BOTH as an alias for the Plant-Based plan so nothing breaks, but long-term consistency: update the picker to use `'plant-based'` slug throughout, drop the alias from the menu filter, and leave a one-line comment on why `vegan` was the legacy term. Trivial change, just not in this chat's scope.

- [2026-04-09] **Apply commerce migration #6 `add_customer_diet_plan` to Neon dev branch**
  Migration file is committed at `backend/prisma/commerce/migrations/20260409153741_add_customer_diet_plan/migration.sql`. Adds `Customer.diet_plan_id TEXT` (nullable, no FK) plus an index. Still needs to be executed against `betterday-commerce/dev` (`br-icy-river-akvz3mg6`) via `npx prisma migrate deploy --schema=backend/prisma/commerce/schema.prisma` (or `migrate dev` if schema drift detection runs clean). Do NOT deploy to `betterday-commerce/main` until the client-profile branch is reviewed and merged.

- [2026-04-09] **Run `npm install` in the `culinary-ops-client-profile` worktree before the next backend change**
  This worktree doesn't have `backend/node_modules` yet, so `prisma generate` and `tsc --noEmit` can't run here. The schema + TypeScript edits in this chat are committed without local type-checking. First follow-up action in the next client-profile chat should be `(cd backend && npm install)` then `npx prisma generate --schema=prisma/commerce/schema.prisma` and `npx tsc --noEmit -p tsconfig.json` to confirm the `diet_plan_id` additions compile cleanly end-to-end.

- [2026-04-09] **Wire the account hub into real auth (remove `x-dev-customer-id` header)**
  `conner/client-website/account/index.html` sends `x-dev-customer-id: 00000000-0000-4000-a000-000000000001` (Jose seed row) on every request. Matches the `CurrentCustomer()` decorator's dev stub. When passwordless auth lands, swap to a refresh-token-backed fetch wrapper and drop the dev header. Same swap needed everywhere else in client-website/ that talks to the commerce API.

- [2026-04-09] **Fetch real diet plan SystemTag IDs for the account hub diet-plan radio**
  `FALLBACK_DIET_PLANS` in account/index.html uses a placeholder string `'PENDING-PLANT-BASED-SYSTEM-TAG-ID'` for the Plant-Based row. Need a read-only endpoint (or embed in `/api/system-config/public`) that returns the two diets SystemTag rows by name + id. Until then, the account page's Plant-Based option will fail validation on save.

- [2026-04-09] **Phone + email change flows for the account hub**
  The customer info form shows a "Change email" link that currently just flashes an info banner. Needs: (a) magic-link flow using `CustomerAuthToken.type='email_change'`, (b) phone OTP flow using `type='phone_change'`, (c) a UI prompt that asks for the new address/number, fires the token, and polls for confirmation. Both flows exist in the commerce schema but are unwired.

- [2026-04-09] **`CustomerMarketingConsent` table for CASL compliance**
  Account hub has a disabled "Marketing email (coming soon)" toggle. Current `email_opt_in` + `sms_opt_in` are transactional-only. Canadian anti-spam law requires separate, explicit marketing consent with a proof-of-consent trail (when, where, IP). Dedicate a table when we're ready to start sending campaigns.

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
