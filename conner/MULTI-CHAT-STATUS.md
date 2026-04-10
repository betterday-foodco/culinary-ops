# 🚨 Multi-chat status snapshot — 2026-04-09

**Read this file before you do anything destructive.** It's a fresh snapshot of
where every parallel Claude chat's work currently lives, because at least one
incident of cross-branch contamination has already happened today.

Read it quickly, confirm your chat is on the branch it's supposed to be on,
and follow the "before committing" checklist at the bottom.

> 📝 This file is **untracked** on purpose so every chat sees it regardless of
> which branch is currently checked out. Don't `git add` it — it's a scratch
> note, not a permanent artifact. When the contamination is sorted out, delete
> or archive it.

---

## ⚠️ PR reviewer note: meal-edit vs coupons branch divergence — verified 2026-04-09

**Earlier drafts of this section called this a "real merge conflict ahead"
and warned reviewers that coupon-specific additions might be lost if
resolved naively. That framing was based on a single hybrid file and
turned out to be too alarmist.** The full diff-per-file check below
showed the divergence is purely directional: coupons branch has older
snapshots of 4 files, meal-edit has newer versions, and **zero files
have coupons-specific additions that don't exist on meal-edit.**

Git will still flag these files as conflicts when the second branch
merges into `conner/universal-brand-folder` (because both branches
have unique commits touching them), but the **resolution is
deterministic: take the meal-edit version for all 4 divergent files.**

### Verified verdict per file — 2026-04-09

All 7 files were compared with
`git diff conner/2026-04-08-meal-edit-menu-cats-refactor conner/2026-04-08-coupon-migration-planning -- <file>`
and the hunks on each side inspected by hand.

| File | Status | Lines added / removed (meal-edit → coupons) | Notes |
|---|---|---|---|
| `frontend/app/(dashboard)/meals/[id]/page.tsx` | **Divergent (take meal-edit)** | +5 / -63 | Coupons side has the old hardcoded `CATEGORIES` const; missing `SystemTag` interface, `allTags` state, `api.getTags()` in the load `Promise.all`, `menuCats` useMemo, and the menu-cats-driven dropdown with the "Manage" link and legacy-value orphan warning. Zero coupons-specific additions — every diff hunk is "coupons has the older snapshot of this block." |
| `frontend/app/(dashboard)/meals/new/page.tsx` | **Divergent (take meal-edit)** | +105 / -204 | Coupons side is the full legacy 156-line kitchen-operational skeleton (`name`, `finalYield`, `components` editor). Meal-edit side is the Tier 1 rewrite (Display Name + Diet Plan toggle + menu-cats Category dropdown + Sell Price). Legacy version was already broken by the `diet_plan_id` NOT NULL change — taking meal-edit unconditionally is not just safe, it's required to unbreak the form. Zero coupons-specific additions in the coupons-side version. |
| `backend/src/modules/meals/meals.service.ts` | **Divergent (take meal-edit)** | +1 / -13 | Coupons side is missing the `display_name` → `name` auto-fill block (`const internalName = (dto.name && dto.name.trim()) || dto.display_name`) plus the related comment. The coupons-side `create()` will fail at `tx.mealRecipe.create` for any caller that doesn't send `dto.name`, which the new Tier 1 create form deliberately doesn't. Zero coupons-specific additions. |
| `backend/src/modules/meals/dto/meal.dto.ts` | **Divergent (take meal-edit)** | +1 / -10 | Coupons side has `name: string` required. Meal-edit side has `name?: string` optional plus the 8-line explanatory comment about why it's optional (the SPRWT legacy sorting pattern and the auto-fill behavior). Must flip with the service change above or the form breaks. Zero coupons-specific additions. |
| `frontend/app/lib/api.ts` | ✅ **Identical** | 0 / 0 | Both branches have the same `diet_plan_id?: string \| null` addition on `CreateMealData`. No conflict possible. |
| `backend/prisma/schema.prisma` | ✅ **Identical** | 0 / 0 | `diet_plan_id` NOT NULL is already on both branches. No conflict possible. |
| `backend/src/lib/slugify.ts` | ✅ **Identical** | 0 / 0 | Slugify helper file exists with identical content on both. No conflict possible. |

