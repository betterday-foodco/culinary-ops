# Session Summary — 2026-04-08 → 2026-04-09

**Chat scope:** Commerce database provisioning + first backend module + multi-chat workflow hardening
**Branch worked on:** `conner/2026-04-09-commerce-customers` (feature work) + `conner/universal-brand-folder` (infrastructure docs)
**Outcome:** Commerce database live, first backend module shipped, worktrees workflow documented, auto-read operating manual in place

---

## TL;DR

This chat took the commerce database from "empty Neon project" to "12 tables with real structure, one working backend module exposing 12 endpoints, seeded with test data, documented end-to-end, and auto-context-loaded for every future Claude session." It also absorbed two branch contamination incidents, documented how to prevent them long-term via git worktrees, and shipped the `CLAUDE.md` file that makes every future chat aware of the repo's conventions without being told.

**What exists now that didn't at the start:**
- A live Neon commerce project (`betterday-commerce`, `spring-fire-44871408`) in the BetterDay Food Co org
- A 12-table commerce schema with 5 migrations applied on the `dev` branch
- `CommercePrismaService` wired into NestJS alongside the existing culinary client
- `commerce-customers` NestJS module with 12 customer profile endpoints
- A seed script that creates one known test customer (Jose Ramirez) with full populated data
- `brand/` folder at the repo root (colors, typography, tokens, fonts, logos, site facts)
- A public `/api/system-config/public` endpoint for site-wide editable facts
- `conner/client-website/` as the destination for the final customer-facing site
- `CLAUDE.md` at the repo root, auto-loaded by every Claude Code session
- `conner/README.md` rewritten twice — once for the multi-chat branch workflow, once for git worktrees

---

## 1. Architectural decisions locked in

These are the "big calls" that got made in this chat and should not be relitigated casually:

| Decision | Outcome | Why |
|---|---|---|
| **Where does commerce data live?** | New Neon project (`betterday-commerce`) in Conner's `BetterDay Food Co` org, separate from Gurleen's `culinary-ops` project | Matches PROJECT_SCOPE.md §10 — two bounded contexts at the data layer, customer PII isolated in Conner's org during the culinary-ops handoff window |
| **Same NestJS app or new repo?** | Same repo, same NestJS app. New modules prefixed `commerce-*`, new `CommercePrismaService`, new `backend/prisma/commerce/schema.prisma` | Shared types without cross-service HTTP calls, one deploy pipeline, bounded context enforced at the DB layer not the service layer |
| **Payment processor** | **Helcim**, not Stripe | Canadian business fit, simpler fee structure, HelcimPay.js covers the browser-side PCI flow |
| **Customer auth model** | **100% passwordless.** No `password_hash`, no `/forgot-password`, no password UI anywhere. Magic link + phone OTP + Apple/Google OAuth only. | Simpler UX, no password leaks, matches modern consumer apps (DoorDash, Notion, etc.). Locked as `project_betterday_passwordless_auth` memory. |
| **"Unclaimed" customer state** | Valid customer status for accounts auto-created via Apple Pay / Google Pay Express checkout. Customer later "claims" by verifying email via magic link. | Enables express checkout without forcing a signup friction wall |
| **Money type** | `Decimal @db.Decimal(10, 2)` in commerce schema, NOT Float | Deliberate divergence from culinary's Float convention. Payment arithmetic needs exact values — Float rounding errors are fatal. |
| **`brand/` at repo root (not inside `conner/`)** | Universal source of truth for colors, fonts, logos, site facts | Consumed by every product. Ground-up build for the new customer-facing project, NOT a migration into Gurleen's `frontend/`. Locked as `feedback_brand_independence` memory. |
| **Coupon work out of scope for this chat** | A separate chat owns the coupon system | Avoids stepping on parallel work |
| **`conner/client-website/` as destination** | Clean final customer-facing site lives here, built fresh with `brand/` as source of truth | NOT a migration of Gurleen's frontend. Each page built page-by-page using the HTML-first + data-model co-evolution loop. |

---

## 2. Database state after this chat

