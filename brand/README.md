# `brand/` — BetterDay Universal Brand & Site Config

This folder is the **single source of truth** for everything shared across
every BetterDay product: the marketing site, the subscriber webapp, the
admin dashboard, email templates, and any future app.

> Change a color here → every product updates.
> Change a phone number here → every product updates.
> Add a new social link here → every product updates.

Nothing else in this repo should hardcode brand colors, fonts, or company
contact info. If you catch yourself typing `#4EA2FD` or `hello@eatbetterday.ca`
anywhere outside this folder, stop and import from here instead.

---

## The two layers

This folder holds **two kinds of universal truth**, and they work differently.

### 🏗️ Layer 1 — Build-time config (files in this folder)

Things that are compiled into the website at build time. Editing them is a
code change that goes through a PR and a redeploy. Good for: colors, fonts,
logos, typography, type scale — things that *should* go through code review
because a typo would break the brand everywhere.

| File | Purpose | Who consumes it |
|---|---|---|
| `colors.json` | Brand palette as machine-readable data | `frontend/tailwind.config.ts` imports it into Tailwind's `theme.colors.brand` |
| `typography.json` | Font families, weights, type scale | `frontend/tailwind.config.ts` imports it into Tailwind's `theme.fontFamily` / `theme.fontSize` |
| `tokens.css` | Same values as CSS custom properties (`--brand-primary`, etc.) | Any standalone HTML file can `<link>` to it directly without a build step |
| `design-tokens.md` | Human-readable reference doc | Humans reading in GitHub. Explains *why* each token exists and when to use it |
| `fonts/` | The actual .otf / .woff2 font files | Loaded by `@font-face` in `tokens.css` and by `frontend/app/globals.css` |
| `logos/` | PNG / SVG logo variants (primary, mark, wordmark, favicon) | `frontend/public/` symlinks or copies them, email templates link them |
| `photos/` | Product + lifestyle + section-illustration photos extracted from prototypes | Standalone HTML pages reference via `/brand/photos/<file>`; eventually also served through a CDN |

**To edit anything in Layer 1:** branch, edit, commit, open PR. Takes 5 minutes.

### 🎛️ Layer 2 — Runtime config (database, editable via admin dashboard)

Things that are looked up every time a page loads and can be edited from the
admin dashboard without a code change. Good for: contact info, social links,
copy, delivery areas — things that shouldn't need a developer in the loop.

| File | Purpose |
|---|---|
| `site-info.seed.json` | Initial values that get loaded into Gurleen's `SystemConfig` database table the first time the seed script runs. Think of it as the starting values so dev environments aren't empty. |

Once seeded, the live values live in the database. The website fetches them
from `GET /api/system-config/public` at page load. Edits happen in the admin
dashboard and propagate to every page within the cache TTL (~5 min).

**To edit anything in Layer 2:** log in to the admin dashboard, edit the value,
save. No code change, no PR, no deploy. Applies to all pages automatically.

### Which layer for what?

| Change type | Example | Layer |
|---|---|---|
| New brand color | "Let's add a secondary teal" | 1 (PR) |
| Change a brand color | "The navy is too dark" | 1 (PR) |
| Add or remove a font | "Swap BDSupper for a new display face" | 1 (PR) |
| Update phone number | "Our new line is 403-XXX-XXXX" | 2 (admin UI) |
| Add a TikTok link | Marketing wants to add social | 2 (admin UI) |
| Change delivery areas | "We now serve Airdrie too" | 2 (admin UI) |
| Update copyright year | Annual | 2 (admin UI, or auto) |
| Add an announcement banner | "Closed for Thanksgiving" | 2 (admin UI) |

---

## How to use brand values in code

### In the Next.js frontend (Tailwind)

Once `frontend/tailwind.config.ts` is updated to import from this folder
(pending PR — needs Gurleen's review because `frontend/` is her territory),
you can use brand colors like any Tailwind class:

```tsx
<button className="bg-brand-primary text-brand-cream hover:bg-brand-navy">
  Checkout
</button>
```

Font families work the same way:

```tsx
<h1 className="font-display">BetterDay</h1>
<p className="font-body">Calgary's fresh meal delivery.</p>
```

### In standalone HTML (prototypes, marketing site)

Link the CSS tokens file in your `<head>`:

```html
<link rel="stylesheet" href="/brand/tokens.css">
```

Then use the CSS custom properties anywhere:

```html
<style>
  .cta { background: var(--brand-yellow); color: var(--brand-navy); }
</style>
```

### Fetching site info at runtime (contact, social, etc.)

The site-shell loader (`conner/prototypes/website/shared/site-shell.js`)
handles this automatically. Any `{{contact.email}}` token in your HTML
gets replaced with the live value from the database at page load.

Full details in `conner/prototypes/website/shared/SITE_DATA_SPEC.md`.

---

## Current status

| Piece | Status |
|---|---|
| `colors.json` | ✅ Created (BetterDay palette, 12 brand colors + semantic tokens) |
| `typography.json` | ✅ Created (BDSupper, Gaya, Sofia Pro Soft, **Fastpen** accent) |
| `tokens.css` | ✅ Created (CSS custom properties for standalone HTML, incl. `--font-accent`) |
| `design-tokens.md` | ✅ Created (human-readable reference, ECC multi-brand stripped) |
| `fonts/` | ✅ Populated (5 font files: BDSupperBold, Gaya, SofiaProSoftBold, SofiaProSoftRegular, **Fastpen**) |
| `logos/` | ✅ Populated (PNG variants: Centered + Left Justified, Cream/Blue/Navy). SVG variants still pending. |
| `photos/` | ✅ Populated (22 product / lifestyle / section-illustration photos extracted from prototype base64, 2026-04-08) |
| `site-info.seed.json` | ✅ Created (15 initial `public.*` keys for Layer 2) |
| `GET /api/system-config/public` endpoint | ✅ Built on branch `conner/universal-brand-folder` |
| Seed runs on deploy | ✅ Wired into `backend/prisma/seed.ts` |
| Tailwind config wired to `colors.json` | ⏳ Pending — requires PR into `frontend/` (Gurleen's territory). Brand colors still use the default Next.js template palette until that lands. |
| Tailwind config wired to `typography.json` (incl. Fastpen) | ⏳ Pending — same PR as above. |

---

## Do NOT

- **Do not hardcode** hex colors, phone numbers, or emails anywhere outside this folder.
- **Do not duplicate** brand values in multiple places. If you need a color in a new place, import it from here.
- **Do not edit** `colors.json` or `typography.json` by hand without also updating `design-tokens.md` and `tokens.css` to match. They're three views of the same data.
- **Do not put** sensitive keys in `site-info.seed.json`. Only `public.*` prefixed values belong there. Secrets like `resend_api_key` go in the database directly with no prefix.
- **Do not move** fonts out of this folder. Any product that needs them should reference them from here.

---

## Future additions

Things that might eventually live in this folder but don't yet:

- `email-templates/` — shared React Email templates for transactional mail
- `voice.md` — tone of voice and copywriting guidelines
- `photo-guidelines.md` — how meal photography should look
- `motion.json` — animation durations and easing curves
- `a11y.md` — accessibility baseline
