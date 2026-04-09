# Conner's Workspace

This folder is Conner's area for development work on the `culinary-ops` project.
You run multiple Claude chats in parallel. **Read the section below before you
start a new chat** — it explains how to keep several Claude sessions from
stepping on each other's toes, in plain English, without you needing to
understand git deeply.

---

## 🚦 Starting a new Claude chat — paste THIS as the first message

```
Read conner/README.md and follow the "Multi-chat workflow" section.
We're working on: [ONE SENTENCE — what this chat is for]
```

That's it. The chat will read this file, create its own branch, and know how to
behave. Every new chat gets its own lane, and no two chats fight over the same
files.

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