### Neon project
- **Name:** `betterday-commerce`
- **Project ID:** `spring-fire-44871408`
- **Organization:** `BetterDay Food Co` (`org-lucky-feather-83886908`)
- **Region:** `aws-us-west-2`
- **Postgres version:** 17
- **Plan:** Free tier
- **Branches:**
  - `main` (`br-wandering-paper-ak95715o`) — production, empty
  - `dev` (`br-icy-river-akvz3mg6`) — all 5 migrations applied, one test customer seeded

### Migrations committed

| # | Name | Scope | Tables touched |
|---|---|---|---|
| 1 | `20260408234132_init` | Initial commerce schema | +7 tables, +11 enums |
| 2 | `20260409033641_add_points_coupons_address_contact` | Fix address contact fields, add points ledger, add coupons | +3 tables, +1 column, +4 enums |
| 3 | `20260409035500_add_auth_sessions_and_tokens` | Auth infrastructure | +2 tables, +4 Customer fields, +2 enums |
| 4 | `20260409040500_remove_passwords_passwordless_only` | Strip password vestiges from Migration 3 | -1 column, -1 enum value |
| 5 | `20260409060452_coupon_power_up` | Tier 1 + Tier 2 coupon features (from separate coupon chat) | Expanded Coupon table, added tiers/BOGO — not this chat's scope but landed on integration branch |

**Migrations 1–4 are this chat's work. Migration 5 is the coupon chat's work** — included in the list above because it's on `conner/universal-brand-folder` now and every future chat inherits it.

### Tables in the commerce database

12 tables total on the dev branch:

```
Customer                    ← core identity, OAuth, verification, points balance
CustomerAddress             ← delivery + pickup addresses with recipient contact
CustomerOrder               ← one-per-delivery with JSONB line_items + billing_contact snapshots
CustomerSession             ← active login sessions, refresh tokens hashed
CustomerAuthToken           ← magic link, phone OTP, email/phone verification
PaymentMethod               ← tokenized Helcim card references
Subscription                ← one active per customer
WeeklyCartRecord            ← per-subscription per-week cart state
PickupLocation              ← pickup depots
RewardPointsTransaction     ← append-only points ledger
Coupon                      ← coupon definitions (extended by Migration 5)
CustomerCoupon              ← per-customer coupon state machine
```

### Test data seeded on dev branch

**Jose Ramirez** — hardcoded UUIDs so the seed is idempotent:
- Customer ID: `00000000-0000-4000-a000-000000000001`
- Email: `ramirez1630@ymail.com` (verified)
- Phone: `(630) 267-9543` (verified)
- 2 addresses (Home default + Office)
- 2 payment methods (Visa 4242 default + Mastercard 8888)
- 1 active subscription (weekly, 9 meals, 14% savings tier, 52 lifetime orders)
- Points balance: 1,239
- Mirrors the mock data from `conner/app/subscriber-hub-2.0.html`

**Seed script:** `backend/prisma/commerce/seed.ts` — idempotent, runs against whatever `COMMERCE_DATABASE_URL` resolves to (dev branch locally).

---

## 3. Backend code shipped

### `CommercePrismaService` (bridge code)

**File:** `backend/src/prisma/commerce-prisma.service.ts`
**Purpose:** the second Prisma client alongside Gurleen's existing `PrismaService`. Imports from `@prisma/commerce-client` (custom generator output path) and exposes the commerce database to any NestJS module.

**Wiring:** `backend/src/prisma/prisma.module.ts` is `@Global()` and exports BOTH services. Any feature module can inject either one without explicit imports.

**Pattern for commerce modules:**
```ts
constructor(private commerce: CommercePrismaService) {}
```

### `commerce-customers` module (first commerce feature)

**Files:**
```
backend/src/modules/commerce-customers/
├── commerce-customers.module.ts
├── commerce-customers.controller.ts     — 12 URL routes
├── commerce-customers.service.ts        — 12 service methods
├── dto/
│   ├── profile.dto.ts                   — UpdateProfile / UpdatePreferences / UpdateNotifications
│   └── address.dto.ts                   — CreateAddress / UpdateAddress
└── decorators/
    └── current-customer.decorator.ts    — dev stub reading x-dev-customer-id header
```

