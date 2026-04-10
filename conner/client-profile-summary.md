# BetterDay Customer Profile — Project Summary
## Schema + API + UI wiring across commerce, brand, and client-website
_Feed to a new chat session to pick up where this one left off._

**Branch:** `conner/2026-04-09-client-profile-data-model`
**Worktree:** `~/Downloads/culinary-ops-client-profile/`
**Integration target:** `conner/universal-brand-folder` (10 commits ahead as of this doc)
**Last updated:** 2026-04-09 by the client-profile chat after shipping wiring commits #1–#4

---

## Quick Context

### What this project is
Build the customer-facing **account hub** on the BetterDay client website (`conner/client-website/account/`) so it is fully wired to the real commerce-customers backend — every field reads from `GET /api/commerce/customers/me` on load and saves back via targeted PATCH endpoints. The hub is a port of `conner/app/subscriber-hub-2.0.html` (5,334-line prototype) landed on `universal-brand-folder` via a parallel chat, and this chat consumes that port + adds the wiring.

### What the chat was NOT supposed to do
- Touch Gurleen's `backend/src/modules/meals/`, `tags/`, `import-*`, or `backend/prisma/schema.prisma` files
- Rewrite subscriber-hub-2.0 from scratch (the parallel chat owned that)
- Ship address or payment UI before the profile data model was settled

### The audience / ownership model that emerged
- **Backend identifiers / database values** use the canonical short names: `Omnivore`, `Vegan`
- **Customer-facing labels** use warmer brand copy: `Meat & Plants`, `Plants Only`
- The two are linked by a small translation map (`DIET_LABELS` in `menu/index.html`, `DIET_PLAN_STATE.labels` in `account/index.html`) seeded from `brand/site-info.seed.json`
- **Rebrand paths**: edit `public.diet.labels.omnivore` / `public.diet.labels.vegan` in the brand seed — no code changes, no DB migration

