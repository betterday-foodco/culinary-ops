# BetterDay Food Co. — Culinary Ops: Project Scope

> **Last updated**: 2026-04-08 — commerce infrastructure provisioned, Helcim replaces Stripe, brand/ folder scaffolded
> **Maintainers**: Gurleen Kaur (owner), Conner (@conner-kadz)
> **Repo**: github.com/betterday-foodco/culinary-ops

---

## 1. What Is This Project?

A **production-ready internal culinary operations platform** for BetterDay Food Co., a meal prep company based in Calgary, Canada. It manages the full lifecycle: ingredients → sub-recipes → meals → production plans → kitchen execution → corporate B2B ordering.

**This is NOT a customer-facing e-commerce site.** It's the internal ops backbone. E-commerce is a planned addition (see Section 10).

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Next.js (App Router) | 14.2.5 |
| **UI** | React + Tailwind CSS | React 18.3, Tailwind 3.4 |
| **Data fetching** | SWR | 2.2.5 |
| **Backend** | NestJS (TypeScript) | 10.x |
| **ORM** | Prisma | 5.x |
| **Database** | PostgreSQL | (Neon / Render Postgres) |
| **Auth (staff)** | JWT (Passport) | 7-day tokens |
| **Auth (customers)** | Email+password, OAuth (Apple, Google) | Planned — separate from staff JWT |
| **Email** | Resend API | 6.10 |
| **Payments** | Helcim (Canadian processor) | Recurring API + HelcimPay.js (planned) |
| **Deployment** | Render (backend) + Vercel (frontend) | — |
| **Integrations** | Shopify webhooks, MealPrep platform sync, Helcim | — |

---

## 3. Repository Structure

