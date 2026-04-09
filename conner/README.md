# Conner's Workspace

This folder is Conner's area for development work on the `culinary-ops` project.
You run multiple Claude chats in parallel. **Read the section below before you
start a new chat** — it explains how to keep several Claude sessions from
stepping on each other's toes, in plain English, without you needing to
understand git deeply.

---

## 🚦 Starting a new Claude chat — paste THIS as the first message

**Short version** (use this if you already have worktrees set up — see §
"Worktrees" below):

```
Read conner/README.md and follow it. Run the pre-work audit from the
"Before you do any work" section and paste the output back.
We're working on: [ONE SENTENCE — what this chat is for]
```

**Longer version** (use this if you're running multiple chats on ONE shared
working tree — the risky default that caused incidents on 2026-04-08/09):

```
Before you do anything else, run these read-only checks and paste the output back:

  git branch --show-current
  git status
  git log conner/universal-brand-folder..HEAD --oneline
  git log conner/universal-brand-folder..HEAD --format="%h %an <%ae> | %s"

Then read conner/MULTI-CHAT-STATUS.md (untracked scratch doc in the working
tree) for the branch-per-chat topology and the known incident log. Confirm
what branch this chat is supposed to be on by matching scope against that doc,
and tell me if the current branch matches. If there are any foreign commits
on this branch that don't match this chat's scope, STOP and tell me before
doing anything else.

We're working on: [ONE SENTENCE — what this chat is for]

Do not commit, push, checkout, reset, or stash without my explicit approval.
```

That's it. The chat will read this file, create its own branch (or use the
one its worktree is already on), and know how to behave. Every new chat gets
its own lane, and no two chats fight over the same files.

If you forget to paste that prompt, it's fine — just tell the chat *"switch to
the multi-chat workflow in conner/README.md before we continue"* and it'll
catch up.

---

## ⏰ The 4 habits (memorize these — this is the whole workflow)

If you only remember four things from this whole file, make it these. Each
habit is **one short phrase you say out loud to the Claude chat**. You don't
need to know any git commands — the chat does the work for you.

| When | What to say to the chat | What actually happens |
|---|---|---|
| **Starting a new chat** | "Follow the workflow in conner/README.md, we're doing [topic]" | Chat makes its own branch off `conner/universal-brand-folder`, safe from other chats |
| **Changing topics mid-chat** | "Commit what we just did, then we're moving on" | Your work so far is saved as a checkpoint in git history |
| **Before closing a chat** | "Commit everything and push this branch" | Nothing is lost when you close the tab — work lives on GitHub |
| **End of the day** | "Switch to conner/universal-brand-folder and push it" (to any one chat) | Everything from every chat ends up safe on GitHub, off your laptop |

**The golden rule:** one Claude chat = one git branch. Never run two chats on
the same branch simultaneously.

> 💡 **Why these four?** "Before closing a chat" is the most important one. If
> you only remember ONE habit, make it that one. Losing a chat window without
> committing means losing whatever happened in that chat. The other three
> smooth out the edges.

---

## 🌳 Worktrees — the fix for "my work disappeared" (do this ONCE)

**The problem in plain English:** git has one `.git/HEAD` pointer per working
directory. If you run four Claude chats against the same folder at once, they
all share that one `HEAD`. When chat A runs `git checkout` to switch branches,
chat B's view of "what branch am I on" silently flips too — because they're
looking at the same pointer. If chat B then runs `git commit`, its work
lands on chat A's branch instead of chat B's. This happened four times on
2026-04-08/09 (see `conner/MULTI-CHAT-STATUS.md` for the incident log).

**The fix:** give each chat its own working directory via `git worktree`.
Same `.git` repo, multiple checked-out copies in separate folders. Each
folder has its own `HEAD`, so chats literally cannot step on each other.

### 🛠️ Paste this into any Claude chat tomorrow to set it up

```
Read conner/README.md end-to-end. Then set up git worktrees for my multi-chat
workflow using the commands in the "Worktrees" section. Before you run any of
them, check git status and make sure my working tree is clean. If there are
any uncommitted changes, STOP and tell me what they are before touching
anything.
```

### What the chat will do for you (don't run these manually unless you're comfortable with git)

