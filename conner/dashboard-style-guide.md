# Dashboard Style Guide

A short, copy-paste reference for the visual language inside
`frontend/app/(dashboard)/`. **There is no formal design system.**
Consistency across pages comes from repeated Tailwind utility strings
that propagate by "look at how the last page did it."

This doc extracts the patterns that have emerged so future pages (and
future Claude chats) don't have to reverse-engineer them again. It is
not a replacement for the universal `/brand/` tokens — those serve the
**customer-facing** side of the product (`conner/client-website/`).
The dashboard is a separate visual universe.

> **Scope:** `frontend/app/(dashboard)/**`. The customer-facing site at
> `conner/client-website/**` uses `/brand/tokens.css` instead and follows
> a completely different design vocabulary.

---

## 1. The vocabulary in one sentence

White cards on a light background, tight rounded-lg corners (8px) for
inputs and `rounded-xl` (12px) for table cards, Tailwind's `gray-*`
scale for everything neutral, the custom `brand-*` blues for primary
actions, system sans-serif throughout, dense data tables with hover
highlighting — Notion/Linear-adjacent, not BetterDay-branded.

---

## 2. Where the colors come from

**Not from `/brand/tokens.css`.** The dashboard has its own palette
defined in `frontend/tailwind.config.ts`:

```ts
colors: {
  brand: {
    50:  '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#1B6DB5',   // ← primary action color (+ Links)
    600: '#1559A0',   // ← primary action hover
    700: '#0E3A6E',   // ← active nav item text
  },
  'bd-yellow': '#F5C400',  // used ONCE — the "BD" logo square in the sidebar
},
```

Note the difference from `/brand/colors.json`:
- Dashboard `brand-500` is `#1B6DB5` (darker, more navy-leaning blue)
- Customer-site `--brand-primary` is `#4EA2FD` (lighter, sky blue)
- Dashboard `bd-yellow` is `#F5C400` (slightly muted)
- Customer-site `--brand-yellow` is `#FFC600` (brighter)

These are not in sync by design. If you find yourself wanting to
reach for a dashboard "navy" or "cream," you're building in the wrong
visual language — rethink whether the screen belongs in the dashboard
at all.

---

## 3. Fonts

**System defaults.** No `@font-face`, no custom OTFs, no Tailwind
font-family extension. Gaya / BDSupper / Sofia Pro Soft / Fastpen are
NOT loaded inside `frontend/`. If you see those in a dashboard design
mockup, they're wrong for the dashboard — they belong to the customer
site.

Body text is whatever the browser picks as its default sans-serif
(usually San Francisco on macOS, Segoe UI on Windows). Size scale
follows Tailwind defaults: `text-xs` (12px), `text-sm` (14px),
`text-base` (16px), `text-lg` (18px), `text-2xl` (24px). Most
dashboard content is `text-sm`; page titles are `text-2xl font-bold`.

---

## 4. Layout primitives

### Page root

```tsx
<div className="p-8">
  {/* page content */}
</div>
```

Most pages use `p-8` (32px). Sub-recipes uses `p-6` (24px) because it
has a left-side filter sidebar, and the extra tightness earns the
horizontal space back. Default to `p-8`.

### Page header

```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-2xl font-bold text-gray-900">Coupons</h1>
    <p className="text-sm text-gray-500 mt-0.5">{coupons.length} active</p>
  </div>
  <div className="flex gap-2">
    {/* action buttons */}
  </div>
</div>
```

Title on the left, action buttons on the right. Optional subtitle
underneath the title in `text-sm text-gray-500`. `mb-6` gives the
header room to breathe before the filters/table.

### Section heading (inside a page)

```tsx
<h2 className="text-lg font-semibold text-gray-900 mb-3">Limits</h2>
```

`text-lg font-semibold` for mid-level section heads. Not `font-bold`.

---

## 5. Tables

Tables are the most common dashboard pattern — every list page uses
the same structure.

### Table card wrapper

```tsx
<div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
  <table className="w-full text-sm">
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        {['Code', 'Name', 'Type', 'Value', 'Uses', 'Status', ''].map((h) => (
          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100">
      {/* rows */}
    </tbody>
  </table>
</div>
```

**Rules:**
- Card: `rounded-xl` (12px corners), `border-gray-200`, no shadow
- Header cells: `text-xs font-medium text-gray-500 uppercase tracking-wider`
  — the `tracking-wider` + uppercase is what makes headers feel "admin"
- Cell padding: `px-4 py-3`
- Row separator: `divide-y divide-gray-100` on the `<tbody>` (not on individual rows)
- Never use table border lines — rely on the `divide-y`

### Row