### Summary for the reviewer

- **3 of 7 files are identical** across both branches — no conflict, no action needed.
- **4 of 7 files are "coupons has older snapshot, meal-edit has newer."** When git flags these as conflicts during the second PR's merge, the correct resolution is **take meal-edit's version** for each one. No careful 3-way merge required; no coupon-specific work to preserve.
- **The resolution is mechanical.** Using `git checkout --theirs <file>` or an IDE "accept current change" on all 4 divergent files should produce the correct result. The earlier "don't blindly accept either side" warning has been withdrawn based on actual diff evidence.
- **Root cause of the "hybrid" appearance from incident #5:** the coupons branch has an earlier snapshot that includes the first half of commit `c7b2dec` (diet-plan SystemTag ID constants added) but not the second half (menu-cats dropdown work that removed the hardcoded `CATEGORIES` const). It isn't a competing implementation — it's a partial snapshot. The diff-per-file check confirmed this on all four files.

### Copy-paste commands for the reviewer at merge time

```bash
# At merge-conflict time, for each of the 4 divergent files, run:
git checkout --theirs frontend/app/\(dashboard\)/meals/\[id\]/page.tsx
git checkout --theirs frontend/app/\(dashboard\)/meals/new/page.tsx
git checkout --theirs backend/src/modules/meals/meals.service.ts
git checkout --theirs backend/src/modules/meals/dto/meal.dto.ts
git add frontend/app/\(dashboard\)/meals/\[id\]/page.tsx \
        frontend/app/\(dashboard\)/meals/new/page.tsx \
        backend/src/modules/meals/meals.service.ts \
        backend/src/modules/meals/dto/meal.dto.ts
# Then continue the merge normally.
```

**NOTE:** "theirs" vs "ours" in a merge depends on which side is
being merged IN. If the coupons branch is being merged into a branch
that already has meal-edit's version, `--ours` is correct. If
meal-edit is being merged into a branch that already has the coupons
version, `--theirs` is correct. Double-check with `git status` before
running the commands — it'll tell you which is which.

### If you see any of these files in a future diff with DIFFERENT line counts than what's above

The numbers above were captured 2026-04-09. If a later chat commits
to either branch and the diff stats change, re-run the diff check
before trusting the "take meal-edit" verdict. Updated file content
could introduce real coupon-specific additions that the directional
analysis above didn't anticipate.

---

## TL;DR

Multiple chats are editing the same working tree at the same time. When chat A
runs `git checkout -b branch-A`, chat B's view of "the current branch" also
flips to `branch-A` silently, because there's only one `.git/HEAD`. If chat B
then runs `git commit`, the commit lands on `branch-A` instead of whatever
branch B intended.

**This already happened once today.** A commit meant for
`conner/2026-04-08-meal-edit-menu-cats-refactor` landed on
`conner/2026-04-09-commerce-customers` because a different chat had just
switched branches. It was recovered via cherry-pick (see below).

---

## Current branch topology (as of this snapshot)