```
culinary-ops/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma              # Culinary ops schema (20+ models, 794 lines)
│   │   └── schema.commerce.prisma     # [PLANNED] Commerce schema (separate Neon DB)
│   ├── src/
│   │   ├── app.module.ts              # Root module (imports 22 modules)
│   │   ├── main.ts                    # Bootstrap: CORS, validation, static assets
│   │   ├── health.controller.ts       # GET /api/health
│   │   ├── modules/                   # 22 NestJS feature modules
│   │   │   ├── auth/                  # JWT login, register, roles guard
│   │   │   ├── ingredients/           # CRUD + categories + inventory
│   │   │   ├── sub-recipes/           # Nested recipes + cost calc
│   │   │   ├── meals/                 # Meals from ingredients/sub-recipes
│   │   │   ├── orders/                # Shopify order sync
│   │   │   ├── production-plans/      # Weekly plans + publish
│   │   │   ├── production-numbers/    # Wed/Thu quantity tracking
│   │   │   ├── kitchen-portal/        # Main kitchen interface (19KB service)
│   │   │   ├── kitchen-staff/         # Staff management
│   │   │   ├── kitchen-stations/      # Station setup (6 stations)
│   │   │   ├── station-tasks/         # Ad-hoc task assignment
│   │   │   ├── portion-specs/         # Portion sizing + photos
│   │   │   ├── plan-tasting/          # Tasting notes
│   │   │   ├── tags/                  # System tags (allergens, dietary)
│   │   │   ├── menu-queue/            # Menu rotation (meat/omni/vegan)
│   │   │   ├── daily-checklist/       # Daily kitchen checklist
│   │   │   ├── mealprep-webhook/      # MealPrep inbound webhooks
│   │   │   ├── mealprep-sync/         # Publish to MealPrep API
│   │   │   ├── corporate-sync/        # Corp orders → production plans
│   │   │   ├── system-config/         # Key-value config store
│   │   │   ├── corporate/             # B2B module (3 sub-modules)
│   │   │   │   ├── auth/              # Magic link + PIN login
│   │   │   │   ├── admin/             # Company/employee management
│   │   │   │   └── portal/            # Employee meal ordering
│   │   │   ├── import/                # CSV data import
│   │   │   ├── reports/               # Reporting engine
│   │   │   │
│   │   │   │ # [PLANNED] E-Commerce modules
│   │   │   ├── commerce-catalog/      # Product catalog (reads from meals)
│   │   │   ├── commerce-cart/         # Shopping cart
│   │   │   ├── commerce-checkout/     # Checkout + Helcim
│   │   │   ├── commerce-orders/       # Customer order management
│   │   │   ├── commerce-customers/    # Customer accounts
│   │   │   └── commerce-subscriptions/# Meal plan subscriptions
│   │   │
│   │   ├── services/
│   │   │   ├── cost-engine.service.ts       # Recursive cost calculations
│   │   │   └── production-engine.service.ts # Production planning logic
│   │   └── webhooks/
│   │       └── shopify.controller.ts        # HMAC-validated Shopify hooks
│   ├── scripts/                       # Data migration & utility scripts
│   ├── .env.example                   # Environment template
│   └── railway.toml                   # Railway deployment config
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout (html, body)
│   │   ├── page.tsx                   # Home redirect
│   │   ├── login/page.tsx             # Staff login
│   │   ├── lib/
│   │   │   ├── api.ts                 # 1,100+ line API client (all endpoints)
│   │   │   └── corp-api.ts            # Corporate API client
│   │   ├── (dashboard)/               # GURLEEN'S TERRITORY — do not modify
│   │   │   ├── layout.tsx             # Sidebar nav + header (all dashboard pages)
│   │   │   ├── dashboard/             # Home dashboard
│   │   │   ├── ingredients/           # Ingredient management
│   │   │   ├── sub-recipes/           # Sub-recipe list + detail + create
│   │   │   ├── meals/                 # Meal list + detail + pricing
│   │   │   ├── production/            # Production plan list + detail + create
│   │   │   ├── portion-specs/         # Portion spec management
│   │   │   ├── menu-builder/          # Menu rotation queue
│   │   │   ├── inventory/             # Stock tracking + vendors
│   │   │   ├── reports/               # Cooking, meals, sub-recipes, shopping, inventory
│   │   │   ├── kitchen-admin/         # Kitchen admin panel
│   │   │   ├── station-assignment/    # Staff → station mapping
│   │   │   ├── kitchen-messages/      # Internal messaging
│   │   │   ├── approvals/             # Shortage/bulk approvals
│   │   │   ├── feedback/              # Recipe ratings
│   │   │   ├── shortages/             # Shortage overview
│   │   │   ├── checklist-manage/      # Daily checklist editor
│   │   │   ├── corporate-admin/       # Corporate company management
│   │   │   └── settings/              # Staff, tags, integration config
│   │   ├── (kitchen)/                 # Kitchen staff UI
│   │   │   ├── layout.tsx             # Kitchen-specific nav
│   │   │   └── kitchen/               # Board, prep, tasks, requests, messages
│   │   ├── (corporate)/               # Corporate B2B portal
│   │   │   ├── layout.tsx             # Corporate layout
│   │   │   └── corporate/             # Login, verify, manager, employee ordering
│   │   │
│   │   │ # [PLANNED] E-Commerce storefront
│   │   └── (storefront)/              # Customer-facing pages
│   │       ├── layout.tsx             # Universal header + footer (on every page)
│   │       ├── page.tsx               # Landing page
│   │       ├── menu/page.tsx          # Browse meals
│   │       ├── meal/[id]/page.tsx     # Meal detail
│   │       ├── cart/page.tsx          # Shopping cart
│   │       ├── checkout/page.tsx      # Checkout (Helcim / HelcimPay.js)
│   │       ├── account/page.tsx       # Customer account
│   │       └── subscriptions/page.tsx # Meal plan management
│   │
│   ├── public/
│   │   ├── login-hero.jpg
│   │   └── meal-photos/               # Uploaded meal images
│   ├── vercel.json                    # Vercel deployment
│   └── tailwind.config.ts
│
├── brand/                             # UNIVERSAL design source of truth (new)
│   ├── README.md                      # Two-layer system: files vs DB-backed
│   ├── colors.json                    # Brand palette (12 brand + functional tokens)
│   ├── typography.json                # Font families, sizes, weights
│   ├── tokens.css                     # CSS custom properties + @font-face
│   ├── design-tokens.md               # Human-readable palette reference
│   ├── site-info.seed.json            # Seed values for SystemConfig public keys
│   ├── fonts/                         # BDSupper, Gaya, Sofia Pro (.otf)
│   └── logos/                         # PNG logo variants (Centered + Left Justified)
│
├── conner/                            # CONNER'S WORKSPACE
│   ├── README.md                      # Workspace rules
│   ├── app/                           # HTML prototypes pulled from legacy webapp
│   ├── client-website/                # DESTINATION for the clean final customer site
│   ├── data-model/                    # Canonical product/data docs
│   │   ├── README.md
│   │   ├── entities.md                # Field-level specs (Customer, Address, Order…)
│   │   ├── flows/                     # subscriber-hub, checkout, menu-overlay
│   │   ├── decisions/                 # 5 ADRs (html-first workflow, gifts, etc.)
│   │   └── commerce-neon-setup.md     # Non-secret Neon IDs + env var reference
│   ├── Email Verification/            # Magic link system design docs
│   ├── ecommerce/                     # Placeholder
│   └── prototypes/                    # Placeholder
│
├── .github/
│   ├── CODEOWNERS                     # Enforces review requirements per folder
│   └── CONTRIBUTING.md                # Branch naming, workflow, boundaries
│
├── render.yaml                        # Render deployment (backend + frontend)
├── PROJECT_SCOPE.md                   # THIS FILE
├── README.md                          # Setup guide
├── SETUP.md                           # Installation steps
└── SUPABASE_SETUP.md                  # DB setup guide
```

