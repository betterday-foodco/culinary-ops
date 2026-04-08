# BetterDay Data Model

This folder is the canonical source of truth for how data is shaped in
the BetterDay web app. The HTML files in `../app/` are UI prototypes;
this folder describes what those prototypes assume about the backend.

When we build the real database, the contents of this folder become
the migration files and API specs.

---

## Structure

```
data-model/
├── README.md                ← you are here
├── entities.md              ← canonical data shapes (the eventual DB schema)
├── flows/
│   ├── subscriber-hub.md    ← how data moves through the main hub tabs
│   ├── checkout.md          ← 4-step accordion checkout + Apple Pay + gifts
│   └── menu-overlay.md      ← the full-screen menu / cart editor
└── decisions/
    ├── 2026-04-07-checkout-accordion-rebuild.md
    ├── 2026-04-07-gift-flow-architecture.md
    ├── 2026-04-08-apple-pay-and-accounts.md
    └── 2026-04-08-html-first-workflow.md
```

## The three parts

| File / folder | Purpose | When to update |
|---|---|---|
| `entities.md` | Canonical data shapes. Every table, every field, every type. The eventual DB schema lives here first in plain English. | Whenever you add or change fields in any module. |
| `flows/` | Per-module docs describing how data moves through a specific feature. One file per module. | When you build or significantly change a module. |
| `decisions/` | Architecture Decision Records (ADRs). "We considered X and Y, picked Y because Z." One file per significant decision, dated. | When you make a meaningful design choice you'll want to remember the reasoning for later. |

## Status legend used in this folder

- ✅ **Stable** — implemented, tested, and consistent between the prototype and this doc
- 🚧 **In progress** — being actively built, may change
- 💭 **Proposed** — not built yet, under discussion
- ⚠️ **Known issue** — documented problem that needs to be resolved
- 🗑 **Deprecated** — used to exist, removed, kept in doc for history

## How to use this folder

### When you're building a new module

1. Skim `entities.md` to see what data already exists
2. Decide if you need new entities or new fields on existing ones
3. Add them to `entities.md` as 🚧 "In progress"
4. Create a new `flows/<module-name>.md` describing the feature
5. Build the HTML prototype (in `../app/`) with mock data matching the entity shapes
6. As you iterate and discover things, update `entities.md` accordingly
7. Once the module is stable, mark the entities as ✅
8. If you made a significant design decision, drop a short ADR in `decisions/`

### When you're making a big design decision

1. Create a new file in `decisions/` named `YYYY-MM-DD-short-title.md`
2. Write:
   - **Context** — what problem you're solving
   - **Options considered** — what approaches you evaluated
   - **Decision** — which one you picked
   - **Rationale** — why
   - **Tradeoffs / consequences** — what this locks you into
3. Commit it. It's a historical record, don't edit later unless you're
   adding a note like "this decision was later reversed, see YYYY-MM-DD-xxx.md"

### When you're ready to build the real backend

Hand this whole folder to your backend developer (or to Claude) and say:

> "Build me the real backend from this data model. Use Supabase / Postgres.
> `entities.md` becomes the migration file, `flows/` become the API endpoint
> specs, `decisions/` answers the 'why' questions."

The translation from this folder to a real schema should be mechanical.

---

## Golden rules

1. **If it's not in `entities.md`, it's not in the real app.** Mock data
   in the HTML doesn't count until the shape is documented here.

2. **Keep `entities.md` and the HTML in sync.** If you change a field
   in one, change it in the other in the same commit. Don't let them drift.

3. **Snapshot fields are sacred.** Historical data (like `orders.billing_contact`
   or `orders.line_items`) is a snapshot at the time of the order and
   should never be mutated. If the customer updates their email later,
   their old orders still show the old email.

4. **Separate account data from order data.** Things that belong to the
   customer over time (profile, addresses, payment methods) are their own
   entities. Things that belong to a specific order (line items, totals,
   billing contact snapshot) live on the order.

5. **Always include a created_at and updated_at on every entity.** Audit
   trail matters for customer support.