| Branch | HEAD | Owned by which chat / scope |
|---|---|---|
| `conner/universal-brand-folder` | `dbbc035` | Integration branch. Nobody commits here directly. All feature branches PR into it. |
| `conner/2026-04-08-meal-edit-menu-cats-refactor` | `df48543` | **Meal edit + new-meal create form rewrite chat.** Diet-plan toggle, menu-cats Category dropdown, smart-match suggestions, Tier 1 new-meal form. Has 2 "own" commits (`c7b2dec`, `df48543`) plus a foreign `972c1f2` DOTW scheduler commit sandwiched between them. **Pushed to `origin/conner/2026-04-08-meal-edit-menu-cats-refactor` as of 2026-04-09.** PR decision still pending: open straight from this branch (DOTW commit rides along, but coupons chat has already cherry-picked it so git will no-op the duplicate at merge time) OR cherry-pick `c7b2dec` + `df48543` onto a fresh clean branch and PR from there. |
| `conner/2026-04-08-coupon-migration-planning` | `f2828b7` | **Coupons chat.** Has `3c791ff` (feature picker for Migration #3) and `f2828b7` (DOTW scheduler mockup, cherry-picked from the meal-edit branch to recover incident #1). SPRWT ingredient exports + `data-model/tools/` are untracked in the working tree and do not belong to the coupons chat (see note below). |
| `conner/2026-04-08-client-website-followup` | `a7e7d74` | **Client-website follow-up chat.** Has `a7e7d74` (SPRWT legacy allergen recovery + ingredient tagger HTML tool). Not yet pushed to `origin` — awaiting review. Earlier menu-overlay finalization work (`conner/client-website/menu/index.html`, `meals.seed.json`, README + entities.md edits) is already reachable from this branch via ancestor commit `48e64de`. |
| `conner/2026-04-09-commerce-customers` | `f0796bd` | **Commerce customers backend chat.** Has its own `f99e461` "first commerce backend module with 12 profile endpoints" commit AND a duplicate of the meal-edit chat's `f0796bd` new-meal-form commit (the contamination incident). |
| `conner/email-verification-docs` | `145a6fd` | **Email verification docs chat.** Older branch. |
| `feature/corp-manager-api` | `4def472` | Gurleen's territory. Don't touch. |
| `main` | `e39db50` | Production. Nobody branches from here directly — always branch off `conner/universal-brand-folder`. |

---

## Known cross-contamination incidents

### Incident #1 — DOTW scheduler on the meal-edit branch

The coupons chat committed `972c1f2 feat(coupons): add DOTW scheduler mockup —
thin wrapper over coupon system` on top of
`conner/2026-04-08-meal-edit-menu-cats-refactor` instead of its own branch.
The commit is still there. The meal-edit chat decided to leave it alone rather
than force-reset someone else's commit out of shared history.

**Recovery applied (by coupons chat, 2026-04-09):** the coupons chat ran
`git cherry-pick 972c1f2` onto `conner/2026-04-08-coupon-migration-planning`,
producing `f2828b7` with identical content. The original `972c1f2` is still
sitting on `conner/2026-04-08-meal-edit-menu-cats-refactor` per the
meal-edit chat's explicit decision to leave it alone. Both copies exist.

**Impact for the PR:** when the meal-edit branch eventually PRs into
`conner/universal-brand-folder`, the DOTW scheduler commit will come along for
the ride. If that's not desired, the PR author (or reviewer) can cherry-pick
just `c7b2dec` and `df48543` onto a fresh branch instead of opening the PR
straight from `conner/2026-04-08-meal-edit-menu-cats-refactor`. Alternatively:
when the coupons branch PRs first, git will recognize the duplicate content
at merge time and no-op it.

### Incident #3 — working tree swapped to coupons branch while meal-edit dev server was running

Between the branch push and a later check, the shared working tree's `HEAD`
got flipped from `conner/2026-04-08-meal-edit-menu-cats-refactor` to
`conner/2026-04-08-coupon-migration-planning` — probably by a parallel chat
running `git checkout`. The Next.js dev server had been auto-serving files
from disk, so when the user loaded `/meals/new` in the browser, it showed
the OLD skeleton form (coupons-branch version) instead of the Tier 1 rewrite
(meal-edit-branch version). Same for `/meals/[id]` — the diet-plan toggle,
menu-cats dropdown, and smart-match suggestions all "disappeared" because
the file on disk was the older version on the coupons branch.

**The source of truth was never lost** — my Tier 1 commit `df48543` and the
edit-page commit `c7b2dec` are both safely on
`conner/2026-04-08-meal-edit-menu-cats-refactor` locally AND on the
`origin` remote. The dev server was just serving a stale snapshot because
the working tree's branch pointer moved.

**Recovery applied (by meal-edit chat, 2026-04-09):** ran
`git checkout conner/2026-04-08-meal-edit-menu-cats-refactor`, which put
the Tier 1 files back on disk. Next.js hot-reloaded, user refreshed
browser, everything visible again. Zero code changes, zero force-pushes,
zero commits needed — just a branch switch.

**Lesson for other chats:** the Next.js dev server on `:3000` always
serves the currently-checked-out branch's files. If you're running a dev
server and a parallel chat checks out a different branch, your browser
will silently start serving the other chat's code. Before assuming "my
changes aren't there," run `git branch --show-current` and verify the
expected branch. Running the "Before you commit" checks (see below) also
catches this early.

### Incident #5 — Second working-tree swap PLUS a hybrid `meals/[id]/page.tsx` discovered on coupons branch

Same root cause as incident #3 (shared working tree, parallel chat ran
`git checkout`), but with a **new and more concerning finding** that came
out of the diagnostic.