---

## 4. Database Schema Overview

PostgreSQL via Prisma. **20+ models** organized into domains:

### User & Auth
- `User` — email, password (bcrypt), name, role (admin/staff/kitchen), station assignment, stationRole (lead/prep)

### Ingredient Management
- `Ingredient` — name, SKU, category, cost, unit, trim%, supplier, stock level
- `SystemTag` + `TagConnection` — allergens, dietary labels, categories

### Recipe System (hierarchical)
```
Ingredient
    ↓ (used in)
SubRecipe ← SubRecipeComponent (qty, unit)
    ↓ (can nest other sub-recipes)
SubRecipe ← SubRecipeComponent (child sub-recipe reference)
    ↓ (assembled into)
MealRecipe ← MealComponent (qty, unit)
```
- `SubRecipe` — name, station, day, prep instructions, base weight/unit, costs
- `SubRecipeComponent` — links ingredient OR child sub-recipe with quantity
- `MealRecipe` — name, category, meal code, costs, photo, variant linking
- `MealComponent` — links ingredient OR sub-recipe to a meal
- `PortionSpec` + `PortionSpecComponent` — portion sizing with photos

### Production
- `ProductionPlan` — week label, date range, published flags (kitchen/corporate)
- `ProductionPlanItem` — meal + quantity per plan
- `ProductionNumberUpdate` — Wed/Thu quantity tracking with shortage flags
- `KitchenProductionLog` — status (not_started/in_progress/done/short/bulk), lead approval
- `PlanTastingSession` — meal tasting notes
- `PlanWeekNote` — weekly planning notes

### Kitchen Operations
- `KitchenStation` — 6 fixed stations
- `StationTask` — ad-hoc tasks with assignment and completion tracking
- `StationRequest` — inter-station ingredient requests
- `KitchenMessage` — broadcast/station/direct messaging
- `KitchenFeedback` — 1-5 recipe ratings with admin notes
- `DailyChecklist` + `DailyChecklistCompletion` — daily kitchen tasks

### Menu
- `MenuQueueItem` — rotation queue (meat/omni/vegan columns, position-based)
- `MenuAdvanceLog` — advance history

### Corporate B2B (13 models)
- `CorporateCompany` — client companies
- `CorporateEmployee` — employees with PIN auth + benefit levels
- `CorporateOrder` + `CorporateOrderItem` — orders with subsidy splits (employee/company/BD)
- `CorporateBenefitLevel` — pricing tiers per company
- `CorporateParLevel` — category quotas
- `CorporateCompanyPIN` — company login PIN
- `CorporateMagicToken` — email magic links (15-min TTL)
- `CompanyInvoice`, `CorporateCreditNote`, `CorporateMonthlyStatement` — billing

### Orders & Integration
- `Order` — Shopify orders synced with production dates
- `WebhookLog` — inbound webhook history
- `SystemConfig` — key-value config (API tokens, endpoints)
- `CorporateSetting` — corporate module settings

---

## 5. API Endpoints (100+ routes)

All routes are under `/api` and require JWT auth unless noted.

### Core CRUD
| Resource | Endpoints |
|----------|-----------|
| Auth | `POST /auth/login`, `POST /auth/register`, `GET /auth/me` |
| Ingredients | Full CRUD + `PATCH /ingredients/stock-bulk`, `GET /ingredients/categories`, `GET /ingredients/inventory` |
| Sub-Recipes | Full CRUD + components CRUD + `GET /sub-recipes/prep-sheet`, `GET /sub-recipes/station-tags` |
| Meals | Full CRUD + components CRUD + `POST /meals/:id/photo`, `GET /meals/cooking-sheet`, `GET /meals/pricing`, `PATCH /meals/:id/link-variant` |
| Orders | `GET /orders`, `POST /orders`, `DELETE /orders/:id` |

