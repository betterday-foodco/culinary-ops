# Coupon Module — Progress Log

**Last updated:** 2026-04-09
**Worktree:** `~/Downloads/culinary-ops-coupons/`
**Branch:** `conner/2026-04-09-coupons`
**Parent branch:** `conner/universal-brand-folder` (the integration branch)
**Owner:** Conner (with Claude chat assistance)

This is the canonical status doc for the commerce coupons module —
where we are, what's shipped, what's uncommitted, what's researched
but not built, and what the next moves are. Update this file as work
lands so the next chat doesn't have to reverse-engineer the state.

> **Don't edit this file as part of unrelated work.** Its purpose is a
> running log. When you finish a coupon work item, append a dated entry
> at the top of the "Change log" section at the bottom and update the
> status tables above it.

---

## 0. TL;DR

**The coupon backend validator engine is merged into the integration
branch with 26 passing tests; the admin frontend exists as a fully-
working HTML prototype in the real dashboard visual language; and a
dashboard style guide has been written so the prototype can be ported
to Next.js with clear rules.** The prototype, style guide, and a
worktree explainer are committed locally on the coupons branch but
not yet pushed.

---

## 1. Where to find everything

| Asset | Path | State |
|---|---|---|
| **Backend validator** | `backend/src/modules/commerce-coupons/coupon-validation.service.ts` | ✅ Merged into `conner/universal-brand-folder` (commit `cc751da`) |
| **Validator tests** | `backend/src/modules/commerce-coupons/coupon-validation.service.spec.ts` | ✅ Merged. 26 tests, all passing |
| **Module registration** | `backend/src/modules/commerce-coupons/commerce-coupons.module.ts` | ✅ Merged |
| **Jest infrastructure** | `backend/package.json` + `backend/package-lock.json` | ✅ Merged. First test infra in the entire backend |
| **Admin prototype** | `conner/coupon-admin-prototype.html` | 📝 Committed locally on feature branch, not pushed |
| **Dashboard style guide** | `conner/dashboard-style-guide.md` | 📝 Committed locally on feature branch, not pushed |
| **Worktree flow explainer** | `conner/worktree-flow-explainer.html` | 📝 Committed locally on feature branch, not pushed |
| **This progress log** | `conner/coupon-module-progress.md` | 📝 You're reading it |
| **Schema** | `backend/prisma/commerce/schema.prisma` | ✅ Already shipped in Migration 5 (`coupon_power_up`) |
| **Schema migration** | `backend/prisma/commerce/migrations/20260409060452_coupon_power_up/` | ✅ Already applied to Neon commerce dev branch |
| **Feature picker mockup** | `conner/coupon-features-picker.html` | ✅ Already on `main`. Design reference for which fields to surface |
| **DOTW scheduler mockup** | `conner/dotw-scheduler-mockup.html` | ✅ Already on `main`. Reference for the future DOTW calendar view |
| **Apply service** | `backend/src/modules/commerce-coupons/coupon-apply.service.ts` | ✅ Shipped — apply/remove/validate with stacking + TOCTOU |
| **Apply service tests** | `backend/src/modules/commerce-coupons/coupon-apply.service.spec.ts` | ✅ Shipped — 15 tests |
| **Controller** | `backend/src/modules/commerce-coupons/commerce-coupons.controller.ts` | ✅ Shipped — 3 endpoints |
| **Error messages** | `backend/src/modules/commerce-coupons/error-messages.ts` | ✅ Shipped — 26 error codes mapped |
| **DTOs** | `backend/src/modules/commerce-coupons/dto/apply-coupon.dto.ts` | ✅ Shipped — apply/remove/validate DTOs |
| **Next.js dashboard pages** | `frontend/app/(dashboard)/coupons/` | ❌ Doesn't exist yet. Next phase |

---

## 2. Phases — what's done and what's next

The roadmap comes from `project-scope/NEXT_UP.md` in the
betterday-foodco/collab repo. That doc is the canonical Phase 1 spec
for the coupon module.

### Phase 1 — Make coupons actually work at checkout

