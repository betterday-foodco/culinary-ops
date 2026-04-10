# `conner/client-website/` — BetterDay Customer-Facing Website

**This is the destination for the clean, final, unified customer-facing
BetterDay website.** Everything in here is net-new work built from scratch
using `brand/` as the source of truth.

When a page here ships, it's meant to be the **real thing** — not a sketch,
not a prototype. Rough experiments live in `../app/`; cleaned-up final pages
live here.

---

## What belongs here

Pages a customer would see:

- Marketing site (homepage, about, pricing, FAQ, legal pages)
- Login / signup
- Menu browse + meal detail
- Cart + checkout
- Account hub (subscription, orders, addresses, payment methods)
- Subscription management (skip, pause, cancel, edit)
- Post-order confirmation + tracking

## What does NOT belong here

- **Admin / internal tooling** → lives under Gurleen's `frontend/app/(dashboard)/`
- **Kitchen ops** → lives under Gurleen's `frontend/app/(kitchen)/`
- **Corporate B2B portal** → lives under Gurleen's `frontend/app/(corporate)/`
- **Raw prototypes and experiments** → lives in `../app/` and `../prototypes/`
- **Brand assets** (colors, fonts, logos) → lives at `../../brand/` (root-level universal)
- **Data model docs** → lives at `../data-model/`

---

## Where things come from

```
culinary-ops/
├── brand/                  ← colors, fonts, logos, design tokens
│   ├── colors.json         ← imported by whatever CSS/JS this site uses
│   ├── tokens.css          ← linked directly by static HTML pages
│   └── fonts/              ← @font-face sources
│
└── conner/
    ├── app/                ← OLD prototypes — reference material ONLY
    │   ├── subscriber-hub-2.0.html      ← inspiration for client-website/account/
    │   ├── menu-overlay.html            ← inspiration for client-website/menu/
    │   ├── betterday-v2_81.html         ← inspiration for client-website/index.html
    │   ├── login.html                   ← inspiration for client-website/login.html
    │   └── diet-selector.html           ← inspiration for client-website/onboarding/
    │
    ├── data-model/         ← canonical data shapes that this site reads/writes
    │   ├── entities.md     ← THE source of truth for field names + types
    │   └── flows/          ← how data moves through each module
    │
    └── client-website/     ← you are here
```

---

## Workflow (when building a new page)

This folder follows the "HTML-first + data-model co-evolution" loop described
in `../data-model/decisions/2026-04-08-html-first-workflow.md`. Short version:

1. **Pick a page** and find its counterpart in `../app/` for inspiration.
2. **Create the new file here**, rewritten to consume `brand/tokens.css` and
   the shared site-shell pattern. Clean, cohesive, no copy-paste hex codes.
3. **While building, track every data field the page uses** — `customer.first_name`,
   `cart.total`, `meal.photo_url`, etc. Write them down as you go.
4. **Check `../data-model/entities.md`** — does every field exist? If not,
   add it.
5. **Check `backend/prisma/schema.commerce.prisma`** (once it exists) — does
   every field exist there? If not, add it + run
   `npx prisma migrate dev --name add-whatever`.
6. **Commit everything together in one logical chunk:** the new HTML page +
   the entity update + the schema migration. One page = one tight commit.
7. **Next page.**

Every loop iteration closes one "loose end" from the original prototypes and
takes us from "mocked" to "wired."

---

## Status

| Page | File | Status |
|---|---|---|
| Homepage | `index.html` | ✅ built (2026-04-08) |
| Onboarding — diet selector | `onboarding/index.html` | ✅ built (2026-04-08) |
| Login | `login.html` | 💭 planned |
| Menu browse | `menu/index.html` | ✅ built (2026-04-09) |
| Meal detail | `menu/[meal-code].html` | 💭 planned |
| Cart | `cart.html` | 💭 planned |
| Checkout | `checkout.html` | 💭 planned |
| Account hub | `account/index.html` | ✅ built (2026-04-09) — port of `../app/subscriber-hub-2.0.html`, conservative copy + shell wiring; inline hex codes still need tokenizing |
| Subscription manager | `account/subscription.html` | 💭 planned |
| Order history | `account/orders.html` | 💭 planned |
| About | `about.html` | 💭 planned |
| FAQ | `faq.html` | 💭 planned (CMS-editable later) |

**Legend:** 🚧 in progress · 💭 planned · ✅ done · ⚠️ known issue

---

## Brand and style

**Never hardcode colors, fonts, or site facts in this folder.** If you catch
yourself typing `#4EA2FD` or `hello@eatbetterday.ca` in a page, stop and
import from `brand/` or fetch from `/api/system-config/public` instead.

- Colors → `var(--brand-primary)` etc. from `brand/tokens.css`
- Fonts → `var(--font-body)` etc. from `brand/tokens.css`
- Logos → `<img src="../../../brand/logos/..."/>` (relative path — adjust
  per folder depth)
- Site facts (phone, email, social) → `{{contact.email}}` tokens, resolved
  by the site-shell loader

---

## Local development

Because the HTML files use `fetch()` to pull in shared headers/footers AND
reference `/brand/tokens.css` (a sibling folder above this one), you
**cannot** just double-click a page from Finder — `file://` URLs block
fetches. You also can't run the server from inside `client-website/` alone,
because `/brand/` lives outside it and wouldn't be reachable.

**Run the server from the repo root**, so both `/brand/` and
`/conner/client-website/` resolve under the same HTTP origin:

```
cd ~/Downloads/culinary-ops   # or wherever your clone lives
python3 -m http.server 8000
```

Then open:

    http://localhost:8000/conner/client-website/

Any changes you save in files are picked up on the next browser refresh.
No build step, no dev server to fight, no `npm install`.

**Alternatives** (all work the same — just serve the repo root over HTTP):
- **VS Code Live Server** — right-click any file in `culinary-ops/` and
  "Open with Live Server"
- **`npx serve .`** from the repo root (needs Node)
- **`php -S localhost:8000`** from the repo root (needs PHP)

In production, deploy the same file tree; every page loads `/brand/tokens.css`
and `shared/*.html` over HTTPS and the fetches work automatically.
