# Conner's Workspace

This folder is Conner's area for development work on the `culinary-ops` project.
You run multiple Claude chats in parallel. **Read the section below before you
start a new chat** — it explains how to keep several Claude sessions from
stepping on each other's toes, in plain English, without you needing to
understand git deeply.

> **⚡ Updated 2026-04-09:** Workflow now uses **git worktrees** — separate
> folders on your laptop, one per chat — instead of the old "everyone in the
> same folder" approach. The old way caused branch contamination (two chats
> silently overwriting each other's work). Worktrees make that impossible by
> giving each chat its own folder and its own current branch. Jump to
> [🚦 Starting a new chat](#starting-a-new-claude-chat--paste-this-as-the-first-message)
> to get going, or read [Why worktrees](#why-worktrees-the-problem-they-solve)
> if you want the story.

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

If you forget to paste that prompt, tell the chat: *"switch me to a
worktree for this chat before we continue"* and it'll catch up.

---

## ⏰ The 4 habits (memorize these — this is the whole workflow)

Each habit is **one short phrase you say out loud to the Claude chat**.
You don't need to know any git commands — the chat does the work for you.

| When | What to say to the chat | What actually happens |
|---|---|---|
| **Starting a new chat** | "Work in `~/Downloads/culinary-ops-[topic]`. Create the worktree if it doesn't exist. We're doing [topic]." | Chat creates (or switches to) its own worktree folder, branched off `conner/universal-brand-folder` |
| **Changing topics mid-chat** | "Commit what we just did, then we're moving on" | Your work so far is saved as a checkpoint in git history on this worktree's branch |
| **Before closing a chat** | "Commit everything and push this branch" | Nothing is lost when you close the tab — work lives on GitHub |
| **Done with a worktree permanently** | "We're done with this worktree, merge it back and clean up" | Feature branch merges into `conner/universal-brand-folder`, pushes, worktree folder removed |

**The golden rule:** one Claude chat = one worktree folder = one git branch.
Never run two chats in the same folder.

> 💡 **Why four habits?** "Before closing a chat" is the most important one.
> If you only remember ONE habit, make it that one. Losing a chat window
> without committing means losing whatever happened in that chat. The other
> three smooth out the edges.

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
## 🗂️ Folder structure on your laptop

With worktrees, your Downloads folder ends up looking like this:

```
~/Downloads/
├── culinary-ops/                       ← the main folder (the "primary" worktree)
│                                         Your original clone of the repo.
│                                         Usually sits on conner/universal-brand-folder.
│
├── culinary-ops-commerce-customers/    ← worktree for the commerce-customers chat
├── culinary-ops-coupons/               ← worktree for the coupons chat
├── culinary-ops-meal-edit/             ← worktree for the meal-edit chat
├── culinary-ops-auth/                  ← worktree for the passwordless-auth chat
└── culinary-ops-<topic>/               ← one folder per active chat topic
```

Each sibling folder is a **separate checkout** of the same repo, with:
- Its own checked-out files on disk
- Its own "current branch" (independent from the others)
- Its own uncommitted changes
- Its own `node_modules` folder

They all share **the same underlying git history**: a commit made in one
worktree is instantly visible via `git log` from any other worktree. No
push/pull between worktrees needed — they're just different windows into
the same storage.

## 🗂️ Inside each worktree (the project structure is identical)

```
culinary-ops/ (or any sibling worktree)
├── backend/              ← NestJS + Prisma (shared with Gurleen)
├── frontend/             ← Next.js (Gurleen's territory — don't modify)
├── brand/                ← universal design tokens, fonts, logos, site facts
├── conner/               ← your workspace
│   ├── README.md         ← you are here
│   ├── data-model/       ← entity specs, flows, ADRs
│   ├── client-website/   ← the clean, final customer-facing site
│   ├── app/              ← OLD prototypes — reference only, do not edit
│   ├── prototypes/       ← HTML mockups, UI experiments
│   └── ecommerce/        ← reserved for future e-commerce work
└── PROJECT_SCOPE.md      ← the architectural source of truth
```

---

## 📜 Original rules (still apply)

- Work on your own feature branch inside your worktree — never edit directly
  on `main` or on `conner/universal-brand-folder`.
- Never push directly to `main` — work flows through
  `conner/universal-brand-folder` first, then gets promoted to `main` via a
  separate review step with Gurleen.
- Don't modify files in `frontend/` — that's Gurleen's territory. If a chat
  needs to touch frontend code, ask first.
- Database changes go in `backend/prisma/` on a feature branch. The chat
  runs `npx prisma migrate dev` (or the commerce-specific variant) to
  generate migration files automatically.

---

## 🧵 Why worktrees (the problem they solve)

### The old problem — "shared folder, shared HEAD"

Before worktrees, every chat worked in the same folder (`~/Downloads/culinary-ops/`).
Imagine four friends writing different chapters in the same notebook — whoever
flipped the page most recently decided where everyone else would land. When
chat A ran `git checkout branch-A`, chat B's view of "the current branch"
silently flipped to `branch-A` too, because there's only one `.git/HEAD` file
in the folder. If chat B then ran `git commit`, the commit landed on `branch-A`
instead of its own branch — and sometimes got noticed hours later during a
cleanup.

Multiple real contamination incidents happened this way.

### The fix — "separate folders, separate HEADs"

Git has a built-in feature called **worktree** that gives each chat its own
folder and its own current branch. Under the hood, all worktrees share the
same git storage (one `.git/objects/` directory with the actual file
content) so there's no duplicate history. But each worktree has its own:

- `HEAD` file (pointing at its own current branch)
- Staging area (uncommitted changes)
- Working tree (the files on disk)
- `node_modules/` (installed dependencies)

This means chat A running `git checkout` in its worktree does NOT affect
chat B's worktree. The "silently overwrites each other" problem vanishes
— it's prevented by git itself, not by discipline.

### The practical upshot

You can run four Claude chats in parallel, each in its own folder, each
on its own branch, and they cannot step on each other even if they try.
Contamination is impossible by construction.

---

## 🛠️ How a new worktree gets created (automatic — the chat does it)

When you tell a new chat to work in a worktree that doesn't exist yet,
the chat runs this on its own (you don't type any of it):

```bash
cd ~/Downloads/culinary-ops
git fetch origin
git worktree add ../culinary-ops-<TOPIC> \
  -b conner/$(date +%Y-%m-%d)-<TOPIC> \
  origin/conner/universal-brand-folder
cd ../culinary-ops-<TOPIC>
```

In plain English: *"go to the main folder, grab the latest history from
GitHub, create a new sibling folder with a new feature branch based on the
integration branch, then move into the new folder."*

If the new worktree needs to run the backend (Node), the chat also runs
`npm install` inside `backend/` (and `frontend/` if touching the Next.js
side). This only has to happen **once per worktree**, not on every chat.

If the new worktree needs a `backend/.env` file (for database connection
strings), the chat will copy it from the main folder:

```bash
cp ~/Downloads/culinary-ops/backend/.env ./backend/.env
```

Or just tell the chat: *"copy the env file from the main folder."*

---

## 🧹 Cleaning up a worktree when work is done

When a feature branch is merge-ready, tell any chat:

> *"We're done with the `culinary-ops-<topic>` worktree. Merge it back and
> clean up."*

The chat will:
1. Commit any remaining work
2. Push the feature branch to origin
3. Switch to `conner/universal-brand-folder` in the **main folder**
   (not inside the worktree — you can't remove a worktree from inside itself)
4. Merge the feature branch
5. Push `conner/universal-brand-folder`
6. Remove the worktree: `git worktree remove ../culinary-ops-<topic>`
7. Optionally delete the branch ref: `git branch -d conner/<YYYY-MM-DD>-<topic>`

The work stays in merge history forever. The folder goes away.

---

## ⚠️ Gotchas to know about worktrees

1. **A branch can only be in ONE worktree at a time.** Git refuses to check
   out the same branch in two worktrees. This is a FEATURE — it's the
   protection that prevents "two chats on the same branch" contamination.

2. **`node_modules` is per-worktree.** Each new worktree needs its own
   `npm install` once in each directory with `package.json` (usually
   `backend/` and `frontend/`). Disk cost: ~500MB per worktree. Acceptable
   on a modern laptop.

3. **The Prisma client is per-worktree.** Running `prisma generate` (or
   `prisma migrate dev`, which generates automatically) writes into each
   worktree's own `node_modules`. This means migrations run in one worktree
   are visible from any worktree (shared git + database), but the generated
   TypeScript client files are local.

4. **Untracked files don't follow you.** Files NOT tracked by git (like
   `backend/.env` with your real connection strings, or any `.backup`
   files) are NOT shared between worktrees. When you create a new
   worktree, you'll need to copy `.env` over manually, or tell the chat:
   *"copy the env file from the main folder."*

5. **Git storage is shared.** Commits, branches, tags, refs, objects —
   all of it is shared across every worktree of the same repo. A commit
   made in worktree A is instantly visible via `git log` from worktree B,
   without any push or pull. This is the reason worktrees are better
   than full clones.

6. **Removing a worktree doesn't delete the branch.** `git worktree remove`
   only deletes the folder on disk. The branch and all its commits stay
   safe in git history. If you also want to delete the branch ref after
   removal, the chat will run `git branch -d conner/<YYYY-MM-DD>-<topic>`.

7. **The main folder (`culinary-ops/`) is ALSO a worktree.** It's the
   "primary" one, created when you first cloned the repo. Treat it as a
   home base — leave it on `conner/universal-brand-folder` and do all
   active feature work in sibling worktrees.

---

## 🗺️ Common situations and what to say

### "I'm not sure if my work is saved"

Say: *"Run git status and git worktree list, and tell me in plain English
what's saved and what's not."*

### "I want to try something risky and be able to undo it"

Say: *"Commit what we have now as a checkpoint before I try X."* If X goes
wrong, you can always roll back to the checkpoint.

### "I accidentally closed a chat window without committing"

Open a new chat and tell it which worktree the dead chat was using:
*"Work in `~/Downloads/culinary-ops-<topic>`. Something was uncommitted
when the last chat closed — help me recover it."* The new chat cds into
the same worktree, sees the uncommitted files, and can commit them.

### "I'm getting a weird 'branch already checked out' error"

That means the branch you're trying to check out is already in a different
worktree (probably another chat's). Say: *"Which worktree is that branch
in? I'll either use that worktree or pick a different branch."*

### "I want to throw away everything I did in this chat"

Say: *"Throw away this branch and start fresh from `conner/universal-brand-folder`."*
The chat deletes the feature branch and creates a new one in the same
worktree. **Only do this if you're sure you don't want the work** — it's
not reversible once the branch is gone.

### "I'm about to travel / close my laptop for a while"

Say (to any chat): *"Push everything I haven't pushed yet to GitHub, I'm
going offline."* Any work on any worktree's feature branch is then safe
on origin even if something happens to your laptop.

### "How many worktrees should I have active at once?"

Usually 2-4. One per topic you're actively working on. Remove each
worktree when its feature is merged, so your laptop stays tidy.

### "How do I see all my worktrees?"

Tell any chat: *"Run git worktree list and show me what's active."*
It'll print every worktree's folder and current branch.

---

## 📖 Mini glossary (plain English)

| Git word | What it actually means |
|---|---|
| **Branch** | A parallel version of the project where you can make changes without affecting other versions. Like having multiple drafts of a document open at once. |
| **Worktree** | A separate folder on your laptop that's checked out to one specific branch. All your worktrees share the same project history but each has its own "current branch" and its own uncommitted files. This is how you run parallel Claude chats safely. |
| **Commit** | Save a named snapshot of your work into git history on your current branch. Only saves locally — doesn't upload anywhere. |
| **Push** | Upload your committed snapshots to GitHub so they're safe off your laptop and other people can see them. |
| **Pull** | Download other people's committed work from GitHub onto your laptop. |
| **Merge** | Combine two branches so the work from branch A ends up inside branch B. |
| **Main** | Gurleen's production branch. You don't touch this directly — work flows through your feature branches and `conner/universal-brand-folder` first, then gets promoted. |
| **Working tree** | The files currently sitting on your laptop right now, whether committed or not. Each worktree has its own working tree. |
| **Uncommitted** | Changes you've made that haven't been saved into git history yet. Fragile — can be lost if you switch branches or close the chat without committing first. |

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

## 🧠 The deferred-decisions tracker — `conner/deferred-decisions.md`

A **tracked, living file** listing edge cases, pending design calls,
implementation TODOs, and future ideas that came up in prior chats but
were consciously deferred. Unlike `MULTI-CHAT-STATUS.md`, this one IS
committed to git — it survives across chats and sessions.

**Every chat should scan it on startup** to see what's outstanding that
might overlap with the work it's about to do. Sections are:

- **🔮 Edge cases to handle later** — weird scenarios the current work
  doesn't handle (e.g. "what if a customer has a removed meal in their
  draft cart?")
- **🎯 Design decisions pending** — product or UX calls that need a
  decision before that feature ships
- **🛠️ Implementation TODOs** — concrete code tasks scoped for later
- **💡 Future ideas** — things not on the roadmap but worth remembering
- **✅ Resolved** — move items here with a ✅ prefix when they're done

**When you discover a new edge case or defer a decision**, append a new
entry to the **top** of the relevant section in the same chat you
discovered it. Don't let it vanish into chat history. Use this format:

```markdown
- [YYYY-MM-DD] **Short title in bold**
  One or two lines of context. What triggered the deferral. What
  needs to happen to resolve it. Cross-references if helpful.
```

This is the permanent log. The file lives on the integration branch and
every chat inherits it when it branches off. Keeping it current is how
future-you (or another chat, or Gurleen) avoids re-litigating decisions
you already thought through.

---

## 📖 The auto-read operating manual — `/CLAUDE.md`

At the repo root there's a file called `CLAUDE.md` that Claude Code
**automatically loads into every session** in this repo, before the user's
first message. It's the durable, short list of rules and pointers that
every chat needs to know at startup — the golden rule, the never-do list,
the files-never-to-commit list, and pointers to this README, to
`PROJECT_SCOPE.md`, and to `conner/deferred-decisions.md`.

**You don't need to tell a chat to read `CLAUDE.md`** — it's already in
the chat's context by the time you type your first message. Just start
giving instructions and the chat already knows the rules.

**When to edit `CLAUDE.md`:** only for durable, repo-wide rules that every
future chat needs. Situational or evolving content belongs in this README
or in domain-specific docs. Keep `CLAUDE.md` short — the goal is "if a chat
reads only this file, it knows enough to not break anything and to find
the rest."

---

## 🆘 If you're confused or something broke

Paste this into any Claude chat:

```
I'm confused about the git state. Run git status, git branch, git worktree
list, and git log -10, then tell me in plain English where I am and what
I should do next. Don't do anything destructive without asking first.
```

The chat will survey your current state — including which worktree you're
in and which branches are checked out where — and explain it in plain
English. If anything would erase work, it'll ask permission before running.

---

## 💡 Quick-reference cheat sheet (print this, tape it to your monitor)

```
┌────────────────────────────────────────────────────────────┐
│  NEW CHAT?                                                 │
│    → "Work in ~/Downloads/culinary-ops-[topic].            │
│       Create worktree if missing. Doing [topic]."          │
│                                                            │
│  CHANGING TOPICS MID-CHAT?                                 │
│    → "Commit what we did, we're moving on"                 │
│                                                            │
│  CLOSING A CHAT?                                           │
│    → "Commit everything and push this branch"              │
│                                                            │
│  DONE WITH A WORKTREE?                                     │
│    → "Merge it back and clean up the worktree"             │
│                                                            │
│  CONFUSED?                                                 │
│    → "Run git status and git worktree list, explain"       │
└────────────────────────────────────────────────────────────┘
```
