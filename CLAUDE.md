# CLAUDE.md — auto-read operating manual

**This file is auto-loaded into every Claude Code session in this repo.** It's
the short, durable list of rules and pointers that every chat needs to know
at startup, regardless of which worktree, branch, or topic it's working on.

Keep this file short. Anything longer or more situational belongs in
`conner/README.md` or a domain doc. The goal here is: *if a chat reads only
this file, it knows enough to not break anything and to find the rest.*

> Maintained by Conner. Last updated 2026-04-09.

---

## 0. Read these next (in this order)

Every chat should read these files on startup, in addition to this one:

1. **`conner/README.md`** — the full multi-chat + worktrees workflow, the
   4 habits, the pre-push 5-check audit, the never-do list, Neon nuances.
   This is the canonical reference for how to work in this repo.
2. **`PROJECT_SCOPE.md`** — the architectural source of truth. Read this
   before proposing any cross-cutting design change. Section 10 has the
   "two Neon projects, one NestJS backend" commerce decision. Section 14
   has the progress log.
3. **`conner/data-model/commerce-neon-setup.md`** — non-secret Neon project
   IDs, branch IDs, env var names, and how to run commerce migrations.
   Read before touching any commerce Prisma schema.
4. **`conner/deferred-decisions.md`** — running list of edge cases, pending
   design decisions, implementation TODOs, and future ideas that came up in
   prior chats. **Scan this on startup** to see what's outstanding that
   might overlap with the work you're about to do.
5. **`conner/MULTI-CHAT-STATUS.md`** — untracked scratch file (not in git).
   If it exists in the working tree, read it. It tracks which chat owns
   which branch right now and documents all known cross-contamination
   incidents.

---

## 1. The golden rule: one chat = one worktree = one branch

Every parallel Claude chat must work in its **own sibling worktree folder**
under `~/Downloads/culinary-ops-<topic>/`, on its own feature branch. Never
run two chats in the same working tree. See `conner/README.md` §Worktrees
for the full setup, including the `git worktree add` command. If this chat
doesn't know which worktree it's in, ask the user before doing any work.

**The multi-chat contamination incidents of 2026-04-08/09 all happened
because chats shared a single `.git/HEAD`. Worktrees make that impossible.
Do not skip this step.**

---

## 2. Before you push: run the 5-check audit

Never run `git push` without first running the 5-check audit documented in
`conner/README.md` under "Before you push: the 5-check audit." The short
version:

```bash
git branch --show-current
git log conner/universal-brand-folder..HEAD --oneline
git log conner/universal-brand-folder..HEAD --format="%h %an <%ae> | %s"
git status
```

Confirm: current branch matches this chat's scope, every commit is one
you intended to create, every file touched is in scope, every commit is
authored by Conner, no `.env` files or secrets are in the staged/untracked
list. If ANY check fails, **STOP and report** — don't try to fix it
autonomously.

---

## 3. Never do these without the user's explicit in-the-moment approval

- `git reset --hard` — wipes working tree changes
- `git push --force` / `git push --force-with-lease` — can overwrite others' commits
- `git cherry-pick` — creates duplicate commits, muddies merge history
- `git rebase` (any flavor) — rewrites history
- `git stash` — work vanishes to a place users forget about
- `git clean` — deletes untracked files permanently
- `rm -rf` on any git-managed directory
- Any command touching another chat's branch

If you encounter a messy git state (wrong branch, foreign commits, confusing
file tree), the right move is **STOP and report**, not to "fix" it yourself.

---

## 4. Files that must NEVER be committed

- `backend/.env` or any `.env*` variant — database credentials, Helcim keys, JWT secrets
- `backend/.env.backup-before-neon-branch` — working-secrets backup from earlier work
- `conner/MULTI-CHAT-STATUS.md` — explicitly flagged as an untracked scratch coordination doc
- `node_modules/`, `.next/`, `dist/`, `build/` — generated artifacts

---

## 5. When you discover an edge case, a TODO, or a deferred decision

**Append it to `conner/deferred-decisions.md`** as part of finishing the
current task. Don't let it vanish into chat history. The file has five
sections — pick the right one:

- **🔮 Edge cases to handle later** — weird scenarios the current work
  doesn't handle (e.g. "what if a customer has a removed meal in their
  draft cart?")