---

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│ CULINARY DB (rapid-lake-47793035)    COMMERCE DB (spring-fire)  │
│  ├─ SystemTag (type='diets')          ├─ Customer                │
│  │   ├─ Omnivore  fc0a70f3…           │   ├─ diet_plan_id  ← FK  │
│  │   └─ Vegan     9c68ba40…           │   │     by-convention    │
│  ├─ MealRecipe                        │   │     (no Prisma rel)  │
│  │   ├─ diet_plan = 'Omnivore'        │   ├─ allergens[]         │
│  │   ├─ diet_plan = 'Vegan'           │   ├─ diet_tags[]         │
│  │   └─ linked_meal_id (one-direction │   ├─ disliked_meals[]    │
│  │        omnivore→vegan sibling)     │   └─ favorite_meals[]    │
│  └─ (Gurleen's territory)             ├─ CustomerAddress         │
│                                        ├─ PaymentMethod          │
│                                        └─ CustomerSubscription   │
└─────────────────────────────────────────────────────────────────┘
                            ▲
                            │  cross-DB validation
                            │  (service layer only —
                            │   Postgres can't enforce)
                            │
┌─────────────────────────────────────────────────────────────────┐
│ NestJS COMMERCE-CUSTOMERS MODULE                                │
│  12 endpoints under /api/commerce/customers/me                  │
│    GET    /me                        (full profile + addrs + …) │
│    PATCH  /me                        (first/last/phone/birthday)│
│    PATCH  /me/preferences            (diet_plan_id + arrays)    │
│    PATCH  /me/notifications          (sms/email opt-in)         │
│    GET    /me/addresses              (list)                     │
│    POST   /me/addresses              (create)                   │
│    PATCH  /me/addresses/:id          (update)                   │
│    DELETE /me/addresses/:id          (delete)                   │
│    POST   /me/addresses/:id/default  (set default)              │
│    GET    /me/payment-methods        (list)                     │
│    DELETE /me/payment-methods/:id    (remove)                   │
│    POST   /me/payment-methods/:id/default (set default)         │
│                                                                 │
│  Auth: x-dev-customer-id header (Jose seed UUID) until real     │
│        passwordless auth lands                                  │
│  Validation: CommercePrismaService + CulinaryPrismaService      │
│              injected side-by-side in CommerceCustomersService  │
└─────────────────────────────────────────────────────────────────┘
                            ▲
                            │  fetch() with dev header
                            │
┌─────────────────────────────────────────────────────────────────┐
│ client-website/account/index.html  (5,334-line ported hub)      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Tab: My Subscription  (unchanged prototype data)        │    │
│  │ Tab: Customer Info    ← THIS chat wired all of this     │    │
│  │  ├─ Personal Information  ✅ Load + Save                │    │
│  │  ├─ Contact Details       ✅ Load + Save + SMS toggle   │    │
│  │  ├─ Diet Plan (NEW card)  ✅ Load + Save on click       │    │
│  │  └─ Allergies & Prefs     ✅ Load + Save via button     │    │
│  │ Tab: Address & Billing    🔲 Not wired yet (commits 5-8)│    │
│  │ Tab: Order History        🔲 Unchanged prototype        │    │
│  │ Tab: Discounts            🔲 Unchanged prototype        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│ client-website/menu/index.html  (diet lock + cart safety)       │
│  ├─ resolveDietLock() — URL / localStorage / /me fetch          │
│  ├─ Fail-closed grid filter                                     │
│  ├─ Fail-closed cart rollups (getDietSafeMeals helper)          │
│  ├─ 3-state meal detail modal (normal / swap / read-only)       │
│  └─ ?meal=<code> deep-link auto-open                            │
│                                                                 │
│ client-website/onboarding/index.html  (diet picker)             │
│  └─ Meat & Plants / Plants Only cards → redirect to menu        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Commit-by-commit history of this branch

The branch has **10 commits ahead of** `conner/universal-brand-folder`. Each commit is independently testable, independently revertable, and has a comprehensive message explaining its scope and non-scope.

### Phase 1 — Schema + core safety (commits 1-3, pre-merge)

| Commit | Scope | Files |
|---|---|---|
| `a2ac2f5` | **`feat(commerce): add Customer.diet_plan_id with cross-DB validation`** — New nullable String column on commerce Customer, migration #6 (`20260409153741_add_customer_diet_plan`), DTO addition, cross-DB validation via `CulinaryPrismaService.systemTag.findFirst({ id, type: 'diets' })`. Applied to `betterday-commerce/dev` Neon branch via `mcp__neon__run_sql_transaction`. | `backend/prisma/commerce/schema.prisma`, DTO, service, migration SQL |
| `6193ca9` | **`feat(client-website): account hub + fail-closed menu diet lock`** — Built a standalone 1,134-line `account/index.html` (later superseded by the subscriber-hub-2.0 port — file path reused but content replaced at the merge). Added the menu page's `resolveDietLock()` + grid filter + banner. Added `brand/site-info.seed.json` keys for the diet plan UUIDs. | `account/index.html`, `menu/index.html`, `brand/site-info.seed.json` |
| `a82c803` | **`feat(menu): meal detail diet routing + sibling-swap UX + ?meal deep-link`** — Three-state meal modal (normal / gentle swap / read-only), `?meal=<code>` URL auto-open, `meals.seed.json` patched with `linked_meal_id` (44 of 88 omnivore meals have a Vegan sibling). | `menu/index.html`, `meals.seed.json` |

### Phase 2 — Safety fix + integration (commits 4-5)

| Commit | Scope | Files |
|---|---|---|
| `bf579af` | **`fix(menu): close diet-lock bypass in renderGrid + thread getDietSafeMeals through cart rollups`** — Two real bugs. Bug 1: `renderGrid()` had a micro-optimization that skipped `getFilteredMeals()` when no user filter was active, bypassing the diet lock. Bug 2: `getCartMeals() / getTotalItems() / getSubtotal()` iterated raw `allMeals` instead of diet-safe meals, so a meat meal that slipped into qty>0 would show in the cart sidebar + count toward the delivery threshold + be charged at checkout. Fix: introduced `getDietSafeMeals()` helper, threaded it through every numeric rollup. | `menu/index.html` |
| `a20e903` | **Merge commit** — `conner/universal-brand-folder` → this branch. Brought in the 5,334-line `account/index.html` port from the parallel subscriber-hub-v2 chat (superseding the standalone hub from commit `6193ca9`), the `CouponValidationService` backend module (from the coupons chat), and 5 related subscriber-hub cleanups. Conflict resolutions: `account/index.html` → took theirs unconditionally (the port is the canonical customer profile); `deferred-decisions.md` → combined both sides additively (13 open Implementation TODOs total). | Merge of 8 incoming commits |

### Phase 3 — Terminology rename (commit 6)

| Commit | Scope | Files |
|---|---|---|
| `5cca53e` | **`refactor(diet-plan): rename Plant-Based → Vegan (backend) + Plants Only (customer label)`** — Split-label rename. **Backend / database / code / comments** all use the canonical `Vegan`. **Customer-facing labels** use `Plants Only` (and later `Meat & Plants` for Omnivore — see commit `1c5d9ff`). Single source of truth for labels lives in `brand/site-info.seed.json` keys `public.diet.labels.omnivore` + `public.diet.labels.vegan`. **Database rename executed via `mcp__neon__run_sql_transaction`** against `conner-local-dev` Neon branch — SystemTag row renamed in place (UUID preserved), MealRecipe.diet_plan backfilled on 67 rows. | `brand/site-info.seed.json`, `menu/index.html`, `meals.seed.json`, `onboarding/index.html`, backend DTO + schema comments, `deferred-decisions.md`; DB: 1 UPDATE on SystemTag + 1 UPDATE on MealRecipe |

### Phase 4 — Account hub wiring (commits 7-10)

These are the "8-commit wiring sequence" the chat planned — 4 of 8 shipped so far.

| # | Commit | Scope |
|---|---|---|
| 1/8 | `99c259c` | **`wire(account): add api() helper + loadProfile() populates Personal + Contact cards`** — New `COMMERCE API WIRING` block added after the auth gate. `API_BASE`, `DEV_CUSTOMER_ID`, `api(path, opts)` async wrapper, `loadProfile()`, `setField()` helper. Fires `GET /me` at page load (first line of existing `DOMContentLoaded`). Updates firstName/lastName/birthday/email/phone/avatar/SMS toggle from the response. Fail-safe: silent `console.warn` if backend is down, hardcoded fallback values remain visible. 135 insertions, 0 deletions. Pure additive. |
| 2/8 | `5ff364e` | **`wire(account): saveProfile + saveContact + toggleSms → real PATCH calls`** — Converts 3 toast-and-forget stubs into real async API calls. `saveProfile()` → `PATCH /me` with `{first_name, last_name, birthday}`. `saveContact()` → `PATCH /me` with `{phone}`; email change detected and shown as "coming soon" info toast + field reverted. `toggleSms()` → `PATCH /me/notifications` with optimistic update + revert on error. All three re-render from server response (authoritative). Save buttons disabled during PATCH to prevent double-clicks. 147 insertions, 23 deletions. |
| 3/8 | `1c5d9ff` | **`wire(account): Diet Plan radio card (Meat & Plants / Plants Only) + customer-label rename`** — New Diet Plan card inserted in panel-info between the Personal/Contact grid and the Allergies & Preferences card. Two big pill-buttons (`.diet-plan-pill`) with emoji + label + subtext + check-mark-when-selected. Click-to-commit UX (no Save button) via `selectDietPlan(planKey)` → optimistic update → `PATCH /me/preferences` with `{diet_plan_id: <uuid>}` → revert on error. `DIET_PLAN_STATE` module-level object holds `omnivoreId`, `veganId`, `labels`, `current`. `loadProfile()` extended to fetch `brand/site-info.seed.json` in parallel with `/me` via `Promise.all`. ALSO the `Omnivore → Meat & Plants` customer-label change: `brand/site-info.seed.json`, `onboarding/index.html` card title, `menu/index.html` `DIET_LABELS` fallback. 234 insertions, 23 deletions across 4 files. |
| 4/8 | `cea5620` | **`wire(account): split chip group into allergens + diet_tags sub-sections + real savePreferences`** — Restructured the flat 10-chip group into two labelled sub-sections (`#allergenChipsWrap` with 6 red chips + `#dietTagChipsWrap` with 2 blue chips). Removed the `Vegan` chip (now the radio above) and the `Vegetarian` chip (it'll be an auto-computed filter tag via the rule-based tag generator later). `toggleChip()` simplified from 5-line switch to 4-line type-based mapping. `applyChipState()` helper reads `userData.allergens` + `userData.dietTags` and stamps each chip's active class. `savePreferences()` rewired from stub to real `PATCH /me/preferences` with `{allergens, diet_tags}` — re-renders from server response, preserves the prototype's button-morph "Saved" animation. `loadProfile()` extended to sync chip state on load. 135 insertions, 32 deletions. |

---

## What works end-to-end right now

Backend is running from this worktree on **PID 94759** (`culinary-ops-client-profile/backend/dist/src/main`). Python http.server is running from this worktree on port **8000** (PID 89023). Both verified via `lsof`.

### Verified via curl against the live backend

| Endpoint | Method | Status |
|---|---|---|
| `/commerce/customers/me` | GET | ✅ HTTP 200, returns full profile with `diet_plan_id` |
| `/commerce/customers/me` | PATCH | ✅ `first_name` / `last_name` / `phone` / `birthday` accepted |
| `/commerce/customers/me/preferences` | PATCH | ✅ `diet_plan_id` cross-DB validated, `allergens` + `diet_tags` arrays REPLACED |
| `/commerce/customers/me/notifications` | PATCH | ✅ `sms_opt_in` / `email_opt_in` accepted |
| `/commerce/customers/me/addresses` | GET | ✅ returns array (not wired in UI yet) |
| `/commerce/customers/me/payment-methods` | GET | ✅ returns array (not wired in UI yet) |

### Verified in the browser by the user

- **Commit #1** (loadProfile): real Jose Ramirez data loads into the Personal Info + Contact Details cards
- **Commit #3** (Diet Plan radio): clicking a pill writes to `Customer.diet_plan_id`, persistence across refresh confirmed, cascade to the menu page's diet lock verified

### The cascade demonstration (verified 2026-04-09)

1. Customer clicks "Plants Only" pill in the account hub Diet Plan card
2. `selectDietPlan('vegan')` fires → `PATCH /me/preferences` with `{diet_plan_id: "9c68ba40-…"}`
3. NestJS `CommerceCustomersService.updatePreferences` validates the UUID against `culinary.SystemTag` cross-DB
4. Commerce Postgres `UPDATE "Customer" SET diet_plan_id = '9c68ba40-…' WHERE id = ...`
5. Response flows back; chip states re-render from authoritative server data
6. (Open menu page in new tab or refresh) → `resolveDietLock()` fetches `/me` → reads new `diet_plan_id` → activates `dietLock = 'Vegan'`
7. Green sticky banner injects at the top: `"🌱 You're on Plants Only — meat dishes are hidden for your plan"`
8. Grid filters to Vegan meals only (via `getFilteredMeals()` fail-closed filter)
9. Cart sidebar + subtotal + delivery counter also filter via `getDietSafeMeals()` (layer-2 safety)
10. Click back to "Meat & Plants" in the account hub → lock disables on next menu page load

---

## Key files changed (with line counts)

### Created / rewritten
| File | Lines | Role |
|---|---|---|
| `conner/client-website/account/index.html` | 5,334 → ~5,850 after wiring | Subscriber hub port + this chat's wiring additions |
| `backend/prisma/commerce/migrations/20260409153741_add_customer_diet_plan/migration.sql` | ~15 | Migration #6 — adds `Customer.diet_plan_id` column + index |

### Modified
| File | Role |
|---|---|
| `backend/prisma/commerce/schema.prisma` | Added `diet_plan_id` field + terminology comment block |
| `backend/src/modules/commerce-customers/dto/profile.dto.ts` | Added `diet_plan_id` to `UpdatePreferencesDto` + Vegan/Plants Only terminology comment |
| `backend/src/modules/commerce-customers/commerce-customers.service.ts` | `updatePreferences()` cross-DB validation against culinary `SystemTag` |
| `brand/site-info.seed.json` | Added `public.diet.omnivoreId`, `public.diet.veganId`, `public.diet.labels.omnivore = "Meat & Plants"`, `public.diet.labels.vegan = "Plants Only"` |
| `conner/client-website/menu/index.html` | Diet lock state machine, 3-state modal, cart-safety helper, `DIET_LABELS` map, ?meal deep-link |
| `conner/client-website/menu/meals.seed.json` | Patched 66 rows with `linked_meal_id` + renamed `diet_plan` Plant-Based→Vegan |
| `conner/client-website/onboarding/index.html` | Picker card title Omnivore→Meat & Plants, vegan button→`selectDiet('plants')` |
| `conner/deferred-decisions.md` | 9 new entries documenting deferred work and resolved items |

### Deliberately NOT touched (Gurleen's territory per CLAUDE.md §8)
- `backend/src/modules/meals/**` (meals service, DTO, controller)
- `backend/src/modules/tags/**` — note: `tags.service.ts:96` still seeds a row named `'Plant-Based Plan'` which would **conflict with the renamed Vegan row** on a fresh DB boot; flagged as urgent for Gurleen's next chat
- `backend/prisma/schema.prisma` (culinary schema)
- `backend/prisma/import-data.ts`, `import-all-meals.js`
- All historical migration SQL files (immutable after commit — Prisma hash drift)

---

## Database state

### `conner-local-dev` branch (culinary, `br-little-hall-aeffmfdm`)

| Table | Change | Method |
|---|---|---|
| `SystemTag` where `id = 9c68ba40-f59d-40a8-8210-bdc1f3cd3973` | `name` Plant-Based→Vegan, `slug` plant-based→vegan (UUID preserved) | `mcp__neon__run_sql_transaction` |
| `MealRecipe.diet_plan` | 67 rows backfilled Plant-Based→Vegan | same transaction |

Post-change counts verified via MCP: `92 Omnivore + 67 Vegan = 159 meals total`.

### `betterday-commerce/dev` branch (commerce, `br-icy-river-akvz3mg6`)

| Table | Change | Method |
|---|---|---|
| `Customer` | `diet_plan_id TEXT NULL` column added + `Customer_diet_plan_id_idx` btree index | `mcp__neon__run_sql_transaction` |
| `_prisma_migrations` | Migration `20260409153741_add_customer_diet_plan` marked as applied | same transaction |
| `Customer` where `id = 00000000-…-0001` (Jose seed) | `diet_plan_id = 'fc0a70f3-…'` (Omnivore) | end-to-end smoke test |

### `betterday-commerce/main` branch (production)

**Untouched.** The promotion from dev → main needs to happen when this branch's PR merges into `conner/universal-brand-folder`. Tracked in `deferred-decisions.md`.

### `culinary-ops/production` branch (production)

**Untouched.** The Plant-Based→Vegan rename + migration #6 promotion are both deferred until PR merge.

---

## What's NOT done yet (next steps)

### Commits 5-8 of the wiring sequence

**These are the remaining pieces of the account hub wiring plan.** All four have the backend endpoints already in place — no schema changes needed, no DTO changes, no backend work at all. Pure front-end wiring.

#### Commit 5/8 — `wire(account): loadAddresses → GET /me/addresses`

**What to do:**
1. The ported `account/index.html` has a hardcoded `acctAddresses` array (2 entries at line ~4735) that feeds `renderAddresses()`. Replace it with a real fetch.
2. Add `loadAddresses()` async function that hits `GET /api/commerce/customers/me/addresses`.
3. Call it from the same `DOMContentLoaded` handler as `loadProfile()`.
4. Map the server response shape (`recipient_first_name`, `recipient_last_name`, `street`, `street2`, `city`, `state`, `zip`, `is_default`, `type`, `delivery_instructions`, `company`) to whatever `renderAddresses()` currently expects.
5. Shape differences to watch for:
   - Hardcoded uses `firstName`/`lastName` camelCase; server uses `recipient_first_name` snake_case
   - Hardcoded uses `isDefault`; server uses `is_default`
6. Fail-safe: silent console.warn if the fetch fails, hardcoded fallback remains.

**Relevant backend endpoint:** `CommerceCustomersController.getMyAddresses` — returns `CustomerAddress[]` ordered by `is_default DESC, created_at ASC`.

**Testing:** `curl -H "x-dev-customer-id: 00000000-0000-4000-a000-000000000001" http://localhost:3001/api/commerce/customers/me/addresses` — Jose's dev seed has 2 addresses (Home Aurora IL + Office Plainfield IL).

---

#### Commit 6/8 — `wire(account): saveAddress → POST /me/addresses + PATCH /me/addresses/:id`

**What to do:**
1. Find the existing `saveAddress()` stub. It currently mutates the local `acctAddresses` array and closes the modal.
2. Rewrite it as async with two branches:
   - **Create** (no `id` set): `POST /api/commerce/customers/me/addresses` with the full body
   - **Update** (existing `id`): `PATCH /api/commerce/customers/me/addresses/:id` with only the fields that changed
3. On success: refresh the full address list (re-fetch `GET /me/addresses`) to catch the new default ordering, re-render, close modal, success toast.
4. On error: leave the modal open, warning toast.
5. Disable the Save Address button during the request.

**Backend DTO shape** (from `CreateAddressDto` in `commerce-customers/dto/address.dto.ts`):
```typescript
{
  label: string;                      // required
  type: 'delivery' | 'pickup';        // required
  recipient_first_name: string;       // required
  recipient_last_name: string;        // required
  recipient_email: string;            // required, valid email
  recipient_phone: string;            // required
  street: string;                     // required
  city: string;                       // required
  state: string;                      // required
  zip: string;                        // required
  company?: string;                   // optional
  street2?: string;                   // optional
  delivery_instructions?: string;     // optional
  is_default?: boolean;               // optional (only one address can be default)
}
```

**Gotcha:** the ported prototype modal form fields use `firstName`/`lastName`/etc. camelCase IDs. The DTO uses snake_case. Map in the save handler before POSTing.

---

#### Commit 7/8 — `wire(account): deleteAddress + setDefaultAddress → real API calls`

**What to do:**
1. Rewrite the `deleteAddress(id)` stub:
   - `DELETE /api/commerce/customers/me/addresses/:id`
   - On success: re-fetch the address list, re-render, success toast
   - Add a confirm dialog before firing the DELETE (the existing stub may or may not have one)
2. Rewrite the `setDefaultAddress(id)` stub:
   - `POST /api/commerce/customers/me/addresses/:id/default`
   - On success: re-fetch the list (ordering may change), re-render, success toast
3. Both handlers need error paths with warning toasts and button re-enable.

**Backend endpoint notes:**
- DELETE won't let you delete the currently-active subscription default address (backend enforces this). Front-end should catch the 400 response and show the error message.
- POST /default atomically flips the old default's `is_default=false` and sets the new one. Single transaction backend-side.

---

#### Commit 8/8 — `wire(account): loadPaymentMethods → GET /me/payment-methods`

**What to do:**
1. Replace the hardcoded `paymentMethods` array at line ~4740 with a real fetch.
2. Add `loadPaymentMethods()` async, call from `DOMContentLoaded`.
3. Map server response to whatever `renderPaymentMethods()` expects.
4. **Read-only for now.** Adding a card requires Helcim SDK integration which is a separate deferred epic.
5. Deleting a card: `DELETE /api/commerce/customers/me/payment-methods/:id`
6. Setting default: `POST /api/commerce/customers/me/payment-methods/:id/default`

**Server response shape** (already wired in backend):
```typescript
{
  id: string;
  processor: 'helcim';
  processor_token: string;   // helcim_tok_… (dev uses fake tokens)
  brand: 'visa' | 'mc' | 'amex' | …;
  last4: string;
  exp_month: number;
  exp_year: number;
  cardholder_name: string;
  is_default: boolean;
}
```

**Deferred scope** — tracked in `deferred-decisions.md`:
- Add-card flow requires Helcim.js integration on the front end to tokenize the card before sending the token to the backend. Not in scope for this chat.

---

### Deferred decisions already tracked

Scanned from `conner/deferred-decisions.md` — the ones most relevant to this project:

| Item | Urgency |
|---|---|
| Promote commerce migration #6 + the culinary Plant-Based→Vegan rename from dev → production Neon branches | ⚠️ On PR merge |
| Gurleen's culinary modules still contain "Plant-Based" strings (meals service, tags service, imports, schema comment). `tags.service.ts:96` seed row 'Plant-Based Plan' would conflict on fresh DB boot | ⚠️ Urgent for Gurleen |
| Wire the account hub into real auth (remove `x-dev-customer-id` header), depends on passwordless auth epic | 🟡 Pending auth |
| Phone + email change flows (verification round-trips) | 🟡 Pending |
| `CustomerMarketingConsent` table for CASL compliance (separate from transactional `email_opt_in`) | 🟡 Pending legal |
| Backfill `MealRecipe.linked_meal_id` for the 41 unlinked omnivore meals (currently 44/88 have siblings) | 🟢 Nice-to-have |
| Helcim.js integration for add-card flow | 🟢 Separate epic |
| Tokenize the ~1,750 lines of inline hex codes in the ported `account/index.html` to use `/brand/tokens.css` CSS custom properties | 🟢 Gradual |
| Build `conner/client-website/login.html` (the auth gate redirects there; doesn't exist yet — use `?preview=1` to bypass) | 🟢 Blocks auth |

### Operational follow-ups

1. **Merge freeze window**: this branch's PR into `conner/universal-brand-folder` will be the 4th big PR landing this week alongside subscriber-hub-v2 (already merged), coupons (already merged), and this one. Rebase or re-merge universal-brand-folder before opening the PR if it has drifted.
2. **Backend restart operational note**: the NestJS backend must run from the branch that has the latest commerce Prisma schema. This chat discovered that the main worktree backend was serving a stale Prisma client missing the `diet_plan_id` column — fixed by `npm run build` + kill + relaunch from this worktree. Future chats working against the account hub wiring should verify `curl /me | grep diet_plan_id` before starting any wiring work. If the field is missing, the backend needs restarting from the worktree that has the latest schema.
3. **Python http.server** on port 8000 runs from this worktree (PID 89023 as of doc write). If it's serving stale files, confirm with `lsof -p $(lsof -ti TCP:8000) | grep cwd` that it's pointing at `culinary-ops-client-profile`.

---

## How to resume this work in a new chat

Paste into the new chat:

```
Read conner/client-profile-summary.md end-to-end. That's the full state of
the customer profile wiring project as of 2026-04-09. I want to continue
with commits 5-8 of the wiring sequence — address book loadAddresses,
saveAddress, delete/setDefault, then payment methods read.

Before you do ANY code work, run these checks and report:
  1. git branch --show-current  (must be conner/2026-04-09-client-profile-data-model)
  2. curl -H "x-dev-customer-id: 00000000-0000-4000-a000-000000000001" http://localhost:3001/api/commerce/customers/me | grep diet_plan_id
     (must return a value — confirms backend is fresh)
  3. lsof -p $(lsof -ti TCP:8000 -sTCP:LISTEN) 2>/dev/null | grep cwd
     (must show culinary-ops-client-profile)
  4. git log --oneline conner/universal-brand-folder..HEAD
     (should show 10 commits: a2ac2f5, 6193ca9, a82c803, bf579af,
      a20e903 merge, 5cca53e rename, 99c259c wire1, 5ff364e wire2,
      1c5d9ff wire3, cea5620 wire4)

If any check fails, STOP and tell me. If all pass, start commit 5 per the
instructions in client-profile-summary.md §"What's NOT done yet".
```

That prompt is designed to get a fresh chat up to speed in a single read of this file. Everything it needs to NOT break is in this doc.

---

## Session history highlights

Things future-you might want to know about HOW this chat got here, not just WHAT it shipped:

1. **Terminology went through three rounds.** First "Vegan" was chosen as the single identifier. Then split into `Vegan` (backend) + `Plant-Based` (customer). Then the customer label moved to `Plants Only` because "plant-based" was ambiguous. Then Omnivore's customer label moved to `Meat & Plants` because "omnivore" felt clinical. The DIET_LABELS map pattern (brand seed → JS fallback → template interpolation) means all future label changes are one-line edits.

2. **Account hub was built TWICE.** The chat first built a 1,134-line standalone `account/index.html` as commit `6193ca9` before discovering that a parallel chat was porting the 5,334-line subscriber-hub-2.0 as the canonical customer profile. Resolution: merge took theirs unconditionally at `a20e903`, and the wiring work resumed on top of the port. The original hub content is preserved in git history at `6193ca9` as a reference for API wiring patterns (the `api()` helper design in commit #1 is directly lifted from it).

3. **The diet lock bypass bug was real.** `renderGrid()` had a micro-optimization that silently skipped the diet filter when no user filter was active. A Vegan customer would see the lock banner AND the meat meals at the same time. Found by the user mid-test. Fixed in `bf579af` along with a deeper cart-side leak where `getCartMeals() / getTotalItems() / getSubtotal()` iterated raw `allMeals`.

4. **The backend ran from the wrong worktree for most of the session.** The NestJS process was started from `culinary-ops/backend/` (main worktree) weeks ago and kept running on PID 59165 until this chat restarted it. That's why `diet_plan_id` was absent from `/me` responses — the stale Prisma client didn't know about the column. The restart (build + kill + relaunch from this worktree, after pinging both Neon branches via MCP to wake them) happened right before commit #3 and is documented there.

5. **Neon MCP tools disconnected mid-chat, then reconnected.** At one point the `mcp__neon__*` tools became unavailable (system reminder), forcing a switch to `psql`-via-curl fallbacks. Then they came back. All the DB operations in this project (`SystemTag` rename, `MealRecipe` backfill, `Customer.diet_plan_id` migration + smoke test) were done through the MCP tools when they were available.

6. **Cross-DB validation was the tricky design decision.** The commerce `Customer.diet_plan_id` points at a row in the culinary `SystemTag` table. Postgres can't enforce referential integrity across two Neon projects. The solution: the commerce service injects `CulinaryPrismaService` as a second dependency alongside `CommercePrismaService`, and the `updatePreferences()` method validates the UUID with a `findFirst({ where: { id, type: 'diets' } })` against the culinary DB before writing to commerce. Not bulletproof (someone could delete the culinary row after writes succeed), but it's the best available option without moving SystemTag into commerce.

---

**End of summary.** ~550 lines.

> If you're reading this because you just came into the client-profile worktree from a new chat: run the checks in §"How to resume this work in a new chat" FIRST, then you're cleared to continue with commit #5.