```bash
# 1. Verify clean starting state (no uncommitted changes in tracked files)
cd ~/Downloads/culinary-ops
git status

# 2. Create one sibling folder per active chat branch. Each folder gets its
#    own checked-out copy of the repo pointed at the named branch.
cd ~/Downloads
git -C culinary-ops worktree add ../culinary-ops-coupons       conner/2026-04-08-coupon-migration-planning
git -C culinary-ops worktree add ../culinary-ops-meal-edit     conner/2026-04-08-meal-edit-menu-cats-refactor
git -C culinary-ops worktree add ../culinary-ops-commerce      conner/2026-04-09-commerce-customers
# The existing ~/Downloads/culinary-ops folder stays as the
# client-website-followup worktree (you don't need to move it).

# 3. List all worktrees to confirm setup
git -C culinary-ops worktree list

# 4. Symlink shared .env files so secrets live in one place
for w in culinary-ops-coupons culinary-ops-meal-edit culinary-ops-commerce; do
  ln -sf ~/Downloads/culinary-ops/backend/.env ~/Downloads/$w/backend/.env 2>/dev/null || true
  ln -sf ~/Downloads/culinary-ops/frontend/.env.local ~/Downloads/$w/frontend/.env.local 2>/dev/null || true
done

# 5. Install node_modules in each worktree (one-time ~5 min per worktree)
for w in culinary-ops-coupons culinary-ops-meal-edit culinary-ops-commerce; do
  (cd ~/Downloads/$w/backend && npm install)
  (cd ~/Downloads/$w/frontend && npm install)
done
```

### Then open one Claude chat per worktree

- **Client-website follow-up chat** → opens at `~/Downloads/culinary-ops/`
- **Coupons chat** → opens at `~/Downloads/culinary-ops-coupons/`
- **Meal-edit chat** → opens at `~/Downloads/culinary-ops-meal-edit/`
- **Commerce-customers chat** → opens at `~/Downloads/culinary-ops-commerce/`

Each chat now has its own `HEAD`. When you run `git checkout` in one, the
others don't care. Dev servers in each folder serve that branch's code
independently.

### Gotchas to know

- Each worktree needs its own `node_modules` — budget ~2 GB extra disk per
  worktree. One-time pain, worth it.
- You can check out any given branch in only ONE worktree at a time (that's
  the enforcement mechanism — prevents double-checkout).
- To remove a worktree when a chat is done: `git worktree remove ../culinary-ops-coupons`
  (this deletes the folder, NOT the branch — the branch is still in git).
- If a worktree gets into a weird state: `git worktree remove --force ../culinary-ops-X && git worktree prune`
- Neon dev branches are shared across worktrees (Neon doesn't know about your
  laptop), so if two chats hit the same Neon branch, they still collide.
  See "DB state vs git state" below.

### Why this is better than the tactical branch-switching dance

- Chats **cannot** silently flip each other's HEAD
- Each chat's Next.js dev server runs its own branch's code without accidentally
  serving another chat's files
- No more "my changes disappeared" after another chat runs a checkout
- Merge conflicts happen at PR time (where they belong), not mid-chat as
  silent file overwrites

---

## 🗂️ Folder Structure

```
conner/
  README.md              ← you are here
  data-model/            ← canonical entity shapes, ADRs, flow docs
  client-website/        ← the clean, final customer-facing website
  app/                   ← OLD prototypes — reference only, do not edit
  prototypes/            ← HTML mockups, UI experiments
  ecommerce/             ← reserved for future e-commerce work
```

---

## 📜 Original rules (still apply)

- Work on your own feature branch — never edit directly on `main` or on
  `conner/universal-brand-folder`. Each chat branches off.
- Never push directly to `main` — work flows through
  `conner/universal-brand-folder` first, then gets promoted to `main` via a
  separate review step.
- Don't modify files in `frontend/` — that's Gurleen's territory. If a chat
  needs to touch frontend code, ask first.
- Database changes go in `backend/prisma/schema.prisma` on a feature branch.
  The chat runs `npx prisma migrate dev` after schema changes to generate the
  migration file automatically.

---

## 🧵 Multi-chat workflow — the full version

### The problem

You run several Claude chats at the same time — one for the homepage, one for
the menu page, one for schema work, maybe one for the tag admin. All of them
share the same folder on your laptop. If none of them branch, they all write
to the same place and you can't tell whose work is whose. If two chats edit
the same file, the second one silently overwrites the first and the work is
lost.

### The solution — "one chat, one branch"

Before any chat does any work, it branches off the shared integration branch
(`conner/universal-brand-folder`). The chat makes commits on its own branch.
When the chat's work is done, its branch merges back into
`conner/universal-brand-folder`. Two chats can edit the same file at different
times, and git will catch the collision as a merge conflict instead of losing
work silently.

### What the chat does at startup (you don't type any of this)

When you paste the startup prompt into a new chat, the chat runs these four
commands automatically:

```bash
cd ~/Downloads/culinary-ops
git checkout conner/universal-brand-folder
git pull origin conner/universal-brand-folder
git checkout -b conner/$(date +%Y-%m-%d)-topic
```