| Leaf | What | Status |
|---|---|---|
| **1. `CouponValidationService`** | Pure domain validator with 10 ordered rules | ✅ Shipped (`cc751da`) |
| **2. DOTW week match** | Rule 10 of the validator, already implemented | ✅ Shipped (part of `cc751da`) |
| **3. `POST /api/commerce/coupons/apply`** | Endpoint that calls the validator, persists `CustomerCoupon.status=applied`, handles stacking (last-one-wins), TOCTOU re-validation inside serializable transaction | ✅ Shipped |
| **4. `POST /api/commerce/coupons/remove`** | Endpoint that reverts `CustomerCoupon.status=available`, decrements `uses_count`, recalculates order totals | ✅ Shipped |
| **Bonus: `POST /api/commerce/coupons/validate`** | Preview-only validation — no mutations, returns savings preview + customer-facing error messages | ✅ Shipped |
| **Parallel: error-messages catalog** | `backend/src/modules/commerce-coupons/error-messages.ts` mapping all 26 validator error codes to warm customer-facing copy with placeholder interpolation | ✅ Shipped |

### Phase 2 preview — Admin CRUD (day 2-3)

- Backend: Coupon CRUD endpoints (list / create / read / update / archive)
- Frontend: Real admin list + create form at `/coupons` (using `conner/coupon-admin-prototype.html` as the design reference)

**Status:** the validator + admin prototype + style guide are ready;
the Next.js port hasn't started.

### Phase 3 preview — DOTW scheduler (day 3-4)

- Backend: DOTW-specific endpoints (thin wrapper over Coupon CRUD with locked presets)
- Frontend: Real scheduler UI at `/admin/dotw` matching `conner/dotw-scheduler-mockup.html`

### Phase 4 preview — Customer-facing coupon UX (day 4-5)

- Frontend: coupon input + applied chip on checkout page
- Frontend: clippable coupon cards on cart
- Frontend: "My coupons" tab in account hub

### Phase 5 preview — Reporting (week 2+)

- Backend: cohort analysis queries joining `Coupon ← CustomerCoupon ← Order ← Customer`
- Frontend: admin reporting dashboard
- Optional: coupon validation telemetry table

---

## 3. What shipped — backend (Phase 1 leaf 1)

### Commit

```
cc751da feat(commerce-coupons): add CouponValidationService + 10-rule validator engine
```

Merged into `conner/universal-brand-folder` via merge commit `8161d3e`.
Both the feature branch and the integration branch are pushed to
`origin`.

### The 10 validation rules