### Production
| Resource | Endpoints |
|----------|-----------|
| Plans | Full CRUD + `PATCH /production-plans/:id/publish` + `/publish-corporate`, `GET /production-plans/current` |
| Numbers | `GET/PATCH /production-numbers/:id` (Wed/Thu tracking + shortages) |
| Reports | Meals, cooking, sub-recipes, shopping-list, inventory reports |

### Kitchen Portal (19 endpoints)
Board, production logs, feedback, requests, messages, shortages, bulk approvals, station assignments, task management, lead approvals, sub-recipe priority.

### Menu Queue
CRUD + reorder + advance + history.

### Corporate
- Auth: magic link request + PIN verify
- Portal: employee order viewing + placement
- Admin: company/employee/invoice CRUD + dashboard + orders
- Sync: corporate orders → production plans, menu publishing

### Integrations
- `POST /api/webhooks/shopify/orders` (HMAC validated, no JWT)
- `POST /mealprep-sync/publish/:id`
- `GET /webhooks/logs`

---

## 6. Key Business Logic

### Cost Engine (`cost-engine.service.ts`)
- Recursively calculates ingredient costs through sub-recipe hierarchy
- Applies trim percentages
- Rolls up to meal-level food costs
- Supports pricing overrides at meal level
- Bulk recalculation endpoint

### Production Planning
- Create weekly plans with meal quantities
- Auto-calculates required sub-recipes and ingredients
- Generates shopping lists grouped by ingredient category
- Publishes separately to kitchen staff and corporate portal
- Wed/Thu quantity tracking with shortage alerts

### Kitchen Workflow
```
Plan Published → Kitchen Board shows tasks per station
  → Staff marks: not_started → in_progress → done
  → If short: flags shortage → admin approves
  → If bulk: flags bulk prep → admin approves
  → Lead approves completed tasks
  → Inter-station requests for ingredients
  → Feedback submitted for recipe improvements
```

### Corporate B2B Workflow
```
Admin creates Company → sets benefit levels + par levels
  → Employees receive magic link email
  → Employee enters company PIN to verify
  → Browses published menu → places order
  → Order tracked with subsidy splits
  → Monthly invoices generated
  → Corporate orders sync to production plans
```

---

## 7. Authentication & Roles

| Role | Access |
|------|--------|
| `admin` | Full access to everything |
| `staff` | Dashboard, recipes, production planning |
| `kitchen` | Kitchen portal only (board, prep, tasks) |
| Corporate | Separate auth flow (magic link + PIN), isolated portal |

JWT tokens expire in 7 days. Stored in cookies on frontend.

---

## 8. Deployment Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Vercel          │     │  Render           │     │  Culinary DB     │
│  (frontend)      │────►│  (NestJS backend) │────►│  (Neon Project 1)│
│  Next.js SSR     │     │  Port 3001        │     │  schema.prisma   │
└─────────────────┘     │                    │     └──────────────────┘
                         │                    │
                         │                    │     ┌──────────────────┐
                         │                    │────►│  Commerce DB     │
                         │                    │     │  (Neon Project 2)│
                         └──────────────────┘     │  schema.commerce │
                              │                    └──────────────────┘
                    ┌─────────┼──────────┐
                    ▼         ▼          ▼
              Shopify     MealPrep    Resend
              Webhooks    Sync API    Email API
                                        │
                                     Helcim
                                     (Canadian payment processor, planned)
```

**Key point: ONE backend app connects to TWO separate Neon databases.** The culinary DB and commerce DB are completely independent Neon projects with their own connection strings, billing, backups, and scaling.

| DB | Neon Project | Project ID | Org | Status |
|---|---|---|---|---|
| Culinary | `culinary-ops` | `rapid-lake-47793035` | Gurleen (`org-square-mode-90173696`) — shared w/ Conner | Live |
| Commerce | `betterday-commerce` | `spring-fire-44871408` | BetterDay Food Co (`org-lucky-feather-83886908`) | **Provisioned 2026-04-08** (branches: `main`, `dev`) |

### Environment Variables
```
# Backend
# ─── Culinary DB (Gurleen's Neon project) ───
DATABASE_URL=postgresql://.../culinary            # Pooled (runtime queries)
DIRECT_URL=postgresql://.../culinary              # Direct (Prisma migrations)

# ─── Commerce DB (betterday-commerce Neon project) ───
COMMERCE_DATABASE_URL=postgresql://.../neondb     # Pooled, points at `dev` branch locally, `main` on Render
COMMERCE_DIRECT_URL=postgresql://.../neondb       # Direct, same branch pattern

