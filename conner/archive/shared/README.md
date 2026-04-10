# `app/shared/` — BetterDay Site Shell

Shared page-shell fragments (header, footer) and the loader script that
injects them into every BetterDay front-end page. **Edit one file here and
every page that uses it updates automatically.**

---

## TL;DR for new pages

Any new HTML file in `app/` that should wear the marketing chrome needs
three things:

```html
<body data-site="marketing">

  <div data-shell="header"></div>

  <!-- your page content goes here -->

  <div data-shell="footer"></div>

  <script src="shared/site-shell.js" defer></script>
</body>
```

That's it. The loader fetches `shared/marketing-header.html` and
`shared/marketing-footer.html` and replaces the placeholders.

> **Heads up — local dev needs an HTTP server.** `fetch()` does not work
> from `file://` URLs. See the [Local development](#local-development) section
> below — it's a one-line command.

---

## What's in this folder

```
shared/
├── README.md              ← you are here
├── site-shell.js          ← the loader (fetches fragments + substitutes tokens)
├── site-data.json         ← site-wide facts (email, phone, social URLs, copyright)
├── SITE_DATA_SPEC.md      ← API contract for Gurleen's culinary-ops backend
├── marketing-header.html  ← header for public marketing pages
├── marketing-footer.html  ← footer for public marketing pages
├── app-header.html        ← (future) slim header for logged-in app pages
└── app-footer.html        ← (future) slim footer for logged-in app pages
```

Marketing pages use `data-site="marketing"`. App pages will use
`data-site="app"` (not built yet — see
[`#future-app-shell`](#future-app-shell)).

---

## How it works

1. Each page has placeholder `<div>` elements tagged with
   `data-shell="header"` / `data-shell="footer"`.
2. `site-shell.js` loads with `defer`, runs after HTML is parsed.
3. It reads `document.body.dataset.site` (e.g. `"marketing"`) and for each
   placeholder fetches `shared/{site}-{part}.html` from the same folder
   the script lives in.
4. The fetched HTML replaces the placeholder via `element.outerHTML = ...`.
   Inline `<style>` blocks in the fragment are applied by the browser.
   Inline event handlers (`onclick="..."`) are preserved.

**Why this pattern over a build step**: no `npm install`, no dev server to
fight, you can still open HTML files in a browser after running a one-line
local server. Designed for a solo front-end workflow.

**Why not web components**: `<site-header></site-header>` would require the
header HTML to live inside a JS template literal — loses syntax highlighting,
harder to edit. Keeping fragments as real `.html` files is easier.

---

## Local development

`fetch()` is blocked on `file://` URLs by every modern browser, so
double-clicking `betterday-v2_81.html` in Finder will fail to load the
header/footer. You need any local HTTP server. The simplest option:

```bash
cd ~/Desktop/BetterDay/betterday-webapp/app
python3 -m http.server 8000
```

Then open:

    http://localhost:8000/betterday-v2_81.html

Any file change auto-reloads when you refresh the browser. Ctrl-C to stop.

**Alternatives** (pick whichever you prefer, all work the same):

- **VS Code Live Server** extension — right-click an HTML file, "Open with Live Server"
- **`npx serve`** — `npx serve app` (needs Node.js)
- **`php -S localhost:8000`** — if PHP is installed
- **Caddy**, **nginx**, etc. — overkill for dev but work fine

In production on Render, everything is already served over HTTPS, so the
file:// problem doesn't exist there — fetches just work.

---

## Editing the header or footer

Change `shared/marketing-header.html` or `shared/marketing-footer.html` and
save. Refresh any marketing page — the change appears everywhere. No other
files need to be touched.

**If you want different header content on a specific page** (e.g. a landing
page with no nav at all), just omit the `<div data-shell="header"></div>`
placeholder from that page. The loader only injects where it finds
placeholders.

---

## Site-wide facts — the `{{token}}` system

Things like the company email, phone, social URLs, and copyright line
shouldn't be hardcoded into each fragment or page. They live in
**one file**: `shared/site-data.json`. Edit it once — every page that
references a token updates automatically.

### Available tokens

| Token | Example value |
|---|---|
| `{{company.legalName}}` | BetterDay Food Co. |
| `{{company.displayName}}` | BetterDay |
| `{{company.city}}` | Calgary |
| `{{company.province}}` | AB |
| `{{contact.email}}` | hello@eatbetterday.ca |
| `{{contact.phone}}` | (403) 371-2258 |
| `{{contact.phoneRaw}}` | +14033712258 (for `tel:` links) |
| `{{social.instagram}}` | https://www.instagram.com/betterdayfood/ |
| `{{social.facebook}}` | https://www.facebook.com/betterdayfood |
| `{{legal.copyrightYear}}` | 2026 |
| `{{legal.copyrightText}}` | © 2026 BetterDay Food Co. |
| `{{delivery.areas}}` | Calgary & surrounding |
| `{{delivery.schedule}}` | Every Sunday |

### Where tokens work

- **In shell fragments** (`marketing-header.html`, `marketing-footer.html`) —
  substituted before injection so raw tokens never appear in the DOM.
- **In any host page's text content** — e.g. a `<p>` tag body text.
- **In these HTML attributes** on host page elements: `href`, `src`, `alt`,
  `title`, `aria-label`, `placeholder`.

### Examples

Email link (anywhere in a page or fragment):
```html
<a href="mailto:{{contact.email}}">{{contact.email}}</a>
```

Phone link with separate display + tel: value:
```html
<a href="tel:{{contact.phoneRaw}}">{{contact.phone}}</a>
```

Social icon:
```html
<a href="{{social.instagram}}" target="_blank" rel="noopener">Instagram</a>
```

Copyright line:
```html
<span>{{legal.copyrightText}}</span>
```

Page body prose:
```html
<p>Questions? Email us at <a href="mailto:{{contact.email}}">{{contact.email}}</a>
   or call us at {{contact.phone}}. We deliver across {{delivery.areas}}
   {{delivery.schedule}}.</p>
```

### How to add a new token

1. Add the key/value to `site-data.json`.
2. Reference it as `{{your.new.key}}` in any fragment or page.
3. (When Gurleen's API is live) add the same key to `SystemConfig` in her
   admin dashboard with a `public.` prefix — see `SITE_DATA_SPEC.md`.

### Missing keys are visible on purpose

If you reference `{{nonexistent.key}}` and it's not in `site-data.json`, the
raw `{{nonexistent.key}}` text is left in place — **it won't silently
disappear**. That's intentional so you can spot typos fast during dev.

### Phase 2 switchover (when culinary-ops has the endpoint)

Today, `site-data.json` is a local stub. When Gurleen ships
`GET /api/system-config/public` on culinary-ops (see `SITE_DATA_SPEC.md`
for the full contract), switch to it by adding **one line** before the
`<script src="shared/site-shell.js">` tag on every page:

```html
<script>window.BETTERDAY_API_BASE = 'https://culinary-ops-api.onrender.com/api';</script>
<script src="shared/site-shell.js" defer></script>
```

The loader then fetches site data from the API instead of the JSON file.
Edit a value in the admin dashboard → every front-end page updates on the
next cache TTL. No file changes.

The JSON stub can be kept around as a fallback for local dev (when
`BETTERDAY_API_BASE` isn't set) or deleted entirely — your call.

---

## Why colors are literal hex, not CSS custom properties

The `<style>` blocks inside `marketing-header.html` and
`marketing-footer.html` use concrete hex values (`#FAEBDA`, `#4EA2FD`, etc.)
instead of `var(--cream)`, `var(--sky)`, etc.

This is deliberate — it means the fragments render correctly on any host
page, even one that doesn't define the `:root` brand variables. If you
change a brand color globally later, you'll need to update it in both
`design/design-tokens.md` AND the fragment files. That's a tiny cost for
making the fragments truly portable.

---

## Future: CMS content injection (Phase 2)

The same loader has a dormant hook for CMS-driven content. When Gurleen's
Commerce API is live, any element tagged `data-content="faq"` (or any key)
will get its `innerHTML` populated from `{API_BASE}/content/faq`.

**To enable it** on a page, include the API base URL before the script:

```html
<script>window.BETTERDAY_API_BASE = 'https://api.eatbetterday.ca/api';</script>
<script src="shared/site-shell.js" defer></script>
```

Then anywhere on the page:

```html
<section id="faq" data-content="faq">
  <!-- Loading placeholder (optional) -->
</section>
```

The loader will fetch `https://api.eatbetterday.ca/api/content/faq`, expect
a JSON response like `{ "html": "<h2>...</h2>..." }`, and replace the
section's contents.

Currently this does nothing because `window.BETTERDAY_API_BASE` is not set.
That's the Phase 2 flip.

---

## Future: app shell

App pages (subscriber hub, menu overlay, checkout, account) will use a
different, slimmer header — logo + user menu + log out, no big nav links,
no giant footer. Those live in `shared/app-header.html` and
`shared/app-footer.html` (not yet created).

On app pages you'll set `<body data-site="app">` and the same
`site-shell.js` script will fetch the `app-*` variants automatically.

Decide app-shell content and style after the `subscriber-hub-2.0.html`
design stabilizes.

---

## Troubleshooting

**"site-shell: failed to load marketing-header.html" red box appears**
→ You opened the file with `file://`. Start a local HTTP server — see
[Local development](#local-development).

**Header renders but looks wrong (missing fonts, broken colors)**
→ The host page is missing `@font-face` declarations. Fonts live in
`app/fonts/`; the fragment references `SofiaProSoft`, `Gaya`, `BDSupperBold`.
Every page needs to load them. (In practice `betterday-v2_81.html` already
declares them; any new marketing page must too.)

**Nav overlaps page content**
→ `.main-nav` is `position: fixed; height: 64px`. The host page needs
`padding-top: 64px` on its first content block (or 60px on mobile). See
how `betterday-v2_81.html` does it on `.hero`.

**Changes to `marketing-header.html` don't show up**
→ Browser is caching the fragment. Hard-refresh: Cmd-Shift-R on macOS.
