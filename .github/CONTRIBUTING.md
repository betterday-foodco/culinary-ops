# Contributing to Culinary Ops

## Branch Naming

Use this format for your branches:

- `conner/feature-name` — Conner's feature branches
- `gurleen/feature-name` — Gurleen's feature branches
- `fix/description` — bug fixes
- `db/description` — database/schema changes

## Workflow

1. Pull latest `main`: `git pull origin main`
2. Create your branch: `git checkout -b conner/your-feature`
3. Make changes, commit with clear messages
4. Push: `git push -u origin conner/your-feature`
5. Open a PR on GitHub targeting `main`
6. Wait for review and approval before merging

## What Goes Where

| Area | Owner | Who Can Edit |
|------|-------|-------------|
| `frontend/` | Gurleen | Gurleen only |
| `backend/src/modules/` | Shared | Both (via PR) |
| `backend/prisma/` | Shared | Both (via PR, both review) |
| `conner/` | Conner | Conner (Gurleen reviews) |

## Database Changes

- Edit `backend/prisma/schema.prisma`
- Run `npx prisma migrate dev --name describe-your-change`
- Commit both the schema and the generated migration
- Always open a PR for schema changes — never push directly

## Do NOT

- Push directly to `main`
- Modify files outside your designated area without a PR
- Create a separate client-side database
- Change `frontend/` files without Gurleen's explicit approval
