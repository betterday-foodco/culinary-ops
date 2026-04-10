# `brand/logos/` — Logo asset library

SVG (and PNG fallback) logo variants live here. **Currently empty** — drop
the files in when they're produced.

## Expected files

| File | Purpose | Dimensions |
|---|---|---|
| `primary.svg` | Full logo: icon + wordmark, horizontal | Scalable — design at ~400×120 |
| `stacked.svg` | Full logo: icon + wordmark, stacked vertically | Scalable — design at ~240×240 |
| `mark.svg` | Just the icon, no wordmark | Square — design at 128×128 |
| `wordmark.svg` | Just "BetterDay" as type, no icon | Scalable — design at ~400×80 |
| `favicon.svg` | Simplified mark for tab icon | 32×32 or 48×48 |
| `social-share.png` | 1200×630 image for Open Graph / Twitter Cards | PNG, 1200×630 |
| `apple-touch-icon.png` | iOS home-screen icon | PNG, 180×180 |

All SVG files should have:
- A single root `<svg>` element with `viewBox` set
- No hardcoded `width` / `height` attributes (let CSS size them)
- Colors that reference the BetterDay palette (see `../colors.json`)
- Optimised via SVGO before commit

## Usage

### In Next.js frontend

```tsx
import PrimaryLogo from '../../brand/logos/primary.svg'
<PrimaryLogo className="h-10 w-auto" />
```

### In HTML prototypes

```html
<img src="/brand/logos/primary.svg" alt="BetterDay" class="logo">
```

### In email templates

Prefer PNG fallbacks for maximum email client compatibility — many clients
(especially Outlook) don't render SVGs.

## When you add a new logo file

1. Drop it in this folder
2. Add a row to the table above
3. If it replaces an existing file, make sure every place referencing the
   old filename is updated or the old file is left as an alias
4. Commit with a message like `brand(logos): add stacked.svg variant`