**The swap itself:** between the last update to this file and a later
user check, the working tree's `HEAD` flipped from
`conner/2026-04-08-meal-edit-menu-cats-refactor` to
`conner/2026-04-08-coupon-migration-planning` again. User loaded
`/meals/new` in the browser, saw the old skeleton form, and asked "I
think it broke again?" The meal-edit chat ran the branch switch
recovery (`git checkout conner/2026-04-08-meal-edit-menu-cats-refactor`)
and the Tier 1 form reappeared. Dev servers on `:3000` and `:3001`
stayed healthy the whole time — verified via
`GET /meals/new → 200` and `GET /api/health → 200` after the switch.

**The new and weirder finding:** while diagnosing, the meal-edit chat ran
`head -20` on the coupons-branch version of `meals/[id]/page.tsx` and
saw a **hybrid file**:

```typescript
const CATEGORIES = ['Meat','Vegan','Vegetarian','Fish & Seafood','Breakfast',
                    'Snack','Soup','Salad','Granola','Other'];

// ─── Diet Plan SystemTag IDs (source of truth: /settings/tags) ──────
// These two rows in SystemTag (type='diets') are the classifier ...
```

The OLD `CATEGORIES` constant (which the meal-edit chat **deleted** in
commit `c7b2dec`) sitting right above the diet-plan SystemTag ID constants
(which the meal-edit chat **added** in the same commit). This means the
coupons-branch copy of `meals/[id]/page.tsx` has **partial diet-plan work
that was not written by the meal-edit chat** — someone either cherry-picked
half of `c7b2dec` without the deletion, or did an independent pass at the
diet-plan toggle that kept the legacy hardcoded list alongside the new
code.

**Real implications for the eventual PR:**

- This is NOT a "git will auto-resolve at merge time" situation. The two
  branches have genuinely divergent content in `meals/[id]/page.tsx` that
  will produce a merge conflict when either branch PRs into
  `conner/universal-brand-folder`.
- Whoever reviews the merge needs to look at both versions side-by-side
  and pick which pieces of which one to keep. The meal-edit version is
  strictly an improvement (menu-cats dropdown, ingredient-derived
  allergens, conditional variant picker, smart-match suggestions,
  collapsed internal name, deleted legacy CATEGORIES const) but the
  coupons-branch version may have coupon-related additions that the
  meal-edit branch doesn't know about.
- **Do not** just force the meal-edit version onto the integration branch
  without diffing first. There may be coupons-side edits to this file
  that would be lost.

**Also new on the coupons branch (since the last status update):** two
commits the meal-edit chat wasn't previously aware of —
`4aebae6 feat(commerce): migration 5 — coupon power-up` and
`c99a1f4 docs(conner/README): add worktrees setup + pre-push audit +
don't-do list`. The README docs commit looks like someone codified the
worktrees-per-chat recipe that the meal-edit chat floated in the incident
#3 "Lesson for other chats" block — worth reading before the next chat
starts.