In plain English: *"go to the project folder, switch to the integration
branch, get the latest version from GitHub, then create a new branch named
with today's date and what we're working on."*

### What the chat does at the end (also automatic)

When you tell the chat *"commit everything and push this branch"*, it runs:

```bash
git add <files>
git commit -m "<descriptive message>"
git push origin conner/<YYYY-MM-DD>-topic
```

Translation: *"save a snapshot, give it a name, upload it to GitHub."* The
branch is then visible to other chats, to Gurleen, and to you from any machine.

### When work is truly done

Tell any one chat: *"merge conner/<branch-name> into
conner/universal-brand-folder and delete the feature branch."* The chat handles
the merge + cleanup. Only merged branches land on the integration branch, so
`conner/universal-brand-folder` stays as a clean sequence of "this chat built
X, this chat built Y" merge points.

---

## 🗺️ Common situations and what to say

### "I'm not sure if my work is saved"

Say: *"Run git status and tell me in plain English what's saved and what's
not."*

### "I want to try something risky and be able to undo it"

Say: *"Commit what we have now as a checkpoint before I try X."* If X goes
wrong, you can always roll back to the checkpoint.

### "I accidentally closed a chat window without committing"

Open a new chat and say: *"Check git status in culinary-ops, something was
uncommitted when the last chat closed — help me recover it."* As long as you
didn't reset files or run destructive commands, the work is still on disk and
the new chat can commit it for you.

### "Two chats touched the same file and I'm getting conflicts"

Say: *"There's a merge conflict on file X, walk me through fixing it."* The
chat will show you both versions and let you pick the right one.

### "I want to throw away everything I did in this chat"

Say: *"Throw away this branch and start fresh."* The chat deletes the branch
and checks out `conner/universal-brand-folder` clean. **Only do this if you're
sure you don't want the work** — it's not reversible once the branch is gone.

### "I'm about to travel / close my laptop for a while"

Say (to any chat): *"Push everything I haven't pushed yet to GitHub, I'm going
offline."* Work on the remote is safe even if something happens to your laptop.

---

## 📖 Mini glossary (plain English)

| Git word | What it actually means |
|---|---|
| **Branch** | A parallel version of the project where you can make changes without affecting any other version. Like having multiple drafts of a document open at once. |
| **Commit** | Save a named snapshot of your work into git history on your current branch. Only saves locally — doesn't upload anywhere. |
| **Push** | Upload your committed snapshots to GitHub so they're safe off your laptop and other people can see them. |
| **Pull** | Download other people's committed work from GitHub onto your laptop. |
| **Merge** | Combine two branches so the work from branch A ends up inside branch B. |
| **Main** | Gurleen's production branch. You don't touch this directly — work flows through your feature branches and `conner/universal-brand-folder` first, then gets promoted. |
| **Working tree** | The files currently sitting on your laptop right now, whether committed or not. |
| **Uncommitted** | Changes you've made that haven't been saved into git history yet. Fragile — can be lost. |

---

## 🚦 Before you push: the 5-check audit

Before ANY chat runs `git push`, it should run these five checks and confirm
every one passes. This is non-negotiable — it's the thing that catches
cross-contamination before it lands on the remote.

```bash
git branch --show-current
git log conner/universal-brand-folder..HEAD --oneline
git log conner/universal-brand-folder..HEAD --stat --format="COMMIT %h — %s%n"
git log conner/universal-brand-folder..HEAD --format="%h %an <%ae> | %s"
git status
```

For each output, confirm:

1. **Current branch** matches what this chat was working on
2. **Every commit** in the log is one you intended to create in this chat
3. **Every file touched** in every commit is in this chat's scope
   (no files from other chats)
4. **Every commit** is authored by you (`Conner Kadziolka`)
5. **No `.env` files**, **no secrets**, **no files from other chats**, **no
   surprise files** in the staged or untracked lists

If any check fails, **STOP**. Don't push. Tell the user what you found and
ask how to proceed. Don't try to "fix" a contaminated state autonomously —
you'll make it worse.

**Paste this into any chat to trigger the audit:**

```
Before you push: run the pre-push 5-check audit from conner/README.md and
show me the output. Don't push until I've reviewed all 5 checks.
```

---

## 🚨 Things a chat should NEVER do without explicit permission

Destructive git operations. If the user doesn't explicitly, in-the-moment,
authorize these, the chat must NOT run them:

- `git reset --hard` — wipes working tree changes, can lose work
- `git push --force` / `git push --force-with-lease` — can overwrite others' commits
- `git cherry-pick` — creates duplicate commits, muddies merge history
- `git rebase` (any flavor) — rewrites history, can lose or misattribute commits
- `git stash` — moves work to a place users often forget about
- `git clean` — deletes untracked files permanently
- `rm -rf` on any git-managed directory