# ─── Auth / app config ───
JWT_SECRET=...
JWT_EXPIRATION=7d
SHOPIFY_WEBHOOK_SECRET=...
FRONTEND_URL=https://...
FRONTEND_URLS=https://a,https://b                 # Optional multi-origin allow-list for CORS
RESEND_API_KEY=...
RESEND_FROM_EMAIL=noreply@betterday.com.au

# ─── Payments (Helcim — replaces planned Stripe) ───
HELCIM_API_TOKEN=...                              # Planned
HELCIM_WEBHOOK_SECRET=...                         # Planned

PORT=3001

# Frontend
NEXT_PUBLIC_API_URL=https://.../api
NEXT_PUBLIC_HELCIM_CHECKOUT_TOKEN=...             # Planned (for HelcimPay.js)
```

---

## 9. Collaboration Rules

### Folder Ownership
| Folder | Owner | Rule |
|--------|-------|------|
| `frontend/` | Gurleen | Conner cannot merge changes here without Gurleen's PR approval |
| `backend/src/modules/` | Shared | Both can contribute via PR |
| `backend/prisma/` | Shared | Both review schema changes |
| `conner/` | Conner | Conner's workspace, Gurleen reviews PRs |

### Git Workflow
1. Never push directly to `main` — branch protection is active (ruleset enforced)
2. Create feature branches: `conner/feature-name` or `gurleen/feature-name`
3. Open PR → get 1 approval → merge
4. CODEOWNERS auto-assigns reviewers based on files touched
5. Bypass list is empty — nobody can skip the rules
6. See `.github/CONTRIBUTING.md` for full rules

---

## 10. E-Commerce Expansion — Architecture Decisions

### Q1: Where does the Commerce DB live?

**Answer: Option (a) — New Neon project, new database. Completely separate from culinary ops.**

> **STATUS: Provisioned 2026-04-08.** Project `betterday-commerce` (id `spring-fire-44871408`) lives in Conner's `BetterDay Food Co` org (id `org-lucky-feather-83886908`). Two branches: `main` (production) and `dev` (local work, forked from main). Default database: `neondb`, role `neondb_owner`. Real connection strings in `backend/.env` (gitignored). See `conner/data-model/commerce-neon-setup.md` for full reference.

| Reason | Detail |
|--------|--------|
| **Isolation** | Culinary ops has 20+ tables, 22 modules. It's already complex. Commerce data (carts, payments, customer accounts) is a completely different domain. |
| **Traffic protection** | E-commerce traffic is unpredictable (marketing spikes, promotions). If commerce gets hammered, kitchen staff should never lose access to their production board. |
| **Independent scaling** | Commerce may grow to 10x the culinary DB size. Separate Neon project scales independently. |
| **Financial compliance** | Payment records, customer PII, and order history often need different retention policies than operational kitchen data. |
| **Clean billing** | Separate Neon project = clear cost tracking per domain. |
| **Team separation** | If commerce is ever handed off to another dev or team, the data is cleanly separated. No risk of touching kitchen ops. |
| **Cost** | Neon free tier covers both projects — no extra cost at current scale. |

### Q2: Same NestJS app or new repo?

**Answer: Same repo, same NestJS app, same deploy. New modules + second Prisma schema file.**

```
ONE repo
ONE NestJS backend
ONE deploy pipeline
TWO databases (two separate Neon projects)
TWO Prisma schema files
```

| Reason | Detail |
|--------|--------|
| **Shared types** | Commerce modules can import meal types, categories, pricing from culinary modules without API calls. |
| **One deploy** | Less operational overhead for a 2-person team. One CI/CD, one server, one monitoring. |
| **Lower complexity** | No inter-service communication, no API gateway, no service mesh. Just module imports. |
| **Bounded context at data layer** | Two Prisma schemas pointing to two different Neon projects. Full data isolation with code-level convenience. |

### How the two databases connect inside one app:

```
backend/
├── prisma/
│   ├── schema.prisma              → DATABASE_URL (Neon Project 1: Culinary)
│   └── schema.commerce.prisma     → COMMERCE_DATABASE_URL (Neon Project 2: Commerce)
```

```typescript
// Two separate Prisma clients in the same NestJS app
@Injectable()
export class CulinaryPrismaService extends PrismaClient {
  // connects to DATABASE_URL — existing culinary data
}