The validator checks these rules in order and short-circuits on the
first failure (friendlier UX: "expired" surfaces before "minimum not
met"):

1. **Code exists + `is_active`** — fails fast with `CODE_NOT_FOUND` or `INACTIVE`
2. **Date range** — `NOT_YET_ACTIVE` if `starts_at` is in the future, `EXPIRED` if `expires_at` is past
3. **Usage limits** — three sub-checks:
   - Global cap (`max_uses` vs `uses_count`) → `GLOBAL_LIMIT_REACHED`
   - Per-customer cap → `CUSTOMER_LIMIT_REACHED`
   - Per-household cap (best-effort raw street+zip match) → `HOUSEHOLD_LIMIT_REACHED`
4. **Order value thresholds** — `MIN_ORDER_NOT_MET` (with shortfall meta) or `MAX_ORDER_EXCEEDED`
5. **Product & category include/exclude** — 4 failure codes for the different scope violations
6. **Email allowlist / blocklist** — case-insensitive
7. **Customer segment** — tags, lifetime spend, member age, status, verified email, new-customers-only
8. **Subscription restriction** — `active_subscribers_only`, `new_subscribers_only`, `non_subscribers_only` gates
9. **Order count restrictions** — min and max prior-order counts
10. **DOTW delivery week match** — UTC calendar-day precise (the only rule unique to meal-prep subscriptions)

### Key design decisions baked in

- **Pure domain service, no mutations.** The validator does NOT touch
  `CustomerCoupon.status`. That's the job of the apply-coupon
  endpoint (Phase 1 leaf 3). Safe to call repeatedly with the same
  inputs.
- **Neutral `CouponValidationContext` input.** The validator does not
  take a `WeeklyCartRecord` or `CustomerOrder` directly — it takes a
  list of cart items + totals + customer id. This makes the same
  validator reusable for live checkout, admin preview tooling, and
  future auto-apply ranking.
- **Discriminated union return type.** `{ valid: true, coupon,
  savings }` or `{ valid: false, reason, meta }`. On success, the
  full coupon row (with tiers) is returned so callers can pipe it
  straight to the apply endpoint without re-querying.
- **Error messages NOT in the validator.** The `reason` + `meta`
  fields carry everything a UI needs, but the actual copy strings
  live in a future `error-messages.ts` catalog (Phase 1 parallel
  track). A downstream consumer maps `reason` → customer-facing copy.
- **Household limits behind a null-default flag.** Proper address
  normalization is a deferred item. Current implementation uses
  best-effort raw street + zip matching (case-insensitive) and skips
  entirely when `max_uses_per_household` is null.
- **Savings preview is a JS number, not a Decimal.** Authoritative
  write-time computation goes through Prisma Decimal arithmetic at
  apply time. The preview is for UI display and auto-apply scoring —
  both OK with JS number precision at cart-size amounts.
- **CouponTier override logic.** If a tier matches the cart subtotal,
  its `discount_type` + `discount_value` override the base coupon
  values. Highest matching tier wins (tiers are sorted by
  `sort_order` ascending).

### Tests — 26 passing in ~1.4s

File: `backend/src/modules/commerce-coupons/coupon-validation.service.spec.ts`

| Rule block | Failure cases | Success cases |
|---|---|---|
| Rule 1 — code exists + active | 2 (CODE_NOT_FOUND, INACTIVE) | — |
| Rule 2 — date range | 2 (NOT_YET_ACTIVE, EXPIRED) | — |
| Rule 3 — usage limits | 2 (global, per-customer) | — |
| Rule 4 — order value thresholds | 2 (MIN_ORDER_NOT_MET with shortfall meta, MAX_ORDER_EXCEEDED) | — |
| Rule 5 — product/category scope | 4 (PRODUCT_NOT_IN_CART, PRODUCT_EXCLUDED, CATEGORY_NOT_IN_CART, CATEGORY_EXCLUDED) | — |
| Rule 6 — email allow/block | 2 (NOT_ALLOWED, BLOCKED with case-insensitive match) | — |
| Rule 7 — customer segment | 3 (NEW_CUSTOMERS_ONLY, STATUS_NOT_TARGETED, EMAIL_NOT_VERIFIED) | — |
| Rule 8 — subscription restriction | 1 (REQUIRES_SUBSCRIPTION) | — |
| Rule 9 — order count | 1 (ORDER_COUNT_BELOW_MIN) | — |
| Rule 10 — DOTW week match | 1 (WRONG_DELIVERY_WEEK) | 1 (DOTW weeks match → applies) |
| Savings preview | — | 5 (percentage, max_discount cap, dollar clamp, tier override, code normalization) |
| **Total** | **20** | **6** |

All tests use a hand-rolled `jest.fn()` mock of `CommercePrismaService`
— no NestJS DI container, no real database, no `@nestjs/testing`
module. Keeps failures pointing at business logic, not test harness.

### Jest infrastructure — first tests in the backend

The commit also installed `jest@29` + `ts-jest@29` + `@types/jest@29`
as devDependencies and added a `"jest"` config block to
`backend/package.json`. Before this commit, the backend had zero
`.spec.ts` files and no test runner installed despite having
`"test": "jest"` in its scripts.

**Precedent worth noting for Gurleen:** any future backend test work
should follow this pattern (hand-rolled mocks, rootDir=src,
testRegex=`*.spec.ts`, ts-jest transform). Configured to match NestJS
CLI defaults.

### Known workaround: `strictNullChecks: false`

The backend's `tsconfig.json` has `strictNullChecks: false`, which
prevents TypeScript from narrowing the discriminated-union return type
via `if (result.valid)`. The tests work around this with
`expectFailure` / `expectSuccess` helpers that use explicit type
assertions. If `strictNullChecks` ever flips to `true`, the helpers
can simplify to the idiomatic narrow-and-return pattern. Tracked as
deferred item #1 below.

---

## 4. What's committed locally but not pushed — docs + prototypes

### Commit

```
a8b34a6 docs(coupons): add admin prototype, dashboard style guide, worktree explainer
```

Committed on `conner/2026-04-09-coupons`, 5-check audit passed, **NOT
yet pushed to origin**. The feature branch is 1 commit ahead of
`origin/conner/2026-04-09-coupons`.

### File 1 — `conner/coupon-admin-prototype.html` (1283 lines)

Interactive HTML mockup of the `/coupons` admin module. Built in the
**real dashboard visual language** (white cards, `brand-500` blues,
system sans-serif, the placeholder sidebar from style guide §15).

**Technology:** uses the Tailwind Play CDN with a config override
that mirrors `frontend/tailwind.config.ts`, so every class matches
what the real Next.js pages will use when we port. Play CDN prints a
not-for-production warning; that's fine for a mockup.

**Structure — three views:**

**View 1: List view (landing)**
- Page header with "+ New coupon" and "📅 DOTW Calendar" buttons
- Status pill filters (All / Active / Scheduled / Expired / Archived) with live counts
- Search + type filter + category filter toolbar
- Table: code · name · type · value · uses · status · ⋯
- Seeded with 7 canned coupons covering every status and type

**View 2: Type tile picker (after "+ New coupon")**
- Intro panel explaining the picker
- 4 tiles: Code discount / Automatic / DOTW / Welcome
- DOTW and Welcome tiles show "⚡ Preset included" badges and pre-fill fields when clicked

**View 3: 7-step accordion create form**
- Vertical connector line down the left rail with numbered circles
- Active step: brand-500 filled circle, card expanded
- Completed steps: green check circle, card collapsed with plain-English recap, click-to-edit
- Pending steps: gray-300 outline circle, card dimmed, non-interactive
- Each step has its own Continue + Back buttons

The 7 steps:
1. **Essentials** — code (auto-uppercase), internal name, customer-facing message
2. **Discount value** — type radio (percentage / dollar / free delivery) with the input group swapping $ vs % prefix; max discount cap below
3. **What it applies to** — product include/exclude, category include/exclude, "don't apply to sale items" checkbox
4. **Who can use it** — subscription restriction dropdown, first-time-customers toggle, require-verified-email toggle
5. **Limits** — min/max order value, global/per-customer/per-household usage caps
6. **Schedule** — starts_at / expires_at (+ DOTW delivery week if DOTW preset active)
7. **Review & publish** — stackable (defaults ON per policy), auto-apply, clippable; "Show advanced options" toggle reveals category, tags, custom error message; Publish CTA

**Sidebar — Summary + Test tool** (sticky on desktop):

📝 **Summary card** — live plain-English preview that updates on every
keystroke. Hero block at the top renders "Apply `CODE` for 10% off
orders over $50." Detail lines below for scope, who-can-use, usage
limits, schedule, stackability. Rewrites whenever any form field
changes.

🧪 **Test tool card** — simulates the validator against a fake cart:
- 4 customer profiles (new / returning / cancelled subscriber / unverified email)
- Editable cart line items (seed with 2, add/remove buttons)
- Delivery week date picker for DOTW tests
- Big Validate button that runs simplified validator logic and shows
  green "You save $X.XX" or red "❌ reason + detail" panel

**What's stubbed (intentionally, since this is a mockup):**
- No backend calls. State lives in JS globals, `SEED_COUPONS` in the script tag
- Publish clears back to the list view without persisting
- Row actions menu (⋯) shows a "coming in v2" toast
- DOTW Calendar button shows a "coming in v2" toast
- Edit view for existing coupons is out of scope — v1 prototype is create-only

### File 2 — `conner/dashboard-style-guide.md` (769 lines)

The **first written style guide** for `frontend/app/(dashboard)/`. The
dashboard has never had one — consistency across meals, ingredients,
sub-recipes, and menu-builder was pure copy-paste of Tailwind utility
strings. This extracts those strings into 17 sections.

**What's in it:**

| § | Title | Purpose |
|---|---|---|
| 1 | Vocabulary in one sentence | Elevator pitch: "Notion/Linear-adjacent, not BetterDay-branded" |
| 2 | Where the colors come from | Full `tailwind.config.ts` palette with explicit warning: dashboard brand colors are NOT the same hex values as `/brand/colors.json` |
| 3 | Fonts | "System defaults, no custom fonts" — the #1 thing that trips up anyone porting from the customer site |
| 4 | Layout primitives | `p-8` page padding, header flex pattern, section heading sizes |
| 5 | Tables | Full copy-paste pattern every list page uses, including loading + empty states |
| 6 | Buttons | Primary (`bg-brand-500`), secondary (outline), ghost (text-like), destructive variants with exact class strings |
| 7 | Form inputs | Text input, label, select, checkbox+label pair, error message |
| 8 | Filters + search toolbar | `flex gap-3 mb-6` pattern plus the "category pills" alternative from meals |
| 9 | Status chips | Neutral / success / warning / error / info variants |
| 10 | Modals | Full pattern: backdrop, card, three sections, button ordering |
| 11 | Spacing scale cheat sheet | Which padding/gap/radius to use when |
| 12 | Things to NOT do | 9 explicit anti-patterns including "don't import `/brand/tokens.css`" and "don't use `var(--brand-navy)`" |
| 13 | When to break the rules | Escape hatch with instructions to document any new pattern |
| 14 | Reference pages to copy from | Table pointing at `ingredients/page.tsx`, `meals/page.tsx`, `sub-recipes/page.tsx`, `layout.tsx` |
| 15 | **Placeholder sidebar** | Full copy-paste HTML + 7 explicit rules for building prototypes that look like dashboard pages |
| 16 | **Tailwind Play CDN for prototypes** | Exact config override to match `frontend/tailwind.config.ts`, with caveats |
| 17 | Maintenance | When to update, when to split |

Explicitly flags the **two style systems in this repo**:
- `/brand/` (customer-site only) — used by `conner/client-website/`, HTML prototypes
- `frontend/` (dashboard only) — used by Gurleen's admin pages

And warns that importing `brand/tokens.css` into dashboard pages will
break them (loads customer-site fonts, overrides `body` styles).

### File 3 — `conner/worktree-flow-explainer.html` (812 lines)

Interactive 11-step visual walkthrough built earlier in the session
when the "how does merging worktrees work?" question came up.

**What it shows:**
- All 8 real worktrees as cards at the top (from `git worktree list`)
- A "GitHub origin" cloud panel on the right showing remote branches
- Narration box in the middle with step title, description, command, notes
- Prev / Next / Reset buttons plus clickable step dots
- Hashes flash green when they change, error bubbles appear when git refuses checkout in the wrong worktree

**The 11 steps walk through exactly what happened in this session:**
1. The 8 worktrees
2. Shared storage, separate HEADs (the Google Docs metaphor)
3. Start working in the coupons worktree
4. `git commit` → `cc751da` lands locally
5. `git push -u origin` → `cc751da` appears on GitHub
6. Try to merge from coupons worktree → red error bubble (git refuses)
7. Switch to main worktree
8. `git fetch origin`
9. `git merge --no-ff` → `8161d3e` merge commit appears
10. Push merge to origin
11. The payoff — shared history everywhere

**Uses `brand/tokens.css`** (customer-site visual language) because it
predates the dashboard-style-guide decision and because as a
standalone explainer it doesn't need to match the dashboard.

---

## 5. Research — what's been learned but not yet captured in code

### Best practices across 6 e-commerce platforms

Deep-dive research done on Shopify, Stripe, Voucherify, Klaviyo,
Recharge, and BigCommerce admin coupon UIs. Key findings:

| Pattern | Source | Adopted? |
|---|---|---|
| Status-first list view with tabs | All 6 platforms | ✅ In prototype |
| Pick discount TYPE first, before opening the form | Shopify | ✅ In prototype (4 tiles) |
| Flat sections in a fixed order, not wizards | Shopify | ✅ In prototype (7 steps) |
| Live plain-English summary | Shopify | ✅ In prototype (sidebar) |
| Inline test-against-cart tool | Shopify + Stripe | ✅ In prototype (sidebar) |
| Campaign calendar view | Voucherify | ⏭️ Deferred to v2 — DOTW-only for us |
| Presets / templates | Voucherify | ✅ In prototype (2 tiles have presets) |
| Duplicate as a row action | All 6 | ⏭️ Deferred to v2 |
| Archive-not-delete default | All 6 | ✅ In prototype |
| Per-row performance metrics | Voucherify, Shopify | ⏭️ Blocked — no redemption data yet |
| Tiered discount "ladder editor" | Recharge | ⏭️ Deferred to v2 — schema supports it |
| Two-tier Coupon/PromotionCode model | Stripe | ❌ Not adopted — single-tier is simpler for us |
| Rules-engine (condition + action) | BigCommerce | ❌ Not adopted — we use opinionated type + value + flags |

### Three "killer features" identified

Out of everything researched, these punch above their weight and
shipped in the prototype:

1. **Type-first landing page (Shopify).** Before the create form, 4
   big tiles. Each tile opens a differently-shaped form tailored to
   that type. Eliminates the "wall of 42 fields" problem before it
   starts. DOTW and Welcome tiles use presets that pre-fill fields.

2. **Live summary section (Shopify).** Updates on every keystroke.
   Rewrites form state in customer-speak. Most trust-building feature
   in the whole form.

3. **Campaign Calendar for DOTWs only (Voucherify-inspired).** A
   month grid showing which delivery week has a DOTW scheduled, with
   click-to-edit. This matches the existing
   `conner/dotw-scheduler-mockup.html` reference. For v1 the button
   is stubbed as "coming soon." Full build in v2.

### BetterDay-specific concepts not covered by any platform

The schema has 4 concepts most e-commerce platforms don't treat as
first-class:

1. **DOTW week binding (`delivery_week_sunday`)** — unique to weekly-
   menu meal prep. Deserves its own admin flow (the DOTW scheduler
   mockup already sketched this), separate from the generic coupon
   form.
2. **Subscription-restriction gates** (`active_subscribers_only`,
   `new_subscribers_only`, `non_subscribers_only`) — critical for a
   subscription business, partially covered by Recharge.
3. **`CouponTier`** — "spend $50 → 10%, spend $100 → 20%" as one
   object with tier rows. Recharge does this too; most platforms
   force you to create three separate coupons.
4. **Stackable defaults ON** — opposite of industry default. Per the
   `project_coupon_stacking_policy` memory, coupons stack on
   subscription discounts to incentivize sign-ups. The UI defaults
   the checkbox to ON and the summary sidebar explains it.

---

## 6. Deferred items — track these before they vanish

All ten of these should eventually land in `conner/deferred-decisions.md`
under the appropriate section (edge cases / design decisions /
implementation TODOs / future ideas). Listed here first so the next
chat can copy them over in a single pass.

### Implementation TODOs

1. **Phase 1 leaves 3 + 4 — apply/remove coupon endpoints**
   `POST /api/cart/apply-coupon` and `POST /api/cart/remove-coupon`.
   Both call the existing `CouponValidationService`. Apply persists
   `CustomerCoupon.status=applied` + `applied_at=now()`. Remove
   reverts to `available`, clears `applied_at`, recomputes cart.
   **Blocker:** none. Validator is ready.

2. **Backend error-messages catalog**
   `backend/src/commerce/coupons/error-messages.ts` mapping validator
   error codes (from the discriminated union) to warm, action-oriented
   copy in BetterDay voice. Single source of truth for all validation
   failures. Optional HTML preview tool
   (`coupon-error-catalog.html`) to preview and edit the copy visually
   before wiring into the backend.

3. **Next.js port of the admin prototype**
   Build real `frontend/app/(dashboard)/coupons/page.tsx`,
   `frontend/app/(dashboard)/coupons/new/page.tsx`, and a backend
   `POST /api/commerce/coupons/validate` endpoint that wraps
   `CouponValidationService`. Style guide §15 + the prototype HTML
   are the template. Add "Coupons" entry to the sidebar nav in
   `frontend/app/(dashboard)/layout.tsx`.

4. **Fix `strictNullChecks: false` in `backend/tsconfig.json`**
   Low-priority quality-of-life. Flipping to `true` lets the validator
   tests simplify their helpers from explicit casts to idiomatic
   discriminated-union narrowing. Might reveal other null-safety bugs
   elsewhere in the backend; worth running `npx tsc --noEmit` after
   the flip.

5. **Add `postinstall` hook for `prisma generate` in `backend/package.json`**
   Currently `npm install` wipes the commerce Prisma client from
   `node_modules/@prisma/commerce-client` and you have to manually
   regenerate it. This bit the validator build mid-session. Add
   `"postinstall": "prisma generate --schema=prisma/schema.prisma && prisma generate --schema=prisma/commerce/schema.prisma"`.

6. **Admin edit view `/coupons/[id]`**
   V1 prototype is create-only. The edit page should reuse the 7-step
   form component with fields pre-populated. Backend needs `PATCH
   /api/commerce/coupons/:id`. ~20% more code than create.

7. **Row actions menu (⋯) in the list view**
   Currently stubbed to a toast. Should expose: Edit, Duplicate (clone
   into a fresh create form with a `-COPY` suffix on the code),
   Archive (set `is_active=false`), Hard delete (admin-only, typed-
   confirmation).

### Design decisions pending

8. **DOTW scheduler access control**
   Should DOTW management be accessible to a restricted role (e.g.
   "Operations" or "Culinary") that can only touch DOTWs + menu
   planning, without seeing full coupon admin or customer PII? Worth
   resolving before the admin UI ships. Not urgent for the schema.
   Voucherify's four-role model is a reference pattern.

9. **Coupon performance reporting**
   Admin dashboard joining `Coupon ← CustomerCoupon ← Order ← Customer`
   for redemptions, revenue, LTV, retention. Blocked on having real
   redemption data. Phase 5 scope.

### Future ideas

10. **Bulk unique code generation**
    Generate 1,000 single-use codes from one template for a
    partnership or giveaway. Would need a `parent_coupon_id` schema
    addition linking child coupons to a parent template. Not urgent.

11. **Tier editor + BOGO editor + attached-product editor**
    Our schema supports `CouponTier`, BOGO fields (`buy_qty`,
    `get_qty`, `get_discount_pct`), and `CouponAttachedProduct`, but
    the v1 prototype doesn't have UI for any of them. The editors are
    collapsed inside "advanced" options. Build when a campaign needs
    them.

12. **DOTW Calendar view**
    Month grid showing which weeks have scheduled DOTWs. Matches
    `conner/dotw-scheduler-mockup.html`. Referenced as "v2" in the
    prototype's header button.

---

## 7. Dev servers

| Port | Process | Worktree | Notes |
|---|---|---|---|
| `:3000` frontend | Next.js | `~/Downloads/culinary-ops/frontend` (main) | Started fresh mid-session after the original died. On `conner/universal-brand-folder`. |
| `:3001` backend | NestJS | `~/Downloads/culinary-ops-client-profile/backend` (another chat's worktree) | Serves the client-profile chat's branch. Shares the Neon DB so the frontend at `:3000` can still talk to it, but **does not have the commerce-coupons module loaded** because that branch is behind `conner/universal-brand-folder`. |

**To actually exercise the validator from the live dashboard**, the
backend needs to be restarted from `~/Downloads/culinary-ops/backend`
(or the client-profile chat needs to pull the integration branch).
Not blocking the Next.js port — the port work can happen against the
existing backend as long as nothing calls the unshipped `/validate`
endpoint yet.

### Commands to start the dev servers from your main folder

**Frontend (from a Terminal window):**

```bash
cd ~/Downloads/culinary-ops/frontend
npm run dev
```

Wait for `✓ Ready in X.Xs`, then `http://localhost:3000`.

**Backend (from a separate Terminal window):**

```bash
# ONLY if you want to replace the client-profile chat's backend on :3001
# First, stop whatever's on :3001:
lsof -iTCP:3001 -sTCP:LISTEN   # find the PID
kill <PID>                      # stop it

# Then start the main folder's backend:
cd ~/Downloads/culinary-ops/backend
npm run start:dev
```

Wait for `Nest application successfully started`, then the validator
becomes callable (once Phase 1 leaves 3 + 4 ship).

---

## 8. Git state — exact hashes

### On `origin`

```
conner/2026-04-09-coupons               → cc751da (behind local by 1)
conner/universal-brand-folder           → 8161d3e (merge of cc751da)
```

### On local in `~/Downloads/culinary-ops-coupons/`

```
conner/2026-04-09-coupons               → a8b34a6 (+1 ahead of origin)
```

### Commits on the feature branch, most recent first

| Hash | Subject | Pushed? | Merged? |
|---|---|---|---|
| `a8b34a6` | docs(coupons): add admin prototype, dashboard style guide, worktree explainer | ❌ | ❌ |
| `cc751da` | feat(commerce-coupons): add CouponValidationService + 10-rule validator engine | ✅ | ✅ (via `8161d3e`) |

### 5-check audit status for `a8b34a6`

All 5 passed when run during commit:

1. ✅ Current branch: `conner/2026-04-09-coupons`
2. ✅ 1 new commit, all intended
3. ✅ 3 files touched, all under `conner/`, zero scope bleed
4. ✅ Authored by Conner Kadziolka
5. ✅ Working tree clean, no secrets

---

## 9. Next moves — ranked by impact

### Option A — Push `a8b34a6` and merge into integration branch

Quickest win. The commit is already clean and audit-passed. Push,
switch to main worktree, fetch, merge with `--no-ff`, push the merge.
Same pattern as the validator commit earlier in the session. **~5
minutes.**

### Option B — Start the Next.js port

Build the real `/coupons` pages in `frontend/app/(dashboard)/coupons/`
using the style guide §14 reference pages + the HTML prototype as
templates. Scope:

- `frontend/app/(dashboard)/coupons/page.tsx` — list view (port from the HTML)
- `frontend/app/(dashboard)/coupons/new/page.tsx` — create form (7 steps, live summary, test tool)
- `backend/src/modules/commerce-coupons/coupon-admin.service.ts` — list + create + archive service
- `backend/src/modules/commerce-coupons/commerce-coupons.controller.ts` — REST routes including `POST /validate`
- DTOs for create + validate
- Wire the module to load the controller
- Add `Coupons` entry to the dashboard sidebar nav

**Estimated size:** 6-8 backend files, 4-5 frontend files. Biggest
investment of the available options.

### Option C — Ship Phase 1 leaves 3 + 4

`POST /api/cart/apply-coupon` and `POST /api/cart/remove-coupon`.
Calls the existing validator, persists `CustomerCoupon.status`
transitions. No frontend work. **Completes the backend side of Phase 1.**
~4-5 new backend files. Smaller and more focused than Option B.

### Option D — Append deferred items to `conner/deferred-decisions.md`

Copy the 12 deferred items from §6 of this document into the real
deferred-decisions file, grouped by section. Small ~15 min job but
locks the decisions into the permanent log so they don't get lost if
this progress file gets out of date.

### Option E — Do nothing, stop here

Solid session stopping point. The validator is shipped on the
integration branch, the design direction is locked in via the
prototype, the style guide gives future chats a template, and
everything is audit-clean. Next session can pick up from any of A-D
based on what's hot at that moment.

---

## 10. Change log

### 2026-04-09 — Phase 1 complete (apply/remove/validate + error messages)

- Shipped Phase 1 leaves 3 + 4 + bonus validate endpoint
- Created `coupon-apply.service.ts` — apply/remove/validatePreview with:
  - **Last-one-wins stacking**: non-stackable coupons replace the previous one
  - **Manual beats auto**: manual codes always displace auto-applied coupons
  - **Subscription discounts are a separate lane**: coupons always stack on top
  - **TOCTOU protection**: re-validates inside a serializable transaction
  - **Global limit race fix**: uses_count increment is atomic inside the transaction
  - **Order total recalculation**: recalculates code_discount + total after apply/remove
- Created `commerce-coupons.controller.ts` — 3 endpoints:
  - `POST /api/commerce/coupons/apply` — mutating, returns success or structured error
  - `POST /api/commerce/coupons/remove` — mutating, reverts coupon + decrements count
  - `POST /api/commerce/coupons/validate` — preview-only, safe to call repeatedly
- Created `error-messages.ts` — customer-facing copy for all 26 error codes with
  placeholder interpolation ({shortfall}, {required}, {startsAt}, etc.)
- Created `dto/apply-coupon.dto.ts` — input validation with class-validator
- Updated `commerce-coupons.module.ts` — registered controller + apply service
- Created `coupon-apply.service.spec.ts` — 15 tests covering:
  - Apply: happy path, validation failure, missing order, wrong customer, locked order
  - Stacking: last-one-wins displacement, stackable coexistence
  - TOCTOU: deactivated, expired, limit-hit between validate and apply
  - Remove: happy path, not-found, locked order
  - Validate preview: savings preview, error messages with meta interpolation
- **Total test count: 41 (26 validator + 15 apply service), all passing in ~1.6s**

### 2026-04-09 — initial build

- Created `conner/2026-04-09-coupons` worktree off `conner/universal-brand-folder`
- Shipped `cc751da feat(commerce-coupons): add CouponValidationService + 10-rule validator engine` — merged via `8161d3e` into `conner/universal-brand-folder` and pushed to `origin`
- Installed jest + ts-jest + @types/jest as first backend test infra
- Ran deep research across Shopify / Stripe / Voucherify / Klaviyo / Recharge / BigCommerce for coupon admin UX patterns
- Built `conner/coupon-admin-prototype.html` v1 in customer-site visual language (cream/Gaya/navy/accordion)
- User flagged the visual mismatch → restyled v2 in real dashboard language (white/brand-500/system sans/Tailwind Play CDN)
- Wrote `conner/dashboard-style-guide.md` — first written style guide for `frontend/app/(dashboard)/`, 17 sections
- Built `conner/worktree-flow-explainer.html` — 11-step interactive walkthrough of multi-worktree commit/push/merge flow
- Committed all three as `a8b34a6 docs(coupons): ...` locally, 5-check audit passed, NOT pushed yet
- Wrote this progress log (`conner/coupon-module-progress.md`)

*(Append new entries above this line as dated sub-headings.)*
