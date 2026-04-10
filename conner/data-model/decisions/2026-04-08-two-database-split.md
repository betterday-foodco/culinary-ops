# ADR: Two-Database Architecture — Culinary Ops + Commerce

**Date:** 2026-04-08
**Status:** Accepted
**Deciders:** Conner (with Gurleen informed)
**Supersedes:** An earlier verbal alignment on "monolithic single-DB" — now reversed.

---

## Context

BetterDay's backend needs to hold two logically distinct kinds of data:

1. **Internal culinary operations** — ingredients, sub-recipes, meals, portion
   specs, production plans, kitchen portal state, tasting notes, corporate
   B2B orders, system config, tags. Already built by Gurleen in the
   `culinary-ops` NestJS + Prisma project, deployed on Render, backed by a
   single PostgreSQL database (`schema.prisma`).

2. **Customer-facing commerce** — subscriber accounts, cart, checkout, payment
   methods, orders, subscription management, CMS-editable marketing content,
   loyalty/referrals. None of this exists yet. Planned NestJS modules are
   listed in `PROJECT_SCOPE.md` as `commerce-catalog`, `commerce-cart`,
   `commerce-checkout`, `commerce-orders`, `commerce-customers`,
   `commerce-subscriptions`.

Earlier in planning, I (Conner) said "stay monolithic — one database for
everything." That was a snap answer given under time pressure. On reflection,
the monolithic model is the wrong call for our situation. This ADR documents
the corrected direction.

---

## Options considered

### Option A — Monolithic (previously chosen, now rejected)

Single PostgreSQL database. Both culinary ops AND commerce data live in
`schema.prisma`. New commerce modules become NestJS modules in the same
app, sharing the Prisma client.

- **Pro:** faster MVP — no new infra, no cross-DB joins to worry about
- **Pro:** shared auth (one JWT, one User table)
- **Con:** schema gets big fast. Current `schema.prisma` is already 814 lines
  / 40+ models for culinary ops alone. Adding 6+ commerce modules bloats it
  toward 1500+ lines.
- **Con:** backup / restore / migration / scaling affects BOTH domains at once.
  A kitchen-ops migration gone wrong could take down customer checkout, and
  vice versa.
- **Con:** blurs ownership — Gurleen owns culinary, Conner owns commerce, but
  with one schema file they're constantly merge-conflicting on the same file.
- **Con:** can't rearrange independently later. Spinning out commerce as a
  separate service in 18 months becomes a data-migration project instead of
  a pointer change.
- **Con:** different performance profiles. Culinary ops is read-heavy
  from kitchen staff (dozens of users, internal). Commerce is read+write
  heavy from the public (thousands of users, public internet). They should
  scale and be cached differently.

### Option B — Two databases, one NestJS app

One backend app, one deployment, but two Prisma schemas:

