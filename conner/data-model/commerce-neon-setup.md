# Commerce Neon Setup — Reference

**Purpose:** document the `betterday-commerce` Neon project metadata so
future Claude sessions / readers know what exists, where, and how to
connect. Secrets live in `backend/.env` (gitignored) — this file only
holds **non-sensitive IDs and structure**.

---

## Organization

| Field | Value |
|---|---|
| Org name | `BetterDay Food Co` |
| Org ID | `org-lucky-feather-83886908` |
| Plan | Free |
| Owner | Conner (GitHub: `conner-kadz`) |
| Created | 2026-04-08 |

## Project

| Field | Value |
|---|---|
| Project name | `betterday-commerce` |
| Project ID | `spring-fire-44871408` |
| Region | `aws-us-west-2` |
| Postgres version | 17 |
| Plan | Free tier |
| Created | 2026-04-08 |

## Branches

| Branch | Branch ID | Purpose |
|---|---|---|
| `main` | `br-wandering-paper-ak95715o` | Production (deployed site reads from this) |
| `dev` | `br-icy-river-akvz3mg6` | Development (local work, migrations, experiments — forked from main) |

## Default database

| Field | Value |
|---|---|
| Database name | `neondb` |
| Role | `neondb_owner` |

**Note:** we kept Neon's default `neondb` name rather than renaming to
`betterday_commerce`. It doesn't matter — the project name provides the
context. Renaming the database is a future cleanup if we care.

---

## Environment variable names

The backend connects via:

| Env var | Points at | Used by |
|---|---|---|
| `COMMERCE_DATABASE_URL` | Pooled connection (fast, auto-scaling) | Runtime queries from NestJS modules |
| `COMMERCE_DIRECT_URL` | Direct connection (needed for migrations) | `prisma migrate`, introspection, some admin queries |

Locally, both point at the `dev` branch. On Render (production deployment),
they're overridden to point at `main`.

**Direct URL trick:** to convert a pooled URL to a direct URL, remove the
`-pooler` segment from the hostname. Everything else stays the same.
Example:
- Pooled: `ep-shiny-meadow-akuwrg9l-pooler.c-3.us-west-2.aws.neon.tech`
- Direct: `ep-shiny-meadow-akuwrg9l.c-3.us-west-2.aws.neon.tech`

---

## Sister project (culinary-ops)

The other Neon project involved is Gurleen's `culinary-ops`:

| Field | Value |
|---|---|
| Project name | `culinary-ops` |
| Project ID | `rapid-lake-47793035` |
| Owner | `Gurleen` (`org-square-mode-90173696`) |
| Access level | Shared with Conner (collaborator) |
| Plans | May be transferred to `BetterDay Food Co` org in the future |

When culinary-ops transfers ownership, both projects will live under the
same `BetterDay Food Co` organization. Connection strings stay identical
across the transfer (project IDs don't change).

---

## What still needs to happen

- [ ] `backend/prisma/schema.commerce.prisma` — the initial schema file with
  Customer, Address, PaymentMethod, Order, Subscription, and any other
  tables needed by the HTML prototypes we're cleaning up
- [ ] First migration (`prisma migrate dev --name init`) against the `dev`
  branch to materialize those tables
- [ ] `CommercePrismaService` in the NestJS backend — a second Prisma
  client pointing at `COMMERCE_DATABASE_URL`
- [ ] Wire the first commerce module (probably `commerce-customers` or
  `commerce-catalog`) to that client
- [ ] When deploying: set `COMMERCE_DATABASE_URL` in Render's env var
  dashboard to the `main` branch URL, not the `dev` branch URL

---

## Safe access to secrets

- **Local dev:** `backend/.env` holds real connection strings. Gitignored.
- **Production:** Render's env var UI. Never committed to git.
- **Rotating credentials:** `mcp__neon__*` tools via Claude Code can
  rotate roles / reset passwords in a few calls if a leak happens. The
  connection strings in `.env` can be refreshed by running
  `mcp__neon__get_connection_string` and updating the file.

---

## How to query the commerce DB from Claude (for diagnostics)

Any Claude session with the Neon MCP connected can run queries against
the dev branch directly:

```
mcp__neon__run_sql with:
  projectId: "spring-fire-44871408"
  branchId:  "br-icy-river-akvz3mg6"   (dev)
  databaseName: "neondb"
  sql: "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
```

For migrations and bigger changes, use `mcp__neon__prepare_database_migration`
which creates a temporary branch, applies the change, and returns results
for verification before merging to main.