**Files that must NEVER be committed:**

- `backend/.env` or any `.env*` variant — contains database credentials and
  secrets, will leak if pushed
- `backend/.env.backup-before-neon-branch` — specifically excluded; this is
  a working-secrets backup left behind by earlier work
- `conner/MULTI-CHAT-STATUS.md` — explicitly flagged as a scratch
  coordination doc by its own author. Chats update it in place but never
  `git add` it.
- `node_modules/`, `.next/`, `dist/`, `build/` — generated artifacts, huge,
  gitignored anyway

If a chat encounters a messy state (wrong branch, foreign commits, confusing
file tree), the **right move is to STOP and report**, not to "fix" it.

---

## 🗄️ Neon DB state is separate from git (important nuance)

Migrations you apply to a Neon branch (like `conner-local-dev`) live only as
state on that Neon branch. They are NOT in git. This means:

- Two chats can each think they've "applied" the same migration and silently
  both run it, sometimes producing duplicate or conflicting state
- When you push a commit containing SQL files, the SQL is the *instructions*,
  not proof that it was run
- Switching git branches does NOT change which Neon branch you're connected
  to — those are separate concepts

**Rule of thumb:** document every Neon migration you apply in the commit
message AND in `conner/MULTI-CHAT-STATUS.md` under the chat that owns it. If
a chat finds Neon state that's ahead of what it expected, it should STOP and
ask before running more migrations.

**Current known Neon state** (as of 2026-04-09, keep this updated):

- **`conner-local-dev`** (`br-little-hall-aeffmfdm`) has:
  - SystemTag: emojis populated on 28 rows, renames (Freezer Friendly→Freezable,
    Gluten Friendly→Gluten Free, Vegan diet→Plant-Based), 5 new rows inserted
    (Crustaceans, Sandwich & Wraps, Vegetarian, Pescatarian, Dairy Free)
  - MealRecipe: `menu_category` + `diet_plan` columns added and backfilled
    (Meat→Entree/Omnivore, Vegan→Entree/Plant-Based, Breakfast, Snacks),
    `dietary_tags` normalized + deduplicated
  - Ingredient: `allergen_tags` backfilled from the SPRWT PDF extraction
    (0/302 → 56/302, distribution: Gluten 23, Wheat 20, Dairy 16, Tree Nuts 7,
    Eggs 6, Sesame 5, Fish 2, Peanuts 2, Shellfish 1)
  - The SQL scripts for all of the above live in
    `conner/data-model/exports/sprwt-*.sql` committed on
    `conner/2026-04-08-client-website-followup` at `a7e7d74`
- **`production`** — untouched. When ready to promote, re-run the committed
  SQL files against production Neon branch after review.

---

## 📋 The live incident log — `conner/MULTI-CHAT-STATUS.md`

Alongside this README there's an untracked scratch file,
`conner/MULTI-CHAT-STATUS.md`, that tracks:

- Which chat owns which branch right now
- Which commits are on each branch (and whether any are misattributed)
- Every known cross-contamination incident with recovery notes
- What's currently untracked in the working tree and who it belongs to

**Chats should read this file at startup** as part of the pre-work audit.
If a chat finds foreign commits on its branch, it should cross-reference
them against the status doc before doing anything else.

The file is intentionally untracked — it's a running coordination document,
not a permanent artifact. Chats update it in place when they resolve an
incident or discover a new one. When the multi-chat workflow stabilizes
(probably after the worktree migration), the file can be deleted.

---

## 🆘 If you're confused or something broke

Paste this into any Claude chat:

```
I'm confused about the git state in culinary-ops. Run git status, git branch,
and git log -10, then tell me in plain English where I am and what I should
do next. Don't do anything destructive without asking first.
```

The chat will survey your current state and explain it in plain English. If
anything would erase work, it'll ask permission before running.

---

## 💡 Quick-reference cheat sheet (print this, tape it to your monitor)

```
┌────────────────────────────────────────────────────────────┐
│  NEW CHAT?                                                 │
│    → "Follow workflow in conner/README.md, we're doing X"  │
│                                                            │
│  CHANGING TOPICS MID-CHAT?                                 │
│    → "Commit what we did, we're moving on"                 │
│                                                            │
│  CLOSING A CHAT?                                           │
│    → "Commit everything and push this branch"              │
│                                                            │
│  END OF DAY?                                               │
│    → "Push conner/universal-brand-folder to GitHub"        │
│      (say this to any one chat)                            │
│                                                            │
│  CONFUSED?                                                 │
│    → "Run git status and explain in plain English"         │
└────────────────────────────────────────────────────────────┘
```