- `schema.prisma` — culinary (Gurleen's existing schema, unchanged)
- `schema.commerce.prisma` — commerce (new, on Neon)

Both schemas generate their own Prisma clients under separate names
(`PrismaClient` and `CommercePrismaClient`). NestJS modules inject whichever
they need. Single `culinary-ops-api.onrender.com` deployment serves both.

- **Pro:** clean ownership split — Gurleen never edits commerce schema,
  Conner never edits culinary schema. Merge conflicts on `*.prisma` disappear.
- **Pro:** independent migrations — running a commerce migration doesn't
  touch the culinary DB, and vice versa.
- **Pro:** different DB tiers — commerce can use Neon's auto-scaling
  (better for spiky public traffic), culinary stays on the existing
  provisioned Postgres (stable for internal kitchen load).
- **Pro:** still one API, one JWT, one auth flow — no cross-service latency
  from day one.
- **Con:** cross-DB reads require an explicit bridge (e.g. when the commerce
  side needs meal data, it has to call into a culinary service, not just
  Prisma-join). This is actually a **feature** — forces clean interfaces.
- **Con:** slightly more Prisma scaffolding (two clients, two migrate commands)

### Option C — Two databases, two separate backend services

Culinary-ops backend stays as-is. New `commerce-api` backend, separate repo
or subfolder, separate deployment, hits the Neon DB exclusively.

- **Pro:** maximal separation
- **Con:** introduces cross-service auth (customer JWT has to be verified on
  both sides)
- **Con:** two deploy pipelines, two sets of env vars, two logs to check
- **Con:** cross-service calls add latency for anything that spans (e.g. menu
  page fetching meal info from culinary + cart info from commerce)
- **Con:** overkill for current team size (1 backend dev + 1 occasional
  frontend dev)

---

## Decision

**Option B — Two databases, one NestJS app, one deployment.**

- Existing culinary PostgreSQL stays on whatever Gurleen picked
  (Render-hosted or similar — it's already provisioned)
- **New Neon PostgreSQL database** for commerce. Project is being set up
  right now.
- New schema file: `backend/prisma/schema.commerce.prisma`
- Two Prisma clients generated side-by-side:
  ```
  schema.prisma           → @prisma/client            → imports as PrismaClient
  schema.commerce.prisma  → @prisma/client-commerce   → imports as CommercePrismaClient
  ```
- Commerce NestJS modules inject `CommercePrismaClient` via a dedicated
  `CommercePrismaService`. They never touch the culinary schema directly.
- When commerce code needs culinary data (e.g. menu items), it calls the
  existing culinary services as injected dependencies — a clean in-process
  boundary, no HTTP hop.
- Auth stays unified: JWT issued by culinary-ops `auth` module, valid for
  both culinary and commerce endpoints. One User / Customer table in
  culinary handles identity; commerce has its own `Customer` record that
  references the culinary User by ID.

---

## What lives where

| Domain | Schema | Examples |
|---|---|---|
| **Culinary ops** | `schema.prisma` (existing) | Ingredient, SubRecipe, MealRecipe, ProductionPlan, KitchenStation, DailyChecklist, CorporateCompany, CorporateOrder, SystemConfig, Tag, WebhookLog |
| **Commerce** | `schema.commerce.prisma` (new, Neon) | Customer, Address, PaymentMethod, Cart, CartItem, Order, Subscription, SubscriptionSchedule, LoyaltyPoints, Referral, CMSContent, Banner, FAQ, Coupon |

Ambiguous cases resolved:

- **`SystemConfig` (site facts: email, phone, social URLs)** → stays on
  **culinary** DB. Not commerce-specific; admin dashboard for editing is
  Gurleen's UI. The public endpoint
  `GET /api/system-config/public` already exists there.
- **FAQ / CMS marketing content** → **commerce** DB. Tied to the customer
  site, editable from the e-commerce admin eventually.
- **User authentication / login** → **culinary** DB (the `User` table).
  Commerce's `Customer` joins to it by `user_id`.
- **Menu data (what meals are available this week)** → **culinary**
  (`MealRecipe` is authoritative). Commerce reads through an injected
  service call, not a direct Prisma query.

---

## Consequences

### Good

- Schema files stay readable. Culinary schema remains ~800 lines; commerce
  schema grows organically without bloating culinary.
- Gurleen and Conner stop merge-conflicting on `schema.prisma`.
- Migrations become safer — a commerce migration can't break kitchen ops.
- Neon's branching + auto-scale + zero-downtime restarts are a great fit
  for a customer-facing DB with unpredictable load.
- The clean boundary between culinary and commerce means future options stay
  open (extract commerce into its own service, give commerce a different
  hosting region, etc.) without a migration project.

### Costs

- Slightly more ceremony: two Prisma clients, two migrate commands, two
  connection strings in env. Maybe ~2 hours of setup, then transparent.
- Cross-domain reads (commerce needing menu info) have to go through
  culinary services. A small amount of interface code — but forces healthy
  separation.
- Two `DATABASE_URL`-style env vars in Render dashboard instead of one.
  (Add `COMMERCE_DATABASE_URL` alongside existing `DATABASE_URL`.)

### Explicitly accepted

- We will NOT try to share Prisma models across schemas. Each side owns
  its own types.
- We will NOT run cross-DB joins in Postgres (no FDW, no dblink, no
  postgres_fdw). All cross-domain data flows through NestJS services.
- We will NOT build a commerce schema until at least 2–3 customer-facing
  HTML prototypes are stable (per the HTML-first workflow ADR). First real
  commerce schema PR lands after Menu, Cart, and Checkout prototypes exist.

---

## Implementation checklist (for later, when commerce backend starts)

1. Create new Neon project (already in progress — Conner handling)
2. Add `COMMERCE_DATABASE_URL` to `.env` and Render dashboard
3. Create `backend/prisma/schema.commerce.prisma` (starts empty, grows per
   prototype)
4. Update `backend/package.json` with a `prisma:commerce` script alias:
   ```json
   "prisma:commerce": "prisma migrate dev --schema=prisma/schema.commerce.prisma"
   ```
5. Configure Prisma multi-schema generation so both clients coexist
6. Create `backend/src/prisma/commerce-prisma.service.ts` — analogous to the
   existing `PrismaService` but for the commerce client
7. First commerce NestJS module uses this service; validates the setup works
8. Update `PROJECT_SCOPE.md` to remove the `[PLANNED]` tag on the commerce
   schema line

---

## References

- Previous ADR: `2026-04-08-html-first-workflow.md` — the workflow that
  defers backend work until UI prototypes are stable. This ADR explains what
  the backend will look like WHEN we get there.
- `PROJECT_SCOPE.md` Section 3: repository structure already lists
  `schema.commerce.prisma` as `[PLANNED]`. This ADR is the formal adoption
  of that plan.
- `brand/README.md` Layer 2: runtime config flows through culinary's
  `SystemConfig` endpoint, not commerce. That boundary is specified here.
