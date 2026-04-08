# Conner's Workspace

This folder is Conner's area for development work on the culinary-ops project.

## Structure

```
conner/
  prototypes/   -- HTML mockups, UI experiments, design iterations
  ecommerce/    -- e-commerce frontend work (when ready)
```

## Rules

- Work on your own feature branch (e.g., `conner/feature-name`)
- Never push directly to `main` — always open a PR
- Don't modify files in `frontend/` — that's Gurleen's territory
- Database changes go in `backend/prisma/schema.prisma` via a PR
- Run `npx prisma migrate dev` after schema changes to generate migrations
