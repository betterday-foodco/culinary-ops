# BetterDay Design Tokens — Human Reference

This is the **human-readable** reference for the BetterDay design system.
The machine-readable source of truth lives in `colors.json` + `typography.json`
and is mirrored into `tokens.css` for standalone HTML consumers.

When you edit this file, also edit those in the same commit. They're three
views of the same data.

---

## Brand Palette

The 9 core brand colors. Everything else derives from these.

| Token | Hex | When to use |
|---|---|---|
| `brand.primary` | `#4EA2FD` | Nav bar background, active link accents, qty control mid-section |
| `brand.navy` | `#00465E` | Text headings, primary button backgrounds (Add to Cart, filter, etc.), card name color, section headers |
| `brand.navy-dark` | `#003141` | Hover states, deep text, box-shadow accents |
| `brand.cream` | `#FAEBDA` | Page background, tab bar, nav text color, in-cart text |
| `brand.yellow` | `#FFC600` | CTA buttons (Checkout, Subscribe, Done), NEW badge, savings badges |
| `brand.yellow-dark` | `#E6B300` | CTA button hover states |
| `brand.purple` | `#C8A4F5` | In-cart card body background, savings progress bar fill |
| `brand.purple-dark` | `#7453A2` | Savings tier text, savings percentage labels |
| `brand.green` | `#6BBD52` | Positive states, Vegan badge, success messages |
| `brand.green-dark` | `#167421` | Success deep accents |
| `brand.red` | `#D93025` | Destructive actions (Edit Cart on subscriber hub), Spicy badge, error states |
| `brand.red-dark` | `#B91C1C` | Destructive action hover states |

---

## Functional Colors

Semantic tokens derived from the palette above. Use these by **meaning**,
not by hue. Components should reach for `--text-primary` rather than
`--brand-navy-dark` so that a future rebrand only requires editing the
palette, not every component.

### Backgrounds

| Token | Value | Usage |
|---|---|---|
| `bg-page` | `brand.cream` | Main page background |
| `bg-card` | `#FFFFFF` | Card backgrounds, sidebar background, filter dropdown background |
| `bg-nav` | `brand.primary` | Top navigation bar |
| `bg-tab-bar` | `brand.cream` | Category tabs row |
| `bg-sidebar` | `#FFFFFF` | Cart sidebar |
| `bg-footer-dark` | `#1A1A1A` | Cart footer action bar (edit cart + totals) |
| `bg-incart` | `brand.purple` | Meal card body when the meal is in the cart |

### Text

| Token | Value | Usage |
|---|---|---|
| `text-primary` | `brand.navy-dark` | Main text, headings |
| `text-secondary` | `brand.navy` | Section headers, button labels |
| `text-muted` | `rgba(0, 49, 65, 0.45)` | Macro labels, helper text |
| `text-on-brand` | `brand.cream` | Text on brand-colored backgrounds |
| `text-on-dark` | `#FFFFFF` | Text on dark/navy backgrounds |
| `text-incart` | `brand.cream` | Meal name/price when card is in-cart state |

### Borders

| Token | Value | Usage |
|---|---|---|
| `border-card` | `none` | Cards use shadow instead of border |
| `border-tab` | `rgba(0, 49, 65, 0.25)` | Tab pill borders |
| `border-section` | `#E0D0BC` | Section header underlines |

### Shadows

| Token | Value | Usage |
|---|---|---|
| `shadow-card` | `0 2px 8px rgba(0, 49, 65, 0.08)` | Default card shadow |
| `shadow-card-hover` | `7px 7px 0 var(--brand-navy-dark)` | Card hover shadow (offset/sketch style) |
| `shadow-sidebar` | `-8px 0 30px rgba(0, 49, 65, 0.18)` | Cart sidebar drop shadow |

### Radius

| Token | Value | Usage |
|---|---|---|
| `radius-card` | `20px` | Card corners |
| `radius-button` | `100px` | Pill-shaped buttons |
| `radius-badge` | `100px` | Photo badge pills |

---

## Buttons

Concrete examples of how buttons are composed from the tokens above.