@Injectable()
export class CommercePrismaService extends PrismaClient {
  // connects to COMMERCE_DATABASE_URL — new commerce data
}
```

Existing modules (ingredients, meals, production, kitchen, corporate) use `CulinaryPrismaService`.
New commerce modules use `CommercePrismaService`.
Commerce modules can read from culinary (e.g., get meal catalog) through service imports — no API calls needed.

### Q3: What does the commerce side NOT do?

- Does NOT duplicate meal/ingredient data — reads it from culinary modules
- Does NOT handle kitchen operations — that stays in culinary
- Does NOT share auth with staff/kitchen — customers get their own auth (email + password, separate from JWT staff login)
- Does NOT touch the culinary database — ever

### Planned Commerce Database Tables (schema.commerce.prisma)

Draft shapes live in `conner/data-model/entities.md` — that's the product spec.
When we write `schema.commerce.prisma` we translate from there. Starter set:

```
Customer            — email, phone, password_hash (nullable for OAuth-only accounts),
                      helcim_customer_id, apple_id_sub, google_id_sub,
                      status enum (active | paused_indefinite | cancelled | unclaimed),
                      source enum (signup | apple_pay_express | google_pay_express |
                                   gift_redeem | admin),
                      allergens[], diet_tags[], disliked_meals[], favorite_meals[],
                      internal_notes, tags[] (admin-only), created_at, updated_at
CustomerAddress     — label (Home/Office), type (delivery/pickup), recipient_name,
                      recipient_phone, full street fields, delivery_instructions, is_default
CustomerPreference  — sms_opt_in, email_opt_in, notification channels
Cart + CartItem     — shopping cart with quantities, expiry
Order + OrderItem   — completed orders with payment status, delivery date,
                      snapshot fields (billing_contact, line_items immutable after placement)
