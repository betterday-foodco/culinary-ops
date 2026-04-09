# Deferred Decisions & Edge Cases

A running list of things that came up in chats but were consciously deferred — edge cases, pending design decisions, implementation TODOs, and future ideas. Every chat should **scan this file on startup** to see what's outstanding that might be relevant to the work it's about to do.

**Format:** each entry is dated, titled, and carries 1–2 lines of context. Add new entries at the top of the relevant section. When an item is resolved, either delete it or move it to the bottom of the section with a ✅ prefix.

**Rule:** if you're resolving an item here, double-check the original chat context (commit history + the discussion that led to the deferral) before acting on it — these are snapshots in time and may be out of date.

---

## 🔮 Edge cases to handle later

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

*(Move completed items here with a ✅ prefix and the resolution date.)*