```tsx
<tr className="hover:bg-gray-50">
  <td className="px-4 py-3 font-medium text-gray-900">...</td>
  <td className="px-4 py-3 text-gray-600">...</td>
  <td className="px-4 py-3 font-mono text-xs text-gray-600">SKU-123</td>
</tr>
```

- Hover: `hover:bg-gray-50` (Tailwind's lightest gray)
- If the whole row is clickable: add `cursor-pointer` and an `onClick`
  that navigates to the detail page
- Monospace columns (SKU, ID, code): `font-mono text-xs`
- Primary column (the "name" the user reads first): `font-medium text-gray-900`
- Secondary columns: `text-gray-600`

### Empty state

```tsx
{!loading && filtered.length === 0 && (
  <tr>
    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
      No coupons found
    </td>
  </tr>
)}
```

`py-10` (40px vertical) gives the empty message enough air.

### Loading state

```tsx
{loading && (
  <tr>
    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
      Loading...
    </td>
  </tr>
)}
```

Literal `Loading...` string. No spinners. No skeleton rows. If the
page has real performance issues, consider adding a skeleton — but the
default is "just print the word."

---

## 6. Buttons

### Primary action

```tsx
<button
  onClick={openNew}
  className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
>
  + New coupon
</button>
```

- Padding: `px-4 py-2`
- Background: `bg-brand-500` hover `bg-brand-600`
- Text: `text-white text-sm font-medium`
- Corners: `rounded-lg` (8px)
- Transition: always include `transition-colors`
- Leading symbol convention: `+` prefix for "create/new" buttons (no
  icons — they'd look out of place with the system font)

### Secondary / outline

```tsx
<button
  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
>
  Export CSV
</button>
```

Same shape as primary but `border border-gray-300` + `text-gray-700`
on a transparent background. Hover adds the lightest gray fill.

### Ghost (inline / text-like)

```tsx
<button className="text-xs text-brand-600 hover:underline">Edit</button>
<button className="text-xs text-red-500 hover:underline">Delete</button>
```

Used inside table rows for Edit/Delete actions. No background, no
border, just colored text with underline on hover. `text-xs` so they
don't dominate the row.

### Destructive button (if you need a full button, not a link)

```tsx
<button className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors">
  Delete permanently
</button>
```

Same shape as primary, swap `brand-*` for `red-*`. Reserve for hard-
delete flows; inline row actions should stay as text-only links.

---

## 7. Form inputs

### Text input

```tsx
<input
  type="text"
  value={form.code}
  onChange={(e) => setForm({ ...form, code: e.target.value })}
  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
  placeholder="WELCOME10"
/>
```

- Padding: `px-3 py-2` (smaller than buttons — inputs are denser)
- Border: `border border-gray-300`
- Corners: `rounded-lg`
- Focus: `focus:outline-none focus:ring-2 focus:ring-brand-500` (no
  border color change, just a 2px brand-blue ring)
- Text size: `text-sm`

### Label

```tsx
<label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
```

`block` so it stacks above the input. `mb-1` for tight spacing.
`text-sm font-medium` — not `text-xs uppercase` (that's for table
headers, not form labels). Required-field indicators are done by
appending `*` to the label text inline, not via a CSS pseudo-element.

### Select

```tsx
<select
  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
>
  {/* options */}
</select>
```

Same shape as text input. The `bg-white` is important — without it,
some browsers render native grey select backgrounds.

### Checkbox + label pair

```tsx
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
  />
  <span className="text-sm text-gray-700">Require verified email</span>
</label>
```

`flex items-center gap-2` puts the checkbox beside the label.
`text-brand-600` sets the checked color. `cursor-pointer` on the
`<label>` wrapper means clicking the text also toggles.

### Error message

```tsx
{error && (
  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
    {error}
  </p>
)}
```

Red text on a light red background in a small rounded box. Use for
form-level errors (not per-field).

---

## 8. Filters + search toolbar

The pattern sitting above most list tables:

```tsx
<div className="flex gap-3 mb-6">
  <input
    type="text"
    placeholder="Search by code or name..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
  />
  <select
    value={filterStatus}
    onChange={(e) => setFilterStatus(e.target.value)}
    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
  >
    <option value="">All statuses</option>
    {/* more options */}
  </select>
</div>
```

`flex gap-3` horizontal row, search input takes `flex-1`, filter
dropdowns are natural-width on the right. `mb-6` separates it from the
table below.

### Category pills (alternative to a dropdown)

When a filter has ~3-10 discrete values, use pills instead of a
dropdown. Meals does this for categories:

```tsx
<div className="flex flex-wrap gap-2 mb-5">
  <button
    onClick={() => setFilter('')}
    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
      filter === ''
        ? 'bg-brand-500 text-white'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`}
  >
    All ({total})
  </button>
  {/* one pill per category */}
</div>
```

`rounded-full` (pills), `text-xs font-medium`, `px-3 py-1`. Active
state inverts to `bg-brand-500 text-white`. Inactive state is
`bg-gray-100 text-gray-600`.

---

## 9. Status chips

Inline status labels inside tables:

```tsx
<span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-xs">
  Active
</span>
```

**Variants:**
- Neutral: `bg-gray-100 text-gray-700`
- Success / active: `bg-green-50 text-green-700`
- Warning / scheduled: `bg-yellow-50 text-yellow-700`
- Error / archived: `bg-red-50 text-red-700`
- Info: `bg-blue-50 text-blue-700`

Always `px-2 py-0.5 rounded-md text-xs`. Small, tight, non-uppercase
— these aren't shouty badges, they're inline tags.

### Allergen-style chips (multiple per cell)

```tsx
<div className="flex flex-wrap gap-1">
  {allergens.map((a) => (
    <span key={a} className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-xs">
      {a}
    </span>
  ))}
</div>
```

Tighter padding (`px-1.5 py-0.5`) because there are several per cell.
`rounded` instead of `rounded-md`. Wrapping with `flex flex-wrap gap-1`.

---

## 10. Modals

```tsx
{showForm && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          {editItem ? 'Edit Coupon' : 'New Coupon'}
        </h2>
      </div>
      <div className="p-6 space-y-4">
        {/* form fields */}
      </div>
      <div className="px-6 pb-6 flex gap-3 justify-end">
        <button
          onClick={() => setShowForm(false)}
          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600"
        >
          Save
        </button>
      </div>
    </div>
  </div>
)}
```

**Rules:**
- Backdrop: `fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4`
- Modal: `bg-white rounded-2xl shadow-xl` — note `rounded-2xl` (16px), larger than cards or inputs
- Max width: `max-w-lg` for most forms, `max-w-2xl` for wider content
- Max height: `max-h-[90vh] overflow-y-auto` so it scrolls on small screens
- Three sections: header (`p-6 border-b`), body (`p-6 space-y-4`), footer (`px-6 pb-6 flex gap-3 justify-end`)
- Title: `text-lg font-semibold` (not `text-2xl` — modals are smaller than pages)
- Cancel on the left, primary action on the right

Confirmation dialogs use the native `confirm()` — e.g. `if
(!confirm('Delete this meal?')) return;`. No fancy custom confirm
modal exists yet. If you need one, ask first rather than inventing a
new component.

---

## 11. Spacing scale cheat sheet

The dashboard uses tight Tailwind spacing. Common values:

- **Page padding:** `p-8` (`p-6` if the page has a filter sidebar)
- **Section gap:** `mb-6` between header and content, `mb-5` between
  filters and table, `mb-4` between paragraphs
- **Form field gap:** `space-y-4` on the form body container
- **Inline gaps:** `gap-2` (8px) for tight clusters, `gap-3` (12px)
  for button rows, `gap-1.5` for dense chip rows
- **Card padding:** `p-6` for modals, table cells use `px-4 py-3`
- **Corner radii:** `rounded-md` (6px) for small chips, `rounded-lg`
  (8px) for inputs/buttons, `rounded-xl` (12px) for table cards,
  `rounded-2xl` (16px) for modals, `rounded-full` for pills and the
  "BD" logo

Avoid `rounded-3xl` or anything larger — too soft for this visual
language.

---

## 12. Things to NOT do

Quick list of patterns that would break the dashboard's consistency:

- ❌ **Don't import `/brand/tokens.css`** — it loads the customer-site
  fonts and overrides `body` styles. If you need a brand color in the
  dashboard, use Tailwind's `brand-*` or `yellow-*` / `gray-*`.
- ❌ **Don't use `var(--brand-navy)` or any other custom property** — those
  aren't defined in the dashboard scope.
- ❌ **Don't load custom fonts** (`font-display`, `font-heading`,
  `font-accent`) — system defaults only.
- ❌ **Don't use `bg-bd-yellow` as a primary action color** — it's
  reserved for the "BD" logo square in the sidebar. Primary CTAs use
  `bg-brand-500`.
- ❌ **Don't use emoji in production pages** except in modal confirm()
  strings and optional visual garnish (like 🔍 next to a search
  placeholder). Never in table headers, labels, or buttons.
- ❌ **Don't use `text-2xl` for anything except a top-level page title.**
  Section heads are `text-lg font-semibold`, card titles are
  `text-base font-medium`.
- ❌ **Don't add drop shadows on cards** beyond the modal's `shadow-xl`.
  Table cards and content cards use only a subtle `border border-gray-200`.
- ❌ **Don't mix `rounded-lg` and `rounded-xl` within the same card layout.**
  Pick one — usually `rounded-xl` wraps the table, `rounded-lg` wraps
  the inputs inside it.
- ❌ **Don't create new color tokens** inside the dashboard. If you
  need a new shade, either use what Tailwind ships (there are 10
  shades per color) or start a conversation about extending
  `tailwind.config.ts`.

---

## 13. When to break these rules

This guide describes the **current** dashboard. If the coupon module
(or any future module) has a genuinely different interaction pattern
that doesn't fit — e.g. a stepper, a calendar view, an inline editor —
it's OK to introduce new patterns. Just do two things:

1. **Document the new pattern** by appending to this file. Other chats
   won't know it exists otherwise.
2. **Stay within the color, font, and corner-radius vocabulary.** The
   dashboard's visual cohesion comes mostly from those three things.
   Break the layout or interaction pattern, not the aesthetic.

The worst outcome is a dashboard page that feels like it's from a
different app. The second-worst outcome is a dashboard that never
evolves because every new pattern has to fight existing conventions.
Bias toward documentation over purity.

---

## 14. Reference pages to copy from

When in doubt, look at these existing pages for concrete examples:

| Page | Path | What it's good for |
|---|---|---|
| **Ingredients** | `frontend/app/(dashboard)/ingredients/page.tsx` | The simplest list + filter + modal CRUD pattern. Closest reference for a new list module. |
| **Meals** | `frontend/app/(dashboard)/meals/page.tsx` | Category pill filters, export buttons in the page header, click-the-row navigation to detail page |
| **Sub-Recipes** | `frontend/app/(dashboard)/sub-recipes/page.tsx` | Left-side filter sidebar pattern (alternative to top-toolbar filters), `p-6` page padding, chip groups |
| **Dashboard layout** | `frontend/app/(dashboard)/layout.tsx` | The sidebar nav, active-link styling, section dividers, logout button |

If you're building a new list page, start by opening
`ingredients/page.tsx` side-by-side and use it as a template. Every
convention in this guide comes from patterns that are already there.

---

## 15. Placeholder sidebar (for HTML prototypes)

When you're building a **standalone HTML prototype** in `conner/` that
should visually match the real dashboard, the sidebar nav is the most
important thing to get right — it anchors the whole visual frame.
Without it, your prototype page floats alone and feels stub-quality.

**Use this when:** you're mocking up a page that will eventually live
at `frontend/app/(dashboard)/YOUR-PAGE/page.tsx` and you want the
prototype to preview what the final dashboard page will look like.

**Don't use this when:** you're building a customer-facing page
(those go in `conner/client-website/` and use `brand/tokens.css`).

The pattern is literally lifted from
`frontend/app/(dashboard)/layout.tsx`. In a real Next.js page you
don't write this HTML at all — the layout component renders the
sidebar for you and your page just provides `children`. But in a
standalone prototype, you need to copy the sidebar in by hand.

### Copy-paste skeleton

```html
<body class="bg-gray-50" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;">
<div class="flex h-screen">

  <!-- ━━━ SIDEBAR PLACEHOLDER ━━━ -->
  <aside class="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">

    <!-- Logo header -->
    <div class="h-14 flex items-center px-5 border-b border-gray-200">
      <span class="w-8 h-8 bg-bd-yellow rounded-lg flex items-center justify-center text-brand-700 font-black text-xs mr-2.5 tracking-tight shadow-sm">BD</span>
      <span class="font-semibold text-gray-900 text-sm">BetterDay Kitchen</span>
    </div>

    <!-- Primary nav -->
    <nav class="flex-1 py-4 px-3 overflow-y-auto">
      <div class="space-y-0.5">

        <!-- YOUR page entry — MARK THIS AS ACTIVE -->
        <a href="#" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm bg-brand-50 text-brand-700 font-medium">
          <span class="text-base leading-none">🎟️</span>
          Coupons
        </a>

        <!-- All other primary nav entries — keep every one, even as placeholders -->
        <a href="#" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
          <span class="text-base leading-none">⊞</span>Dashboard
        </a>
        <a href="#" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
          <span class="text-base leading-none">📅</span>Production Plans
        </a>
        <a href="#" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
          <span class="text-base leading-none">📦</span>Inventory
        </a>
        <a href="#" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
          <span class="text-base leading-none">🍽</span>Meal Recipes
        </a>
        <a href="#" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
          <span class="text-base leading-none">📋</span>Menu Builder
        </a>
        <a href="#" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
          <span class="text-base leading-none">🍲</span>Sub-Recipes
        </a>
        <a href="#" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
          <span class="text-base leading-none">🥦</span>Ingredients
        </a>
      </div>

      <div class="my-3 border-t border-gray-100"></div>

      <!-- Settings link -->
      <a href="#" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
        <span class="text-base leading-none">⚙</span>Settings
      </a>
    </nav>

    <!-- Sign out footer (always pinned at bottom) -->
    <div class="p-3 border-t border-gray-200">
      <button class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">
        <span class="text-base leading-none">→</span>
        Sign out
      </button>
    </div>
  </aside>

  <!-- ━━━ MAIN CONTENT (your page goes here) ━━━ -->
  <main class="flex-1 overflow-y-auto">
    <div class="p-8">
      <!-- page content -->
    </div>
  </main>

