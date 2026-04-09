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

```
Work in ~/Downloads/culinary-ops-<TOPIC>. If the worktree folder doesn't
exist yet, create it from conner/universal-brand-folder with git worktree
add. Then read conner/README.md and follow the worktrees workflow.
We're doing: [ONE SENTENCE — what this chat is for]
```

Replace `<TOPIC>` with a short name that matches the work — e.g.
`commerce-customers`, `coupons`, `menu-page`, `auth`, `meal-edit`. Use
lowercase and hyphens, no spaces.

That's it. The chat will either `cd` into an existing worktree for that
topic or create a new one from scratch, then read this file to learn the
rules. Every chat gets its own folder on your laptop, its own branch,
its own lane. **No two chats can fight over the same files by design.**

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