**Endpoints (all under `/api/commerce/customers`):**

| Method | Path | Purpose |
|---|---|---|
| GET | `me` | Full profile + addresses + payment_methods + subscription |
| PATCH | `me` | Update first_name, last_name, phone, birthday |
| PATCH | `me/preferences` | Update allergens, diet_tags, disliked_meals, favorite_meals |
| PATCH | `me/notifications` | Update sms_opt_in, email_opt_in |
| GET | `me/addresses` | List addresses |
| POST | `me/addresses` | Create address |
| PATCH | `me/addresses/:id` | Update address |
| DELETE | `me/addresses/:id` | Delete address |
| POST | `me/addresses/:id/default` | Set as default (atomic per type) |
| GET | `me/payment-methods` | List saved cards |
| DELETE | `me/payment-methods/:id` | Delete saved card |
| POST | `me/payment-methods/:id/default` | Set as default (atomic) |

**Powers:** the `#info` and `#delivery` tabs of `subscriber-hub-2.0.html` end-to-end.

**Does NOT cover:**
- Login / signup / auth — needs a `commerce-auth` module (not built this chat)
- Email or phone change (both require the `CustomerAuthToken` round-trip)
- Creating payment methods (requires HelcimPay.js in browser, then a `from-helcim-token` endpoint)
- Subscriptions, orders, cart, coupons, points — separate modules

**Auth stub:** `@CurrentCustomer()` decorator reads an `x-dev-customer-id` header. Anyone knowing a UUID can impersonate. **Must be replaced with a real guard before production.**

### Also built earlier in the session

- **`GET /api/system-config/public`** endpoint (unauthenticated, returns `public.*` keyed SystemConfig rows with the prefix stripped). Lives in `backend/src/modules/system-config/system-config-public.controller.ts`.
- **CORS multi-origin support** in `backend/src/main.ts` via new `FRONTEND_URLS` comma-separated env var (backward compatible with legacy `FRONTEND_URL`).
- **Seed wiring** in `backend/prisma/seed.ts` that loads `brand/site-info.seed.json` into the `SystemConfig` table (idempotent, never overwrites admin edits).

---

## 4. `brand/` folder — universal design source of truth

**Location:** `brand/` at the repo root (outside `conner/`), consumed by every product that renders UI.

**Contents:**
```
brand/
├── README.md                 ← explains the two-layer system (files vs DB-backed)
├── colors.json               ← 12 brand colors + semantic functional tokens
├── typography.json           ← BDSupper display, Gaya heading, Sofia Pro Soft body, Fastpen accent
├── tokens.css                ← CSS custom properties + @font-face for standalone HTML
├── design-tokens.md          ← human-readable palette reference
├── site-info.seed.json       ← 21 initial public.* keys for the SystemConfig runtime layer
├── fonts/                    ← 5 .otf files (BDSupper, Gaya, Sofia Pro Regular/Bold, Fastpen)
├── logos/                    ← PNG variants (Centered + Left Justified, Cream/Blue/Navy)
└── photos/                   ← product + lifestyle + section photos extracted from prototypes
```

**Key rule baked into CLAUDE.md:** never hardcode hex colors, phone numbers, emails, or font names anywhere outside `brand/`. Pull from `brand/colors.json`, `brand/tokens.css`, or the `{{contact.email}}` style runtime tokens resolved by the site-shell loader.

**One correction this chat made:** fixed `purple-dark` from the old `#7C3AED` to your correct palette value `#7453A2`. All three synced files updated (`colors.json`, `tokens.css`, `design-tokens.md`).

### Two-layer brand system explained

- **Layer 1 — file-based (build-time):** colors, fonts, logos, typography. Edit = code change, PR, deploy. Good for things that should go through review.
- **Layer 2 — database-backed (runtime):** phone, email, social URLs, legal copy, delivery areas, announcement banner. Edit = admin dashboard, no deploy. Propagates to every page on next cache TTL. Seeded from `brand/site-info.seed.json` and served by `/api/system-config/public`.