Payment             — Helcim charge records (not Stripe)
PaymentMethod       — saved Helcim card tokens
Subscription        — recurring meal plan (weekly/monthly, build-a-cart model)
WeeklyCartRecord    — per-customer per-week snapshot driving the cart report
Coupon              — discount codes with rules (% off, $ off, min order)
GiftCard            — gift card codes and balances
```

**Auth design notes:**
- `status = 'unclaimed'` is for accounts auto-created via Apple Pay / Google Pay Express checkout — the customer can later "claim" by setting a password.
- OAuth (Sign in with Apple, Google) is in scope — see `conner/data-model/decisions/2026-04-08-apple-pay-and-accounts.md`.
- Customer auth is completely separate from the staff JWT (`User` table in culinary DB).

### Planned Commerce Backend Modules

```
backend/src/modules/
├── commerce-catalog/         # Read meals from culinary DB, expose as products
├── commerce-cart/            # Cart management (add, remove, update qty)
├── commerce-checkout/        # Helcim integration, order creation
├── commerce-orders/          # Order history, status tracking
├── commerce-customers/       # Customer registration, login, profile (incl. OAuth)
└── commerce-subscriptions/   # Recurring meal plan management (Helcim Recurring API)
```

### Planned Commerce Frontend Routes

The customer-facing site is built **from scratch in `conner/client-website/`**,
consuming `brand/` as the source of truth for colors, fonts, and tokens.
This is a ground-up build — NOT a migration into Gurleen's `frontend/app/(storefront)/`.
If the final production site eventually lives under Gurleen's frontend, that's
a future handoff decision; for now, Conner owns the full client-website vertical
end-to-end.

```
conner/client-website/
├── README.md                 # Scope, workflow, page status table
├── index.html                # Landing page (first build target)
├── login.html                # Customer login + OAuth (Apple, Google)
├── menu/                     # Browse meals (reads from commerce-catalog API)
│   ├── index.html            # Grid of current-week meals
│   └── [meal-code].html      # Meal detail + nutrition + allergens
├── cart.html                 # Shopping cart
├── checkout.html             # Helcim checkout (HelcimPay.js)
├── account/                  # Customer hub
│   ├── index.html            # Profile, addresses, payment methods
│   ├── orders.html           # Order history
│   └── subscription.html     # Skip, pause, cancel, resize
├── about.html                # Our mission
└── faq.html                  # FAQ (CMS-editable later via SystemConfig)
```

**Pipeline:** build each page in `conner/client-website/`, co-evolve
`conner/data-model/entities.md` and `backend/prisma/schema.commerce.prisma`
with any newly-discovered fields, run `prisma migrate dev` to apply, repeat.
See `conner/data-model/decisions/2026-04-08-html-first-workflow.md` for the
full loop.

### Payments — Helcim (Canadian processor)

- **Helcim** for all payment processing — chosen over Stripe for Canadian business fit and simpler fee structure
- **HelcimPay.js** for PCI-safe card entry in the browser — we never touch raw card numbers
- **Helcim Recurring API** for weekly subscription billing (build-a-cart model produces variable-amount charges; need to verify Helcim Recurring supports variable amounts before finalizing the subscription module)
- **Helcim Customer API** for saved payment methods (customer + card objects)
- **Helcim webhooks** for payment events, charge success/failure, recurring renewals
- **Helcim customer IDs + card tokens** stored in Commerce DB, never in culinary DB
- **Tax:** Helcim has **no Stripe-Tax-equivalent auto-calculation.** We either (a) hardcode Alberta GST 5% initially and layer in multi-province rules as we expand, or (b) add a third-party tax service later (TaxJar, Avalara). Tracking as an open decision.
- **No Stripe dependencies anywhere** — if you see `stripe_customer_id` or `STRIPE_*` anywhere in code or docs, it's stale and should be replaced with the Helcim equivalent.

---

## 11. Data Scale

| Entity | Count |
|--------|-------|
| Ingredients | ~710 |
| Sub-Recipes | ~731 |
| Meals | ~463 |
| Customers (current via Shopify) | 4,000–5,000 |
| Corporate companies | Active B2B clients |

---

## 12. External Integrations

| Integration | Direction | Purpose | Status |
|-------------|-----------|---------|--------|
| Shopify | Inbound webhook | Order sync (HMAC validated) | Live |
| MealPrep | Outbound API | Publish production plans | Live |
| Resend | Outbound API | Corporate magic link emails | Live |
| Helcim | Both (API + webhook) | E-commerce payments + recurring billing (Canadian processor) | Planned |
| Apple Sign-In | OAuth | Customer auth | Planned |
| Google OAuth | OAuth | Customer auth | Planned |

---

## 13. For Claude Sessions (Conner)

When starting a new Claude session on this project:

1. **Read this file first** — it gives full context on what exists, what's planned, and architecture decisions
2. **Check `.github/CONTRIBUTING.md`** — for git workflow rules
3. **Check `conner/README.md`** — for workspace boundaries
4. **Prisma schema is the source of truth** — `backend/prisma/schema.prisma` defines all existing culinary models; commerce schema lives in `backend/prisma/schema.commerce.prisma` (to be created)
5. **API client shows all endpoints** — `frontend/app/lib/api.ts` (1,100+ lines)
6. **Don't modify `frontend/`** — Gurleen owns it, work in `conner/` or `backend/`
7. **For database changes** — edit the appropriate schema file, run `npx prisma migrate dev`, open a PR
8. **For new backend features** — create a new module in `backend/src/modules/`, follow existing patterns (controller + service + module + dto folder)
9. **For commerce work** — use `schema.commerce.prisma` (separate Neon DB), create modules prefixed with `commerce-`, and use a `CommercePrismaService` (not the default `PrismaService`) to connect
10. **Don't build a client-side database** — all data lives in Postgres via Prisma. Use API calls + SWR caching on frontend
11. **The collab board** — check github.com/betterday-foodco/collab for shared tasks and messages between Gurleen and Conner
12. **`brand/` is the universal source of truth** (colors, fonts, logos, tokens, site facts) — read `brand/README.md` to understand the two-layer system (file-based build-time tokens vs DB-backed runtime site facts). Never hardcode hex colors, fonts, or contact info anywhere outside `brand/`.
13. **`conner/client-website/` is the destination** for the final customer-facing site — built from scratch, consuming `brand/` directly, not a migration of Gurleen's frontend
14. **Neon MCP connected** — Claude sessions with the Neon MCP (`mcp__neon__*` tools) can query, migrate, and manage both Neon projects directly. See `conner/data-model/commerce-neon-setup.md` for project/branch IDs.

### Architecture Summary (for quick reference)
```
ONE repo         → culinary-ops
ONE backend      → NestJS with 22+ existing modules + planned commerce-* modules
ONE deploy       → Render (backend) + Vercel (frontend)