| Button | Background | Text | Hover |
|---|---|---|---|
| Add to Cart | `brand.navy` | `#FFFFFF` | `#003A4E` |
| Qty Control −/+ | `brand.navy` | `#FFFFFF` | `#003A4E` |
| Qty Control (middle) | `brand.primary` | `#FFFFFF` | — |
| Checkout / Primary CTA | `brand.yellow` | `brand.navy-dark` | `brand.yellow-dark` |
| Done / Close | `brand.yellow` | `brand.navy-dark` | `brand.yellow-dark` |
| Category Tab (active) | `brand.navy` | `#FFFFFF` | — |
| Category Tab (inactive) | `#FFFFFF` | `brand.navy` | `#E8F4F8` |
| Sort & Filter | `#FFFFFF` | `brand.navy` | `#E8F4F8` |
| Sort & Filter (open) | `brand.navy` | `#FFFFFF` | — |
| Filter Chip (active) | `brand.navy` | `#FFFFFF` | `#006A8E` |
| Filter Apply | `brand.navy` | `#FFFFFF` | `#006A8E` |
| Subscribe toggle (active) | `#FFFFFF` | `brand.navy` | — |
| Edit Cart (destructive) | `brand.red` | `#FFFFFF` | `brand.red-dark` |

---

## Badges

| Badge | Background | Text |
|---|---|---|
| Vegan | `rgba(22, 163, 74, 0.9)` | `#FFFFFF` |
| High Protein | `rgba(0, 70, 94, 0.9)` | `#FFFFFF` |
| Spicy | `rgba(220, 38, 38, 0.85)` | `#FFFFFF` |
| Dairy | `rgba(217, 119, 6, 0.85)` | `#FFFFFF` |
| NEW | `rgba(255, 198, 0, 0.95)` | `brand.navy` |
| Popular | `rgba(0, 70, 94, 0.85)` | `#FFFFFF` |

---

## Savings Tiers

| Element | Color |
|---|---|
| Progress bar fill | `brand.purple` |
| Progress bar track | `#E8E0F0` (light purple) |
| Tier markers (active) | `brand.purple-dark` |
| Tier markers (inactive) | `#CCC` |
| Savings % text | `brand.purple-dark` |

---

## Typography

Three font families, used for clearly distinct purposes. Do not mix.

| Family | Role | When to reach for it |
|---|---|---|
| **BDSupper Bold** (`font-display`) | Display | Meal names on cards, logo wordmark, visual accent text. Use sparingly — this is a personality font, not a workhorse. |
| **Gaya** (`font-heading`) | Headings | Section headers, cart title, nav logo, page titles. Serifs add editorial feel without being stuffy. |
| **Sofia Pro Soft** (`font-body`) | Body / UI | All body copy, buttons, labels, macro stats, prices. This is the everyday workhorse. |

### Type scale

| Size | Pixel value | Typical usage |
|---|---|---|
| `display-lg` | 48px | Hero headlines (rare) |
| `display` | 36px | Large callouts |
| `heading-xl` | 28px | Page titles |
| `heading-lg` | 24px | Cart title, sidebar headings |
| `heading` | 22px | Section headers |
| `heading-sm` | 18px | Subsection headers |
| `body-lg` | 16px | Lead paragraphs |
| `body` | 14px | Default body text, button text |
| `body-sm` | 13px | Secondary UI text |
| `meal-name` | 15px | Meal name on card (BDSupper) |
| `price` | 15px | Price on card |
| `button` | 14px | Button labels |
| `macro-value` | 12px | Big numbers in macro strip (protein, carbs, fat) |
| `macro-label` | 8.5px | Tiny labels under macro values |
| `caption` | 11px | Footnotes, timestamps |

### Weights

| Name | Value | Used by |
|---|---|---|
| Regular | 400 | Gaya, Sofia Pro Regular, body text |
| Medium | 500 | Sofia Pro Medium (rare, reserved for emphasis that isn't bold) |
| Semibold | 600 | Sofia Pro Semibold (macro labels) |
| Bold | 700 | BDSupper Bold, Sofia Pro Bold, button text, meal names |
| Extrabold | 800 | Sofia Pro Extrabold, macro values, prices |

---

## Fonts on disk

Located in `brand/fonts/`:

| Font file | Family | Weight |
|---|---|---|
| `BDSupperBold.otf` | BDSupper | 700 |
| `Gaya.otf` | Gaya | 400 |
| `SofiaProSoftRegular.otf` | Sofia Pro Soft | 400 |
| `SofiaProSoftBold.otf` | Sofia Pro Soft | 700 |

If you add more weights (regular BDSupper, italic Gaya, medium/semibold Sofia),
drop the file in `brand/fonts/` and register it in both `typography.json`
(machine-readable) and `tokens.css` (@font-face declaration).

---

## How to change a brand color

If Amy decides the navy is too dark and should be `#005470`:

1. Edit `colors.json` — change `"navy": "#00465E"` to `"navy": "#005470"`
2. Edit `tokens.css` — change `--brand-navy: #00465E;` to `--brand-navy: #005470;`
3. Edit this file (`design-tokens.md`) — update the palette table row
4. Commit all three files together with a message like `brand: darken navy from #00465E to #005470`
5. Open a PR

Every product that imports from this folder updates automatically on the next deploy.
