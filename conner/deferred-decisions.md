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

- [2026-04-09] **Promote migration #6 `add_customer_diet_plan` from dev → main when client-profile PR merges**
  The migration is already applied to `betterday-commerce/dev` (`br-icy-river-akvz3mg6`) as of 2026-04-09 — column + index + `_prisma_migrations` row all verified, end-to-end smoke-tested by writing the Omnivore UUID to Jose's seed customer. **Main is still untouched** (`br-wandering-paper-ak95715o`). When the client-profile PR is reviewed and merged into `conner/universal-brand-folder`, run the same ALTER + CREATE INDEX + INSERT-into-_prisma_migrations against `betterday-commerce/main` so production matches the code that's about to deploy. Use `mcp__neon__run_sql_transaction` with `branchId = br-wandering-paper-ak95715o` (mirroring the dev apply) — `prepare_database_migration` targets main automatically but creates a temp branch first, which is also fine.

- [2026-04-09] **Wire the account hub into real auth (remove `x-dev-customer-id` header)**
  `conner/client-website/account/index.html` sends `x-dev-customer-id: 00000000-0000-4000-a000-000000000001` (Jose seed row) on every request. Matches the `CurrentCustomer()` decorator's dev stub. When passwordless auth lands, swap to a refresh-token-backed fetch wrapper and drop the dev header. Same swap needed everywhere else in client-website/ that talks to the commerce API.

- [2026-04-09] **Backfill `MealRecipe.linked_meal_id` for the 41 unlinked omnivore meals**
  `meals.seed.json` was patched 2026-04-09 with `linked_meal_id` after `diet_plan` on every row. Coverage: 44 of 88 omnivore meals (50%) now have a sibling pointer; the other 41 omnivore meals have no plant-based counterpart in the data, so a plant-based customer who deep-links to one of those 41 meals will fall through to the read-only view (state 3) instead of the gentle swap (state 2). To get the swap UX firing for ALL meat meals, walk those 41 unlinked rows in the culinary admin and pair them with their plant-based equivalents (or mark them as "no equivalent exists" if they're meat-only by design — e.g. a steak with no plant counterpart). Plant-Based meals are deliberately not given a `linked_meal_id` (one-directional schema). Source query: `SELECT meal_code, name FROM "MealRecipe" WHERE diet_plan_id = (SELECT id FROM "SystemTag" WHERE slug='omnivore') AND linked_meal_id IS NULL ORDER BY name;`

- [2026-04-09] **Phone + email change flows for the account hub**
  The customer info form shows a "Change email" link that currently just flashes an info banner. Needs: (a) magic-link flow using `CustomerAuthToken.type='email_change'`, (b) phone OTP flow using `type='phone_change'`, (c) a UI prompt that asks for the new address/number, fires the token, and polls for confirmation. Both flows exist in the commerce schema but are unwired.

- [2026-04-09] **`CustomerMarketingConsent` table for CASL compliance**
  Account hub has a disabled "Marketing email (coming soon)" toggle. Current `email_opt_in` + `sms_opt_in` are transactional-only. Canadian anti-spam law requires separate, explicit marketing consent with a proof-of-consent trail (when, where, IP). Dedicate a table when we're ready to start sending campaigns.

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