**Recovery applied (by meal-edit chat, 2026-04-09):** ran
`git checkout conner/2026-04-08-meal-edit-menu-cats-refactor`. Working
tree swapped back, dev servers hot-reloaded, user refreshed browser.
**No attempt was made to reconcile the `meals/[id]/page.tsx` divergence**
— that's a merge-time decision that should be made by a human reviewing
both branches' versions side-by-side, not a surgical in-place edit by
either chat unilaterally.

**Lesson for other chats:** the worktrees fix is no longer optional.
Incident #3 was annoying; incident #5 produced a real code divergence
on a file that's going to cause a merge conflict that has to be
resolved by hand. Every chat should have its own worktree as of today —
stop sharing `HEAD`.

### Incident #4 — SPRWT ingredient work mislabeled as coupons chat

For most of 2026-04-08, the client-website follow-up chat's working tree
accumulated files from three distinct workstreams: menu-overlay page
finalization (`conner/client-website/menu/`), Neon DB cleanup on
`conner-local-dev` (SystemTag + MealRecipe + Ingredient migrations), and
legacy SPRWT PDF allergen extraction (`conner/data-model/exports/sprwt-*`
and `conner/data-model/tools/ingredient-tagger/`). Earlier snapshots of
this file attributed the untracked SPRWT files to the coupons chat — that
was wrong; they were the client-website follow-up chat's work.

**Additional wrinkle:** the menu-overlay work (`conner/client-website/
menu/index.html`, `meals.seed.json`, plus edits to `README.md` and
`entities.md`) got committed to an ancestor commit `48e64de` by an
unknown process during the chat's runtime — the commit's author date is
`2026-04-08 21:59:22 -0600` but its content includes data that only
existed after migrations that ran later in the chat. The commit is
reachable from both `conner/2026-04-08-coupon-migration-planning` AND
`conner/2026-04-08-client-website-followup` via shared ancestry, so no
cherry-pick was needed.

**Recovery applied (by client-website follow-up chat, 2026-04-09):** the
chat ran `git checkout conner/2026-04-08-client-website-followup`,
verified via blob-hash comparison that `48e64de` was an ancestor of the
target branch (so the menu-overlay work was already on the right
branch), then staged and committed the 7 loose SPRWT + tagger files as
`a7e7d74 feat(data-model): SPRWT legacy allergen recovery + ingredient
tagger tool`. 4047 insertions. Not yet pushed.

### Incident #2 — new-meal-form commit on commerce-customers

The meal-edit chat intended to commit `df48543` (new meal form rebuild) onto
`conner/2026-04-08-meal-edit-menu-cats-refactor`, but at commit time the
working tree's `HEAD` was pointing at `conner/2026-04-09-commerce-customers`
(another chat had just switched to it). The commit landed as `f0796bd` on the
wrong branch.

**Recovery applied (by meal-edit chat, 2026-04-09):** the meal-edit chat ran
`git cherry-pick f0796bd` on the correct branch, producing `df48543` with
identical content. Confirmed clean, no conflicts. The meal-edit feature
branch has since been pushed to `origin`. The original `f0796bd` is still
sitting on `conner/2026-04-09-commerce-customers` as a "phantom" duplicate —
nothing has been done to that branch because it's outside the meal-edit
chat's lane.

**Impact for the commerce-customers chat:** your branch has a commit that
isn't yours. When you open your PR, either:
- Leave it (git will recognize the duplicate at merge time and no-op it), OR
- Run `git reset --hard HEAD~1` BEFORE committing any of your own new work,
  since `f0796bd` is the current tip. Only do this if you have NO uncommitted
  changes you care about.

---

## ⚠️ Before you commit, run this check EVERY time

```bash
# 1. What branch am I actually on right now?
git branch --show-current

# 2. Does that match what my chat thinks it's working on?
#    (If not, STOP. Tell the user. Do not commit yet.)

# 3. Are any foreign commits sitting on this branch that I don't recognize?
git log --oneline -10
#    (Look for commit messages with scopes outside yours.
#    e.g. if you're the meal-edit chat and you see `feat(coupons)` — that's
#    someone else's work on your branch.)
```