---

## 5. `conner/` workspace structure

```
conner/
├── README.md                 ← rewrote TWICE this chat (branch workflow, then worktrees)
├── CLAUDE.md → ../CLAUDE.md  ← (auto-loaded file lives at repo root, not here)
├── deferred-decisions.md     ← running tracker of edge cases + TODOs (committed from coupons chat)
├── MULTI-CHAT-STATUS.md      ← untracked scratch file for live multi-chat coordination
├── data-model/               ← entities, flows, ADRs pulled from legacy betterday-webapp
│   ├── README.md
│   ├── entities.md           ← canonical product spec for all commerce entities
│   ├── commerce-neon-setup.md ← non-secret Neon reference
│   ├── flows/                ← subscriber-hub, checkout, menu-overlay
│   └── decisions/            ← 5 ADRs including html-first workflow and apple-pay-and-accounts
├── client-website/           ← destination for the clean final customer site (other chats landed pages here)
├── app/                      ← OLD prototypes pulled from legacy betterday-webapp — reference only
├── prototypes/               ← loose UI experiments
├── ecommerce/                ← placeholder
├── Email Verification/       ← magic link system design docs
└── session-summaries/        ← you are here (if this file lands)
```

Most of these were **already in place** when this chat started. Things this chat specifically added:
- `client-website/` scaffold (earlier in the session before multi-chat issues)
- `data-model/commerce-neon-setup.md` (non-secret Neon reference)
- The twice-rewritten `README.md`

---

## 6. Workflow & infrastructure hardening

### Multi-chat branch contamination incidents (2 hit this chat directly)

**Incident #2 — new-meal-form commit landed on commerce-customers branch.** The meal-edit chat intended to commit to its own branch but the shared `.git/HEAD` was pointing at `conner/2026-04-09-commerce-customers` when it ran `git commit`, so `f0796bd` (a phantom duplicate of the meal-edit chat's work) landed on this chat's branch. Recovered via local reset to match origin after the meal-edit chat cherry-picked the same content onto its own branch as `df48543`. No work lost anywhere.