- **🎯 Design decisions pending** — product or UX calls that need a
  decision before that feature ships
- **🛠️ Implementation TODOs** — concrete code tasks scoped for later
- **💡 Future ideas** — things not on the roadmap but worth remembering
- **✅ Resolved** — move items here with a ✅ prefix when they're done

**Format for new entries:**

```markdown
- [YYYY-MM-DD] **Short title in bold**
  One or two lines of context. What triggered the deferral. What
  needs to happen to resolve it. Cross-references to relevant files
  or commits if helpful.
```

Add new entries at the **top** of the relevant section, not the bottom, so
the most recent context is first.

---

## 6. Commerce database quick facts

- **Two Neon projects:** `culinary-ops` (`rapid-lake-47793035`, Gurleen's,
  shared w/ Conner) and `betterday-commerce` (`spring-fire-44871408`,
  Conner's `BetterDay Food Co` org).
- **Commerce schema** lives at `backend/prisma/commerce/schema.prisma`,
  isolated from Gurleen's `backend/prisma/schema.prisma`. Commerce
  migrations go in `backend/prisma/commerce/migrations/`.
- **Commerce Prisma client** is generated to `@prisma/commerce-client`
  (custom output path). Wired into NestJS via `CommercePrismaService` in
  `backend/src/prisma/commerce-prisma.service.ts`.
- **Auth is 100% passwordless.** No `password_hash`, no `/forgot-password`,
  no password fields anywhere. Magic link + phone OTP + Apple/Google OAuth
  only. Locked decision — see `project_betterday_passwordless_auth.md`
  memory.
- **Payments = Helcim**, not Stripe. Canadian processor. See
  `PROJECT_SCOPE.md` §10 for the Helcim transition.
- **Money is `Decimal @db.Decimal(10, 2)`** in commerce, not Float.
  Deliberately diverges from culinary's Float convention because payment
  arithmetic needs exact values.

---

## 7. Brand is universal, not per-workspace

- `brand/` at the **repo root** (outside `conner/`) is the single source of
  truth for colors, fonts, logos, design tokens, and editable site facts.
- **Never hardcode** hex colors, phone numbers, emails, or font names
  anywhere outside `brand/`. If you need a color in a new place, import it
  from `brand/colors.json` or use the CSS custom property from
  `brand/tokens.css`.
- Brand changes are a ground-up build for the new customer-facing project.
  They are NOT a migration into Gurleen's `frontend/`. See
  `feedback_brand_independence.md` memory for the framing.

---

## 8. Folder ownership

| Folder | Owner | Rule |
|---|---|---|
| `backend/` | Shared (Conner + Gurleen) | Both contribute via PR. Commerce-* modules are Conner's; culinary modules are Gurleen's. |
| `frontend/` | Gurleen | Conner does NOT modify `frontend/` files. The customer-facing site is built in `conner/client-website/` instead. |
| `brand/` | Conner (universal) | Ground-up build for the new project. |
| `conner/` | Conner | Workspace for client-facing work. Gurleen reviews PRs but doesn't own files here. |
| `PROJECT_SCOPE.md` | Shared | Cross-cutting architectural doc. Edit carefully. |
| `CLAUDE.md` (this file) | Conner (operating manual) | Small, stable. Don't bloat. |

---

## 9. Workflow shortcuts (things users say, what chats do)

| User says | Chat does |
|---|---|
| "Follow the workflow" / "pre-work audit" | Read `conner/README.md`, run the pre-work read-only checks, report the state |
| "Commit and push this branch" | Stage only this chat's files, run the 5-check audit, commit with a descriptive message, push |
| "Merge this branch back into universal-brand-folder" | Switch to main worktree → pull → merge feature branch → push → optionally remove feature branch |
| "We're done with this worktree" | Commit any pending work, push, then run `git worktree remove` from the main folder |
| "I'm confused about git state" | Run `git status`, `git branch --show-current`, `git worktree list`, `git log -10`, explain in plain English, don't take action |

---

## 10. If in doubt, stop and ask

This project runs multiple parallel Claude chats with a solo non-technical
founder. The cost of a wrong `git reset` or accidentally committing secrets
is higher than the cost of an extra round-trip asking for confirmation.
Err on the side of asking.

**When in doubt:** show the user the exact commands you're about to run
and the exact files you're about to change, and wait for "go" before
executing anything destructive or irreversible.