**If your current branch doesn't match what you thought you were on:**
do NOT run `git reset --hard` or `git checkout -b` to "fix" it — you'll
either overwrite someone else's work or make the topology worse. Instead:

1. Tell the user what you found
2. Show them the branch topology
3. Ask whether you should cherry-pick your work onto the correct branch
   (Option A in the meal-edit chat's recovery)

**If you see foreign commits on your branch:**
don't force-remove them. They're someone else's work and deleting them
would lose it. Leave them alone and let the eventual PR author handle
the cleanup via cherry-pick-to-fresh-branch.

---

## How to avoid this going forward

The root cause is that multiple chats share one working tree. Some options,
in order of how invasive they are:

1. **Only run one chat at a time against this repo.** Simplest. Boring but
   safe.
2. **Use separate worktrees per chat.** `git worktree add ../culinary-ops-coupons conner/2026-04-08-coupon-migration-planning`
   — each chat gets its own checked-out copy of the repo in its own directory.
   Chats can't step on each other's `HEAD` because each worktree has its own.
   This is probably the right long-term answer.
3. **Run each chat on a separate laptop / VM.** Overkill for a solo founder.

For today, easiest thing: **before any chat commits, it runs the three checks
above.** If the current branch isn't what the chat expected, it stops and
reports to the user instead of committing.

---

## Status of ongoing work per chat (as of this snapshot)

| Chat | Branch | Last committed work | Uncommitted working-tree state |
|---|---|---|---|
| Meal edit + new-meal form | `conner/2026-04-08-meal-edit-menu-cats-refactor` (**pushed to origin**) | `df48543` (Tier 1 new meal form), cherry-picked clean after incident #2 | Clean — only untracked files from other chats. Dev servers running: backend task `b67pc0j5z` on `:3001`, frontend task `bl8l7zuzw` on `:3000`. PR decision pending (see topology table note). |
| Coupons / DOTW | `conner/2026-04-08-coupon-migration-planning` (recovered after incident #1) | `f2828b7` (DOTW mockup, cherry-picked) + `3c791ff` (feature picker) | Clean — the `conner/data-model/exports/sprwt-*.{csv,sql,json}` and `conner/data-model/tools/` untracked files do NOT belong to this chat and should not be committed as part of coupon work |
| Commerce customers backend | `conner/2026-04-09-commerce-customers` | `f99e461` (first commerce backend module) + `f0796bd` (phantom duplicate of meal-edit's new-meal-form work) | Unknown |
| Client-website follow-up | `conner/2026-04-08-client-website-followup` | `a7e7d74` (SPRWT legacy allergen recovery + ingredient tagger HTML tool). Not yet pushed. Menu-overlay finalization work already reachable via ancestor `48e64de`. | Clean — only `backend/.env.backup-before-neon-branch` (meal-edit chat) and `conner/MULTI-CHAT-STATUS.md` (this file) remain untracked. Working branches on Neon: `conner-local-dev` (`br-little-hall-aeffmfdm`). DB cleanup applied there only: SystemTag emojis + renames + inserts (Crustaceans, Sandwich & Wraps, Vegetarian, Pescatarian, Dairy Free), MealRecipe `menu_category`/`diet_plan` split, dietary_tags normalization, Ingredient.allergen_tags backfill (0/302 → 56/302). Production Neon untouched. |

**Untracked files visible in the working tree right now** (shared across every chat):

```
backend/.env.backup-before-neon-branch                           ← meal-edit chat (contains secrets, do not commit)
conner/MULTI-CHAT-STATUS.md                                      ← this file (meal-edit chat)
```

> ⚠️ **Correction:** the SPRWT ingredient files (`ingredients-sprwt-allergens-2026-04-08.csv`,
> `sprwt-allergen-backfill.sql`, `sprwt-dryrun.sql`, `sprwt-extract-intermediate.json`) and
> the `conner/data-model/tools/` directory were previously mislabeled as belonging to the
> coupons chat. They were actually the **client-website follow-up chat's** work and have
> been committed in `a7e7d74` on `conner/2026-04-08-client-website-followup`. See
> "Incident #4" below.

---

## Quick reference: what's "yours" if you're the …

- **Meal edit chat:** commits `c7b2dec` and `df48543`. Branch
  `conner/2026-04-08-meal-edit-menu-cats-refactor`. Scope: meal edit page
  refactor, menu-cats Category dropdown, diet-plan toggle, smart-match
  suggestions, Tier 1 new-meal create form, diet_plan_id NOT NULL migration,
  `slugify.ts` helper, Entree backfill, Snacks tag rename. Backend changes
  to `meals.service.ts`, `meals/dto/meal.dto.ts`, `frontend meals/[id]/page.tsx`,
  `frontend meals/new/page.tsx`, `api.ts` CreateMealData interface. Running
  Neon branch: `conner-local-dev` (`br-little-hall-aeffmfdm`).

- **Coupons chat:** commits `3c791ff` (feature picker) and `f2828b7` (DOTW
  scheduler mockup, cherry-picked after incident #1). Both now live on
  `conner/2026-04-08-coupon-migration-planning`. Scope: coupon system design
  + schema draft for Migration #3, DOTW scheduler mockup, customer-facing
  coupon error catalog (pending). SPRWT allergen migration planning and
  ingredient extract tools are NOT this chat's scope — those untracked files
  came from a different chat and should be cleared by whichever chat owns
  that work.

- **Commerce customers chat:** commit `f99e461`. Branch
  `conner/2026-04-09-commerce-customers`. Scope: commerce backend module,
  profile endpoints. The `f0796bd` commit on your branch is NOT yours — it's
  the meal-edit chat's new-meal-form work that contamination-landed there.

- **Client-website follow-up chat:** commit `a7e7d74` (SPRWT legacy
  allergen recovery + ingredient tagger HTML tool). Branch
  `conner/2026-04-08-client-website-followup`. Not yet pushed to origin
  — awaiting review. Scope: finalize `conner/client-website/menu/` page
  (already reachable via ancestor `48e64de`: tokenized fonts + hex
  codes, replaced inline nav with shared marketing header, rewired data
  loader to `meals.seed.json` with 152 real meals from culinary-ops
  conner-local-dev branch, filter UI updated to canonical SystemTag
  vocabulary, CSS placeholder for null images, popular-sort removed per
  user request); run the DB cleanup on the conner-local-dev Neon branch
  (SystemTag emojis + renames + 5 new tags, MealRecipe `menu_category`/
  `diet_plan` column split, `dietary_tags` normalization); extract SPRWT
  legacy allergen data from a 19-page PDF export of the old kitchen
  admin UI and backfill `Ingredient.allergen_tags` (0/302 → 56/302);
  build a self-contained HTML review tool at `conner/data-model/tools/
  ingredient-tagger/` for Gurleen/Darlene to spot-check and extend the
  allergen tagging. Running Neon branch: `conner-local-dev`
  (`br-little-hall-aeffmfdm`). Production untouched.

---

## Last updated

`2026-04-09` by the meal-edit chat after running the full diff-per-file
audit on all 7 files touched by commits `c7b2dec` and `df48543`. The
audit replaced the earlier "🛑 real merge conflict ahead" panic framing
with a verified "⚠️ take meal-edit for 4 files, 3 are identical"
verdict. See the top of this file for the file-by-file table. Previous
change was incident #5 recovery (second working-tree swap to the
coupons branch).

Previous updates: client-website follow-up chat after committing
`a7e7d74` (SPRWT recovery + tagger tool) on its correct branch and
documenting Incident #4; meal-edit chat after recovering from incident
#3; meal-edit chat after pushing to `origin` and restarting the backend
post Neon P1001 auto-suspend; coupons chat after incident #1
cherry-pick; meal-edit chat after incident #2 cherry-pick.

**If you're reading this file because you're about to commit**, run the
"Before you commit" checklist above FIRST. If you hit another incident,
append it as incident #6 and update this "Last updated" section with a
one-line summary of what you recovered.