**Silent HEAD flips during this session.** Multiple times during this chat, the shared `.git/HEAD` flipped underneath me between turns, caused by parallel chats running `git checkout`. Caught each time by running the 3-check (`git branch --show-current`, verify it matches this chat's scope, scan `git log` for foreign commits). Stopped and reported each time rather than trying to fix autonomously.

### Worktrees as the permanent fix

The root cause of all contamination: multiple chats share one working tree, therefore share one `.git/HEAD`. The fix is **git worktrees** — each chat works in its own sibling folder (`~/Downloads/culinary-ops-commerce-customers/`, `~/Downloads/culinary-ops-coupons/`, etc.) with its own checkout and its own `HEAD`. Under the hood they share the same git storage so commits are instantly visible across folders without push/pull.

**The new workflow was documented in two places:**

1. **`conner/README.md` rewrite** — documents the "one chat = one worktree folder = one branch" rule, the `git worktree add` command, the `npm install` per-worktree requirement, the `.env` copy requirement, and the cleanup flow.
2. **`CLAUDE.md` at the repo root** — short durable operating manual that Claude Code auto-loads into every session. Tells every chat to read `conner/README.md`, `PROJECT_SCOPE.md`, `commerce-neon-setup.md`, `deferred-decisions.md`, and `MULTI-CHAT-STATUS.md` at startup. Includes the never-do list, files-never-to-commit list, pre-push audit pointer, and the "append to deferred-decisions.md when you discover an edge case" habit.

**The payoff:** starting tomorrow, every new chat automatically knows the conventions without being told. No more "read conner/README.md first" preamble; Claude Code reads it before the first user message.

### Memories saved (persistent across future sessions)

| Memory file | Purpose |
|---|---|
| `project_betterday_commerce_db.md` | Neon project IDs, branch IDs, env vars, TODO list for commerce schema |
| `project_betterday_passwordless_auth.md` | Locked decision: no passwords, ever. Never add `password_hash` or password reset endpoints. |
| `feedback_brand_independence.md` | `brand/` is a ground-up build, never frame as "wiring into Gurleen's frontend" |

---

## 7. Commits this chat landed (chronological, oldest first)

On `conner/universal-brand-folder` directly OR on the feature branch `conner/2026-04-09-commerce-customers`:

| Hash | Branch | Message |
|---|---|---|
| `08d1a01` | universal-brand-folder | `brand: add universal brand folder with design tokens and site info seed` |
| `4952c5f` | universal-brand-folder | `feat(system-config): add public read endpoint for site-wide facts` |
| `b2c2d88` | universal-brand-folder | `feat(seed): load public.* site info keys from brand/site-info.seed.json` |
| `490a839` | universal-brand-folder | `conner: pull data-model and app folders from betterday-webapp` |
| `1577e68` | universal-brand-folder | `brand: fix purple-dark hex from #7C3AED to #7453A2` |
| `9467994` | universal-brand-folder | `conner: scaffold client-website/ as destination for final customer site` |
| `32b6e75` | universal-brand-folder | `infra: provision betterday-commerce Neon project + document setup` |
| `fac0392` | universal-brand-folder | `feat(commerce): initial schema.commerce.prisma + first migration` |
| `a83b82d` | universal-brand-folder | `feat(commerce): migration 2 — points, coupons, address contact fields + isolate commerce migrations folder` |
| `b71b255` | universal-brand-folder | `feat(commerce): migration 3 — auth sessions, auth tokens, and verification` |
| `f36d369` | universal-brand-folder | `fix(commerce): migration 4 — strip password vestiges, enforce passwordless` |
| `ac0d67f` | universal-brand-folder | `feat(commerce): wire CommercePrismaService into NestJS backend` |
| `dbbc035` | universal-brand-folder | `docs: rewrite conner/README with multi-chat workflow guide` |
| `f99e461` | 2026-04-09-commerce-customers | `feat(commerce-customers): first commerce backend module with 12 profile endpoints` |
| `214849d` | universal-brand-folder | `docs(readme): switch multi-chat workflow to git worktrees` |
| `127a885` | universal-brand-folder | `docs(claude-md): add root CLAUDE.md + wire deferred-decisions into README` |

**16 commits, all authored by Conner, all pushed to origin.**

**Note:** the commerce-customers commit (`f99e461`) lives on the feature branch `conner/2026-04-09-commerce-customers`, which was merged into `conner/universal-brand-folder` via PR #12 (the merge commit is `f9e5a3c`).

---

## 8. Things deferred or explicitly out of scope

Nothing in this list was forgotten — each was a conscious "not now" call.

### Auth (entire flow)

The `commerce-customers` module uses a dev-stub `@CurrentCustomer()` decorator. Real passwordless auth is its own module (`commerce-auth`) that hasn't been built. What it needs:

- `POST /api/commerce/auth/magic-link/request` — email → creates `CustomerAuthToken` → sends email (needs Resend wiring)
- `POST /api/commerce/auth/magic-link/verify?token=…` — consumes token → creates `CustomerSession`
- `POST /api/commerce/auth/phone-otp/request` — phone → creates `CustomerAuthToken` → sends SMS (needs Twilio wiring)
- `POST /api/commerce/auth/phone-otp/verify` — consumes code → creates `CustomerSession`
- `GET /api/commerce/auth/apple/callback` — Apple OAuth callback
- `GET /api/commerce/auth/google/callback` — Google OAuth callback
- `POST /api/commerce/auth/logout` — revokes current `CustomerSession`
- `GET /api/commerce/auth/sessions` — list + revoke per-device
- **Real `CustomerAuthGuard`** replacing the `x-dev-customer-id` stub in `commerce-customers`

Until this module exists, nothing real can log in via `login.html`. The database tables (`CustomerSession`, `CustomerAuthToken`) are ready and waiting.

### Email / phone change flows

Not in `commerce-customers` because they require the `CustomerAuthToken` round-trip (verify the new email/phone before switching). Belong in `commerce-auth`.

### Creating payment methods

`commerce-customers` can list and delete saved cards but not create them. Creating a card requires HelcimPay.js in the browser + a separate `POST /me/payment-methods/from-helcim-token` endpoint to persist the returned token. Raw card data never touches the backend.

### Helcim Recurring API verification

Open question flagged multiple times: does Helcim Recurring support **variable-amount** subscriptions? Build-a-cart produces different weekly totals, so the recurring model needs to support amounts that change each cycle. Needs Helcim docs research before `commerce-subscriptions` can be built.

### Tax strategy

Helcim has no Stripe-Tax-equivalent auto-calculation. Either (a) hardcode Alberta GST 5% for now and layer in multi-province rules, or (b) integrate a third-party service like TaxJar or Avalara. Deferred until checkout is being built.

### Modules not yet built

- `commerce-auth`
- `commerce-subscriptions`
- `commerce-orders`
- `commerce-checkout`
- `commerce-cart` (build-a-cart flow)
- `commerce-catalog` (menu catalog reading meals from culinary DB via a bridge)
- `commerce-delivery` (zones, windows, fees)

### Client-website pages not yet built

Built by this chat: only the homepage (`conner/client-website/index.html`) and scaffold.
Built by other chats this week: `menu/index.html`, `onboarding/index.html`.
Not yet built: `login.html`, `meal/[code].html`, `cart.html`, `checkout.html`, `account/*`, `about.html`, `faq.html`.

### Coupon work

Entirely scoped to a separate chat. Migration 5 came from that chat and landed on the integration branch via PR #11.

---

## 9. Known cleanup needed

- **The `@CurrentCustomer()` dev stub** must be replaced before production — it reads an HTTP header with zero auth.
- **`conner/MULTI-CHAT-STATUS.md`** is an untracked scratch file that should be deleted once the worktree migration stabilizes and contamination incidents stop happening. Keep it for now as a live log.
- **The seed script `backend/prisma/commerce/seed.ts`** seeds exactly one customer. Needs expansion once more backend modules exist (orders, subscriptions, weekly cart records, etc.) so they have realistic data to return.
- **The `_prisma_migrations` table** on the commerce dev branch tracks 5 applied migrations but the `main` branch of `betterday-commerce` has ZERO tables — it's still empty. Migration promotion from `dev` → `main` hasn't happened yet because there's no production traffic. Safe to leave for now.
- **Some of the older commits in this chat came before the worktrees migration**, so they were landed via the shared-folder workflow. Future chats should use worktrees.

---

## 10. What a fresh chat tomorrow needs to know

This entire summary can be condensed to these bullet points for a new chat started tomorrow:

1. **Commerce DB is live** (`betterday-commerce`, dev branch, 12 tables seeded with Jose Ramirez).
2. **Commerce backend has exactly one module so far** — `commerce-customers` with 12 profile endpoints using a dev-stub auth decorator.
3. **Real auth (`commerce-auth`) is the next blocker** for any real customer interaction.
4. **Passwordless only** — never propose adding password fields or reset flows.
5. **Helcim not Stripe** — never propose Stripe integration.
6. **Decimal money** in commerce, not Float.
7. **`brand/` at repo root** is the universal design source of truth — never hardcode colors/fonts/contact info elsewhere.
8. **Use git worktrees** for any parallel chat work — one worktree per chat under `~/Downloads/culinary-ops-<topic>/`.
9. **Read `CLAUDE.md` at the repo root** — Claude Code does this automatically; it's the durable operating manual.
10. **Append to `conner/deferred-decisions.md`** whenever something gets consciously deferred in a chat.

---

## 11. Files added or modified this chat (on `conner/universal-brand-folder`)

### New files
- `CLAUDE.md` (repo root)
- `brand/README.md`
- `brand/colors.json`
- `brand/typography.json`
- `brand/tokens.css`
- `brand/design-tokens.md`
- `brand/site-info.seed.json`
- `brand/fonts/*.otf` (5 files)
- `brand/logos/**/*.png` (6 files across two subfolders)
- `backend/prisma/commerce/schema.prisma`
- `backend/prisma/commerce/migrations/20260408234132_init/migration.sql`
- `backend/prisma/commerce/migrations/20260409033641_add_points_coupons_address_contact/migration.sql`
- `backend/prisma/commerce/migrations/20260409035500_add_auth_sessions_and_tokens/migration.sql`
- `backend/prisma/commerce/migrations/20260409040500_remove_passwords_passwordless_only/migration.sql`
- `backend/prisma/commerce/migration_lock.toml`
- `backend/prisma/commerce/seed.ts`
- `backend/src/prisma/commerce-prisma.service.ts`
- `backend/src/modules/system-config/system-config-public.controller.ts`
- `backend/src/modules/commerce-customers/commerce-customers.module.ts`
- `backend/src/modules/commerce-customers/commerce-customers.controller.ts`
- `backend/src/modules/commerce-customers/commerce-customers.service.ts`
- `backend/src/modules/commerce-customers/dto/profile.dto.ts`
- `backend/src/modules/commerce-customers/dto/address.dto.ts`
- `backend/src/modules/commerce-customers/decorators/current-customer.decorator.ts`
- `conner/client-website/README.md`
- `conner/data-model/commerce-neon-setup.md`
- `conner/README.md` (rewritten — two passes)
- `conner/app/` (pulled from legacy webapp — many files)
- `conner/data-model/` (pulled from legacy webapp — entities, flows, decisions)

### Modified files
- `backend/src/main.ts` (CORS multi-origin)
- `backend/src/modules/system-config/system-config.module.ts` (registered public controller)
- `backend/src/prisma/prisma.module.ts` (exported CommercePrismaService)
- `backend/src/app.module.ts` (imported CommerceCustomersModule)
- `backend/prisma/seed.ts` (loads public.* keys from brand/site-info.seed.json)
- `backend/.env.example` (commerce env var placeholders + multi-origin CORS hint)
- `.gitignore` (removed `prisma/migrations/` exclusion so commerce migrations are tracked)
- `PROJECT_SCOPE.md` (Helcim transition, Neon commerce project, progress log — parallel chats also contributed)

### Files NOT committed (intentional)
- `backend/.env` (real connection strings, local only)
- `backend/.env.backup-before-neon-branch` (secrets backup)
- `conner/MULTI-CHAT-STATUS.md` (untracked scratch file)

---

## 12. Next logical sessions

When you or another chat picks this up, the natural order is:

1. **`commerce-auth` module** — the critical path blocker. Without it, `login.html` can't talk to anything and `commerce-customers` has no real auth layer. Should be a focused session in its own worktree.
2. **Real `CustomerAuthGuard`** replacing the dev stub in `commerce-customers`. Small follow-up after `commerce-auth` ships.
3. **Expand the seed script** so it creates a handful of realistic customers with varying state (different statuses, allergens, order histories, subscription tiers) to give future modules realistic data to work against.
4. **Helcim Recurring API research doc** — one chat reads the Helcim docs end to end and writes `conner/data-model/helcim-recurring-notes.md` answering the "does variable-amount subscription work?" question. Unblocks `commerce-subscriptions`.
5. **`commerce-catalog` module** — reads meals from Gurleen's culinary DB via `PrismaService` and exposes them as a customer-facing product list. First cross-DB module.

Everything after that depends on the answers to the above.

---

## 13. If this file is ever outdated

Treat it as a **point-in-time snapshot** of 2026-04-09. When you come back, run:

```bash
git log origin/conner/universal-brand-folder --oneline --since="2026-04-09"
git log backend/prisma/commerce/ --oneline
```

to see what's changed since, then update `conner/deferred-decisions.md` with anything new that got deferred.

The authoritative current state of the commerce schema is always `backend/prisma/commerce/schema.prisma` on `conner/universal-brand-folder`. The authoritative current state of the workflow conventions is always `CLAUDE.md` at the repo root.

---

*Generated at the end of the chat session on 2026-04-09, before wrap-up.*
