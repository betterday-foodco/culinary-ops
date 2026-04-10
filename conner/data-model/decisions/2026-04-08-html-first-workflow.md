# ADR: HTML-First Development Workflow

**Date:** 2026-04-08
**Status:** Accepted
**Deciders:** Conner

---

## Context

BetterDay is a single-founder-led product. Conner is comfortable
building HTML prototypes but not as comfortable with database design,
backend frameworks, or formal software architecture. The question:

> *"Is it okay to keep building HTML prototypes with mock data and
> worry about the database later? Or do I need to do it the 'proper'
> way where I design the schema first?"*

---

## Options considered

### Option A: Database-first (traditional backend development)
- Design the schema in a diagramming tool or as SQL
- Build API endpoints
- Then build the UI to match
- **Pro:** "proper" engineering practice
- **Con:** over-engineers schemas for features that get cut
- **Con:** slows down UX iteration — UI experiments require schema changes
- **Con:** doesn't match Conner's strengths or natural workflow

### Option B: Figma-first (design-then-build)
- Mock everything in Figma
- Then build HTML/CSS to match the Figma
- Then build database
- **Pro:** separates design from implementation
- **Con:** Figma can't simulate real interaction state
- **Con:** introduces an extra "translate Figma to code" step
- **Con:** Conner doesn't use Figma heavily

### Option C: HTML-first with data contracts (chosen)
- Build HTML prototypes with mock data
- Iterate on UX until it feels right
- Document data shapes in a `data-model/` folder alongside the HTML
- Build real backend only after data model is stable
- **Pro:** matches Conner's strengths and natural workflow
- **Pro:** real interactive prototypes from day one
- **Pro:** avoids building features that don't get used
- **Pro:** discovering edge cases in the UI BEFORE committing to backend
- **Con:** mock data can hide real-world complexity (like the contact
  edits not persisting bug)
- **Con:** requires discipline to keep data-model docs in sync with HTML

---

## Decision

**Option C — HTML-first with a parallel `data-model/` folder.**

Conner builds the UI prototypes in HTML with mock data. In parallel,
the `data-model/` folder gets updated as new features are added, so
when it's time to build the real backend, the translation is mechanical.

---

## The workflow (per module)

1. **Sketch the UI in HTML** with mock data objects. Work visually,
   iterate freely.

2. **Iterate on UX** by clicking through the prototype. Get feedback
   from Amy, real customers, etc.

3. **Update `data-model/entities.md`** with any new fields or new
   entities you introduced. 2 minutes per feature.

4. **Add a `data-model/flows/<module>.md`** if it's a new module.
   Describes how data moves through the feature.

5. **Write an ADR in `data-model/decisions/`** if you made a meaningful
   architectural choice you want to remember the reasoning for later.

6. **Commit everything together** in one git commit — HTML + data-model
   updates in sync.

7. **Ship the next module** and repeat.

## When to switch to the real backend

After 3–5 modules are stable (UI + data model both settled), sit down
and consolidate:

1. Review `entities.md` for duplicates, naming inconsistencies, missing
   fields
2. Pick a backend (Supabase recommended — Postgres + built-in auth + RLS)
3. Translate `entities.md` → migration file (the shapes are already
   defined, just add SQL syntax)
4. Translate `flows/*.md` → API endpoint specs
5. Replace mock data in the HTML with real API calls one module at a time
6. The HTML itself barely changes; only the data source does

## Enforcement

- The author (usually Claude) updates `data-model/` IN THE SAME COMMIT
  as the HTML change. No drift allowed.
- New modules start with a new `flows/<module>.md` file before the
  HTML is built.
- Significant design decisions get an ADR. Otherwise we re-litigate
  the same decision 6 months later.

---

## Consequences

- The `data-model/` folder becomes the canonical source of truth for
  the eventual backend schema. Hand it to any backend dev (or Claude)
  and say "build me this."
- The HTML prototypes stay clean — state management, mock data, inline
  comments pointing at the data model
- Commits always bundle UI + data-model changes together, so git
  history shows the full evolution of the system
- Switching to the real backend is a ~1-week sprint instead of a
  ground-up rewrite, because 80% of the design work is already done
- This workflow is NOT how traditional software teams work — Conner
  should not feel bad about that. It's how most successful solo
  founders and early-stage startups actually build

## Known risks

- **Mock data drift.** If the mock data in HTML starts diverging from
  what `entities.md` describes, the real backend won't match the
  prototype. Mitigation: always update both in the same commit.
- **Happy-path bias.** Mock data only tests the happy path. Real data
  will have edge cases (nulls, 0 items, 100 items, ancient accounts).
  Mitigation: add "edge cases to test" notes in each `flows/` doc.
- **Relationship ambiguity.** HTML mock data doesn't clearly show whether
  nested objects are snapshots or references. Mitigation: document this
  explicitly in `entities.md` — each field marked as a snapshot or a fk.