TWO Neon projects
  → culinary-ops       (rapid-lake-47793035, Gurleen's org, LIVE)
  → betterday-commerce (spring-fire-44871408, BetterDay Food Co org, PROVISIONED)

TWO Prisma schemas
  → schema.prisma           (culinary, live, 20+ models)
  → schema.commerce.prisma  (commerce, planned, 0 models today)

ONE universal source of truth
  → brand/ at repo root — colors, fonts, logos, tokens, site facts

FOUR UI contexts (the first three live in Gurleen's frontend/, the fourth in conner/)
  → (dashboard)          Gurleen's admin UI
  → (kitchen)            Kitchen staff ops
  → (corporate)          B2B portal
  → conner/client-website/   Customer-facing site (ground-up build, Conner-owned)
```


---

## 14. Progress Log

### 2026-04-08 — Commerce infrastructure + brand system sprint

**Landed (all on branch `conner/universal-brand-folder`, pushed to origin):**

- ✅ **`brand/` folder** at repo root — universal design source of truth. Colors, typography, tokens.css, design-tokens.md, BDSupper/Gaya/Sofia Pro fonts, logo PNG variants (Centered + Left Justified in Blue/Cream/Navy). Any product consumes from here; no per-product hardcoded hex values.
- ✅ **`conner/client-website/`** — empty destination folder scaffolded with README for the clean final customer-facing site. Build loop documented: pick page → rewrite consuming brand/ → update entities.md → add to schema.commerce.prisma → migrate → commit.
- ✅ **`conner/data-model/`** — pulled from legacy betterday-webapp repo. entities.md (canonical product spec), 3 flow docs, 5 dated ADRs including html-first workflow and apple-pay-and-accounts.
- ✅ **`conner/app/`** — pulled from legacy betterday-webapp repo. HTML prototypes (subscriber-hub-2.0, menu-overlay, login, diet-selector, betterday-v2_81), assets, shared/ site-shell infrastructure.
- ✅ **`betterday-commerce` Neon project provisioned** in `BetterDay Food Co` org (id `spring-fire-44871408`). Branches: `main` + `dev`. Connection strings in `backend/.env` (gitignored).
- ✅ **`backend/.env.example` updated** with commerce env vars, multi-origin CORS hint, direct-URL pattern for Neon migrations.
- ✅ **`GET /api/system-config/public` endpoint built** — unauthenticated read returning only `public.*` keys (stripped prefix). Separate controller file for isolation.
- ✅ **`backend/src/main.ts` CORS** — multi-origin allow-list via `FRONTEND_URLS` env var (backward compatible with legacy `FRONTEND_URL`).
- ✅ **`backend/prisma/seed.ts`** — extended to seed public.* site info keys from `brand/site-info.seed.json` on first run (idempotent, never overwrites admin edits).
- ✅ **`conner/data-model/commerce-neon-setup.md`** — non-secret reference doc for Neon IDs, branch IDs, env var conventions.
- ✅ **Helcim replaces Stripe** — architectural decision captured throughout this doc. `brand.purple-dark` also corrected from `#7C3AED` to `#7453A2`.
- ✅ **OAuth (Apple + Google) + `customer.status = 'unclaimed'`** confirmed in scope for customer auth.
- ✅ **`brand/logos/Logo (Left Justified)/Cream (2).png`** renamed to `Blue.png` — was mis-labeled (file was actually the blue variant). Left Justified folder now has the clean Blue/Cream/Navy trio matching the Centered folder.

**Still to ship (next pass):**

- [ ] `backend/prisma/schema.commerce.prisma` — initial 5-table starter set (Customer, CustomerAddress, PaymentMethod, CustomerOrder, Subscription) translated from `entities.md`
- [ ] First migration (`prisma migrate dev --name init`) against the `dev` branch to materialize tables
- [ ] `CommercePrismaService` in NestJS — second Prisma client pointing at `COMMERCE_DATABASE_URL`
- [ ] First commerce module (likely `commerce-customers` — auth + profile + addresses)
- [ ] First page in `conner/client-website/`: homepage (`index.html`) built fresh, consuming `brand/tokens.css`, proving the end-to-end brand pipeline
- [x] ~~Helcim Recurring API research — verify variable-amount weekly subscriptions are supported before committing to the subscription module architecture~~ **Resolved 2026-04-09:** the Recurring API is the wrong model for our use case — BetterDay's weekly subscription is a variable-amount merchant-initiated card-on-file (MIT) charge, not a fixed-cadence fixed-amount subscription. Full research in `conner/data-model/helcim-integration.md`, implementation plan in `conner/data-model/helcim-integration-plan.md`. Three blocking open questions remain pending Helcim support contact (MIT flag, ipAddress on MIT, dispute webhooks) — see research §14.
- [ ] Future: transfer `culinary-ops` Neon project ownership from Gurleen's org to `BetterDay Food Co` org so both projects live under one umbrella