</div>
</body>
```

### The rules

1. **Always include every primary nav entry**, even as placeholder
   `href="#"` links. An almost-empty sidebar with only YOUR page in it
   makes the prototype feel half-built. Populating all seven entries
   anchors the viewer's mental model that "this will be one page in a
   larger admin."
2. **Mark YOUR page as active** with
   `bg-brand-50 text-brand-700 font-medium`. All other links use the
   standard inactive hover state
   (`text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors`).
3. **Width is `w-60` (240px)**, not `w-56` or `w-64`. The real
   dashboard uses exactly this — matching it means your prototype
   page's content area is the same width as the eventual real page.
4. **Logo icon always uses `bg-bd-yellow`.** This is the one and only
   place the `bd-yellow` token is correct in the dashboard vocabulary.
   (Don't reach for it for buttons, pills, or accents elsewhere.)
5. **Sign-out button always pinned at the bottom** with
   `border-t border-gray-200` above it. `flex flex-col` on the
   `<aside>` + `flex-1` on the `<nav>` is what pushes it down.
6. **Collapsible sections ("Manage Kitchen," "Others") are optional
   in prototypes** — omit them if they'd just be noise, include them
   (with dummy children) if the prototype is demonstrating how the
   sidebar feels when fully populated.
7. **Don't load `brand/tokens.css`** — it'll inject customer-site
   fonts into your prototype and override `body` styles. Prototypes
   that use this placeholder should use Tailwind Play CDN instead
   (see next section).

### Example in use

`conner/coupon-admin-prototype.html` uses this placeholder sidebar
with the "Coupons" entry marked active; all seven real primary nav
entries as inactive links; and the optional "Manage Kitchen" + "Others"
collapsibles included (with dummy sub-entries) to show the fully-
populated sidebar feel.

---

## 16. Tailwind Play CDN for prototypes

Standalone HTML prototypes in `conner/` don't have a Next.js build
step, so the normal Tailwind pipeline isn't available. Use **Tailwind
Play CDN** with a config override that mirrors
`frontend/tailwind.config.ts`:

```html
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          brand: {
            50:  '#EFF6FF',
            100: '#DBEAFE',
            200: '#BFDBFE',
            300: '#93C5FD',
            400: '#60A5FA',
            500: '#1B6DB5',
            600: '#1559A0',
            700: '#0E3A6E',
          },
          'bd-yellow': '#F5C400',
        },
      },
    },
  };
</script>
```

This gives you every class documented in this guide
(`bg-brand-500`, `text-brand-700`, `bg-bd-yellow`, etc.) with the same
hex values as the real dashboard.

**Caveats:**
- Play CDN prints a warning in the browser console that it's not for
  production. That's correct — this is for prototypes only. Don't
  use Play CDN in anything under `frontend/`.
- Some less-common Tailwind features (JIT arbitrary values like
  `bg-[#123456]`) do work, but not as fast. Stick to the documented
  classes in this guide when possible.
- If you need a system font, apply it as an inline `style` on
  `<body>` — there's no font-family utility in the config:
  `style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;"`

---

## 17. Maintenance

**Update this file whenever you notice:**
- A new pattern you had to invent because nothing existing fit
- A pattern in the "reference pages" section above changes
  substantially
- A new color, font, or spacing token is added to `tailwind.config.ts`
- A shared component is introduced (nothing in `frontend/components/`
  or `frontend/app/ui/` today)

Keep the file short. If it grows past ~400 lines it should probably
split into multiple files or, better, become a real Storybook.

*Last updated: 2026-04-09 by the coupons chat while extracting patterns
from `ingredients/page.tsx`, `meals/page.tsx`, and `sub-recipes/page.tsx`.*
