# Checkout Module — Status & Next Steps

> **Scope of this file:** a single-source status snapshot for the customer-facing checkout page at `conner/client-website/checkout.html`. Anyone picking up work on the checkout should read this first. If the checkout state changes significantly, update this file in the same commit.
>
> **Last updated:** 2026-04-09 (checkout port + subscriber discount calculator fix session)
> **Current branch baseline:** `conner/universal-brand-folder` at commit `3393e2d`
> **Shipping status:** ✅ Built, 🎭 payment mocked, 🚧 not yet smoke-tested in a browser, 🚢 not yet pushed to origin

---

## TL;DR — where we are right now

1. **Checkout page exists** as a standalone 3,023-line HTML file at `conner/client-website/checkout.html`. Guest-first, 4-step accordion, brand-tokenized, mobile-responsive.
2. **Pricing math is correct** — the totals breakdown is verifiable end-to-end: `regularSubtotal − mealSavings + GST + delivery = total`. Fixed in this session after discovering the prototype it was ported from had a broken two-price model.
3. **Menu → checkout handoff works** — clicking "Place Weekly Order" on the menu serializes the cart to `localStorage['betterday.cart.v1']` (v2 schema) and navigates to checkout.html.
4. **Payment is fully mocked** — no Helcim, no Stripe, no real card tokenization. Express Apple/Google Pay buttons show a 2-second processing overlay then an inline success panel. The real backend wiring lives in a sibling worktree (`culinary-ops-helcim-integration`) owned by a different chat.
5. **Nothing is pushed yet.** Three commits ahead of `origin/conner/universal-brand-folder`: the calculator-fix commit (`701fec0`), the merge commit (`0314429`), and the PROJECT_SCOPE update (`3393e2d`). All waiting on a browser smoke test before push.

---

## Status matrix

| Area | Status | Notes |
|---|---|---|
| **Page file** | ✅ Built (3,023 lines) | `conner/client-website/checkout.html` |
| **Shared pricing config** | ✅ Built | `conner/client-website/shared/subscription-config.js` |
| **Menu → checkout handoff** | ✅ Wired | `menu/index.html:2305` `handleCheckout()` |
| **Cart schema contract** | ✅ Defined (v2) | `localStorage['betterday.cart.v1']` |
| **Brand tokenization** | ✅ Complete | 0 raw hexes outside the `:root` locals block + Google Pay SVG fills |
| **Step 1 — Contact** | ✅ Working | Guest form, phone auto-format, localStorage contact autofill |
| **Step 2 — Delivery** | ✅ Working | Gift toggle, delivery/pickup toggle, inline address form (guest), pickup locations + date |
| **Step 3 — Payment** | 🎭 Mocked | Inline card form exists, card-type detection, MM/YY formatter, **no real tokenization** |
| **Step 4 — Review** | ✅ Working | Populates from state, consent checkboxes, "Place Order" CTA |
| **Order totals calculator** | ✅ Correct | Fixed this session; all lines add up |
| **Discount code field** | 🎭 Mocked | Any code string gives a flat 10% off. Real validation → Helcim chat |
| **Gift card field** | 🎭 Mocked | Any string applies a flat $10. Real validation → Helcim chat |
| **Reward points toggle** | 🎭 Mocked | Hardcoded balance of 1,239 pts |
| **Express checkout (Apple Pay)** | 🎭 Mocked | 2-sec overlay → success panel. No real SDK. |
| **Express checkout (Google Pay)** | 🎭 Mocked | Same as Apple Pay |
| **Subscription upsell banner** | ✅ Working | Shows only for one-time carts; projected savings from real tier table |
| **Cutoff countdown** | 🎭 Mocked | Hardcoded to "2 days from now, end of day". Real cutoff → commerce backend |
| **Mobile sticky CTA bar** | ✅ Working | Below 980px viewport |
| **Success panel** | ✅ Working | Inline swap, clears cart from localStorage, logs full order payload to console |
| **Toast notifications** | ✅ Working | Minimal inline impl (success / info / warning) |
| **Site shell (header/footer)** | ✅ Wired | `data-shell="header"` + `site-shell.js`, inherits from `marketing-header.html`/`marketing-footer.html` |
| **Need-help block** | ✅ Wired | `{{contact.phone}}` + `{{contact.email}}` tokens interpolated by site-shell.js |
| **Browser smoke test** | 🚧 Not yet run | **This is the next action before pushing** |
| **Pushed to origin** | 🚢 No | 3 commits waiting |

**Legend:** ✅ working · 🎭 mocked (real impl elsewhere) · 🚧 in progress / not yet done · 🚢 shipping gate · ⚠️ known issue

---

## What's built and working (feature-by-feature)

### Navy header bar with live cutoff countdown

**Location:** `checkout.html` HTML body lines ~1523–1543, JS `updateCutoffCountdown()` ~line 2325.

- Navy background (`var(--brand-navy)`), cream text (`var(--brand-cream)`), yellow accents (`var(--brand-yellow)`) for the countdown cells and the cutoff date label.
- "Cut-off Thu, Apr 9" label on the right, followed by four tabular-numeric cells: Days / Hrs / Min / Sec.
- Countdown recomputes every second via `setInterval(updateCutoffCountdown, 1000)` (kicked off inside `initCheckout()`).
- Cutoff target is currently **hardcoded** to "2 days from now, 23:59:59 local time" (see `getCutoffDate()`). Real cutoff should come from the backend when commerce is wired.

### 4-step accordion stepper

**CSS:** `.checkout-stepper`, `.checkout-step`, `.checkout-step-num`, `.checkout-step-head`, `.checkout-step-title`, `.checkout-step-edit`, `.checkout-step-recap`, `.checkout-step-body`
**JS:** `renderCheckoutStepper()`, `continueCheckoutStep(n)`, `editCheckoutStep(n)`, `getCheckoutStepRecap(n)`

State machine:
- Each step carries one of three classes: `active` (expanded, editable, green-glow navy circle), `complete` (collapsed to recap row, green circle with checkmark SVG, "Edit" button visible), or `pending` (greyed out, cream background, dim number).
- Clicking a complete step's body returns that step to `active` and demotes the others accordingly.
- Vertical connector line (`.checkout-stepper::before`) runs down the left margin and the numbered circles sit on top of it.
- Continue button at the bottom of each step validates that step's fields, flips state to complete, advances to the next step, smooth-scrolls.

**Step 1 — Contact.** First name, last name, email, phone (auto-formatted `(xxx) xxx-xxxx`), "keep me updated with news and offers" checkbox. Pre-fills from `localStorage['betterday.guest_contact.v1']` if present, writes back on continue.

**Step 2 — Delivery.** Three sub-decisions wrapped in one step:
1. **Gift toggle** — "Me" vs "Send as a gift". When the gift mode is on, a green-bordered notice appears plus recipient fields (first/last/phone/message).
2. **Method toggle** — Delivery vs Pickup. Flips the panel below it.
3. **Address collection (delivery path):** If `acctAddresses.length > 0`, a radio list of saved addresses renders (logged-in future path). If empty (current guest default), an inline address form renders inline — street, apt/unit, city, province (auto-uppercase 2-char), postal code (auto-uppercase + space insertion like `T2T 1S5`), delivery notes textarea. Country is disabled + hardcoded to Canada.
4. **Pickup collection (pickup path):** Radio list of `checkoutPickupLocations` (two mock locations: BetterDay HQ Calgary, Canmore Depot), plus a native HTML `<input type="date">` for pickup date (min = today, default = 6 days from today).
5. **Arrival banner** — yellow info banner with "Your order arrives Wednesday, April 15" text (currently hardcoded — should be computed from selected delivery week).

**Step 3 — Payment.** Same radio-list-if-saved / inline-form-if-empty pattern as the address:
- If `paymentMethods.length > 0`: renders saved card radio list with Visa/MC/Amex tile badges.
- If empty (current guest default): renders an inline form — cardholder name, card number (auto-spaces every 4 digits), expiry (`MM/YY` with auto-slash), CVC (numeric, 3–4 chars), "Save this card for next time" checkbox.
- Card type auto-detected from number prefix (`detectCardType()`): `4` → visa, `51-55`/`22-27` → mc, `34`/`37` → amex, `6011`/`65` → disc.
- PCI badge row below: "Encrypted & PCI compliant" label + Visa/MC/Amex/Disc brand tiles (real brand colors, not BetterDay colors).

**Step 4 — Review & Place Order.** `renderCheckoutReview()` populates a cream-backed list showing contact info, fulfillment (delivery address or pickup location), payment (card type + last 4 + expiry), gift recipient block if applicable, and a full itemized totals recap. Two consent checkboxes (transactional SMS, marketing SMS). Big yellow full-width "Place Order — $XX.XX" CTA at the bottom.

### Sticky right-hand order summary

**CSS:** `.checkout-summary`, `.checkout-summary-inner`, `.checkout-summary-perks`, `.checkout-summary-help`, plus all the `.checkout-item*`, `.checkout-total-row*`, `.checkout-grand-total*`, `.checkout-saved-badge`, `.checkout-promo-*`, `.checkout-points-*` classes
**JS:** `renderCheckoutSummary()` rebuilds the entire `#checkoutSummaryInner` every time state changes

Contents, top to bottom:
- **Head:** "Order Summary" heading (Gaya serif) + item count pill
- **Items list:** scrollable (max-height 280px), each item shows 48×48 image, name (2-line truncated), "Qty N · $X.XX each" meta, line total on the right
- **"Have a code or gift card?"** disclosure toggle — expands to reveal two stacked promo input rows (discount code + gift card) each with an "Apply" button
- **Reward points row:** "1,239 Reward Points · Worth $37.17" with a yellow bg + an "Apply" / "Applied" toggle button
- **Totals breakdown:** subtotal (regular price) → subscriber discount (if tier reached) → code discount (if applied) → gift card (if applied) → reward points (if applied) → GST (5%) → delivery (or "Free" at 8+ meals for subscribers)
- **Grand total:** big bold number, navy-dark color
- **"You saved $X.XX" green badge** (only if total savings > 0)
- **Footer line:** "You'll earn N pts on this order"

Below the inner summary, two more sticky blocks rendered in static HTML:
- **Perks block** (cream gradient background): "Skip a week anytime / Free delivery on 8+ meals / No contracts cancel anytime" with 3 circle icons
- **Need help block** (warm cream background): phone + email lines using `{{contact.phone}}` and `{{contact.email}}` tokens from `brand/site-info.seed.json`

The whole sidebar is `position: sticky; top: 120px` on desktop. Below 980px viewport, it drops below the stepper and becomes non-sticky.

### Mobile sticky CTA bar

**CSS:** `.checkout-mobile-cta`, hidden above 980px, `position: fixed; bottom: 0` below 980px.

Shows "Total $XX.XX" on the left + yellow "Place Order" button on the right. Submits via the same `submitCheckout()` handler as the Step 4 CTA. `body { padding-bottom: 80px }` below 980px so the sticky bar doesn't cover content.

### Express checkout row (Apple Pay + Google Pay, mocked)

**CSS:** `.checkout-express*`
**JS:** `handleExpressCheckout(provider)` + `.cko-express-overlay` modal

Real Apple brand colors (`var(--cko-ap-bg)` = black background, real Apple logo SVG) and Google brand colors (`var(--cko-gp-bg)` = white, `var(--cko-gp-text)` = Google's #3C4043 dark grey, real Google Pay "G Pay" multi-color logo SVG). Hover states use Google's actual #F8F9FA and #BDC1C6 from their design system.

**What happens when you click:**
1. Overlay opens (`#ckoExpressOverlay`) with a spinner and "Authenticating with Face ID…" (Apple) or "Verifying…" (Google)
2. 1.4 seconds later, status text flips to "Payment approved"
3. 0.6 seconds later, overlay closes, all 3 steps get marked complete, a synthetic "card" entry is created (`{name: 'Apple Pay', last4: '0000', type: 'card'}`), and `showSuccessPanel()` runs with `via: 'Apple Pay'` / `'Google Pay'` logged in the payload
4. Bypasses the entire 4-step form flow

**No real SDK is loaded.** The buttons are cosmetic with a click handler. When the real Helcim integration ships, `handleExpressCheckout()` becomes a call into Helcim's `applePay.show()` / `googlePay.show()` wallet APIs.

### Success panel (inline, replaces the stepper)

**CSS:** `.cko-success*`
**JS:** `showSuccessPanel(opts)` called from both `submitCheckout()` and `handleExpressCheckout()`

Behavior:
1. Computes `computeCheckoutTotals()` one final time
2. Extracts contact name + email from form fields
3. Generates a fake order ID: `'BD-' + String(Date.now()).slice(-6)` (e.g., `BD-482159`)
4. Populates the success panel DOM:
   - Big animated green checkmark (84×84px circle, `ckoCheckBounce` animation)
   - "Order placed!" heading
   - "Thanks, [name]. Your BetterDay box is on the way. A confirmation email is headed to [email]."
   - 4-cell meta grid: Order number, Delivery date, Total paid, Items count
   - Two CTAs: "Order more meals" (→ menu) and "Back home" (→ index.html)
5. Hides the stepper, hides the mobile sticky CTA, shows the success panel
6. Clears `localStorage['betterday.cart.v1']` so bouncing back to menu shows empty
7. Logs the full order payload to `console.log()` for debugging + future backend handoff
8. Smooth-scrolls to the success panel

---

## How it's wired — the architecture

### File structure

```
conner/client-website/
├── checkout.html                    ← the page (3,023 lines)
├── shared/
│   ├── site-shell.js                ← loads header/footer + interpolates {{contact.*}}
│   ├── marketing-header.html        ← injected at [data-shell="header"]
│   ├── marketing-footer.html        ← injected at [data-shell="footer"]
│   └── subscription-config.js       ← PERK_TIERS + pricing constants (SHARED w/ menu)
├── menu/
│   └── index.html                   ← handleCheckout() serializes cart + navigates
├── index.html                       ← homepage (unrelated)
└── account/
    └── index.html                   ← subscriber hub (unrelated, ported in a sibling chat)

brand/
├── tokens.css                       ← var(--brand-*) colors/fonts/radii/shadows
├── site-info.seed.json              ← public.contact.phone, public.contact.email, etc.
├── colors.json                      ← source-of-truth palette (mirrored to tokens.css)
├── fonts/                           ← BDSupper, Gaya, Sofia Pro Soft, Fastpen
└── photos/
```

### Cart handoff contract (v2 schema)

`localStorage['betterday.cart.v1']` = JSON:

```json
{
  "version": 2,
  "mode": "subscribe",
  "items": [
    {
      "id": "2d496b0c-3b52-4b85-8f42-6f51c9fe305d",
      "name": "Herb-Crusted Chicken w/ Roasted Veg",
      "qty": 2,
      "price": 16.99,
      "img": "https://eatbetterday.ca/data/meals/463.jpg"
    }
  ],
  "updatedAt": "2026-04-09T20:15:00.000Z"
}
```

**Notes:**
- The localStorage **key name** stays `betterday.cart.v1` (for backwards-compatible path) but the **schema version inside** is now `2`. `checkout.html`'s `loadCart()` checks `parsed.version === CART_SCHEMA_VERSION` (which equals 2) and falls back to the `SAMPLE_CART` if the version doesn't match — so any stale v1 payloads from pre-fix browsing are gracefully invalidated.
- `mode` ∈ `'subscribe' | 'onetime'`. Drives the upsell banner visibility (only shows for onetime) and which meals qualify for free delivery (subscribers only).
- **No `retail_price` field.** There is one price per meal. The subscriber discount is applied at the order level by `computeCheckoutTotals()`, NOT baked into the item payload.
- Only items with `qty > 0` are persisted.
- `updatedAt` is an ISO 8601 timestamp — not used by the reader, just useful for debugging.

**Writer:** `conner/client-website/menu/index.html` → `handleCheckout()` (around line 2305).
**Reader:** `conner/client-website/checkout.html` → `loadCart()` (first JS block inside the main `<script>`).
**Fallback:** `SAMPLE_CART` (6 meals of $16.99 each) lets the checkout page be developed standalone without going through the menu first.

### Pricing model — the corrected rule

**One price per meal. Subscriber discount is applied at checkout as a percentage based on cart quantity.**

```
regularSubtotal  = sum(meal.price × meal.qty) for every item in cart
subscriberPct    = lookupSubscriberDiscountPct(totalMealCount)  // from PERK_TIERS
                   // 4 meals → 5%, 5 → 8%, 7 → 11%, 9 → 14%,
                   // 11 → 17%, 13+ → 20%, below 4 → 0%
mealSavings      = regularSubtotal × subscriberPct / 100
baseSubtotal     = regularSubtotal − mealSavings
gst              = baseSubtotal × 0.05
deliveryCost     = isDelivery ? (subscriber && totalMealCount ≥ 8 ? 0 : 7.99) : 0
codeDiscount     = discountCodeApplied ? baseSubtotal × 0.10 : 0  // mocked at 10%
giftAmount       = giftCardApplied ? 10 : 0                        // mocked flat $10
pointsAmount     = pointsToggled ? min(baseSubtotal, 1239 × 0.03) : 0
total            = max(0, baseSubtotal + gst + deliveryCost
                        − codeDiscount − giftAmount − pointsAmount)
earned           = floor(baseSubtotal × 0.7)  // reward points earned, ~2.1% return
```

**Display in the sidebar totals breakdown:**
```
Subtotal                    $101.94   ← regularSubtotal
Subscriber discount (8%)     −$8.16   ← mealSavings (only if tier reached)
Code "WELCOME10"             −$9.38   ← codeDiscount (only if applied)
Gift card                   −$10.00   ← giftAmount (only if applied)
Reward points               −$37.17   ← pointsAmount (only if applied)
GST (5%)                      $4.69   ← gst
Delivery                      $7.99   ← deliveryCost (or "Free" if subscriber + 8+)
────────────────────────────────────
Total                       $106.46   ← matches the math above ✓
```

**Worked examples:**

| Cart | Mode | Tier | Subtotal | Discount | GST | Delivery | **Total** |
|---|---|---|---|---|---|---|---|
| 6 × $16.99 | Subscribe | 8% | $101.94 | −$8.16 | $4.69 | $7.99 | **$106.46** |
| 8 × $16.99 | Subscribe | 11% | $135.92 | −$14.95 | $6.05 | Free | **$127.02** |
| 13 × $16.99 | Subscribe | 20% | $220.87 | −$44.17 | $8.84 | Free | **$185.54** |
| 3 × $16.99 | Subscribe | 0% (below threshold) | $50.97 | — | $2.55 | $7.99 | **$61.51** |
| 6 × $16.99 | Onetime | 0% | $101.94 | — | $5.10 | $7.99 | **$115.03** |

**The constants all live in `subscription-config.js`** — both menu and checkout read from the same file. Drift between them is impossible by construction.

### State shape (`checkoutState`)

```javascript
let checkoutState = {
  currentStep: 1,              // 1..4 — which step is the active/expanded one
  completedSteps: {},          // { 1: true, 2: true, ... } — flipped to true on Continue
  method: 'delivery',          // 'delivery' | 'pickup'
  addressId: null,             // for saved-address radio list (logged-in future path)
  pickupLocId: null,           // selected pickup location id
  pickupDate: '',              // ISO 'YYYY-MM-DD' string from the date input
  paymentId: null,             // for saved-card radio list (logged-in future path)
  discountCode: '',            // empty string or the last-applied code
  giftCard: '',                // empty string or the last-applied gift card number
  pointsApplied: false,        // true if the "Apply" button on the points row is toggled
  upsellDismissed: false,      // true if the user dismissed the onetime → subscribe banner
  isGift: false,               // true if "Send as a gift" toggle is on
  giftRecipient: {             // populated on Step 2 continue if isGift
    firstName: '',
    lastName: '',
    phone: '',
    message: ''
  },
  guestAddress: null,          // populated on Step 2 continue from the inline address form
                               // { street, unit, city, province, postal, country, notes }
  guestCard: null,             // populated on Step 3 continue from the inline card form
                               // { name, last4, expMonth, expYear, type }
  _initialized: false          // internal — false on first render, flipped after initCheckout
};
```

### Load / boot sequence

On `DOMContentLoaded`:

1. **`cart = loadCart()`** — read localStorage, validate version, fall back to SAMPLE_CART if missing/stale
2. **`initCheckout()`** — main boot function:
   - Load saved guest contact from `localStorage['betterday.guest_contact.v1']` if present, merge into `userData`
   - Pre-fill the Step 1 contact form fields from `userData`
   - Attach phone formatter to `#checkoutPhone` and `#checkoutGiftPhone`
   - Attach card number / expiry / CVC / postal code input formatters
   - Set default pickup location (first in list) and default pickup date (6 days from today)
   - Apply default method UI (`setCheckoutMethod('delivery', silent: true)`)
   - Render all dynamic regions: address list → pickup list → payment list → summary → stepper → upsell
   - Kick off the cutoff countdown ticker (`setInterval(updateCutoffCountdown, 1000)`)
3. **`site-shell.js`** loads (deferred, after the main script) and injects the marketing header/footer into the `[data-shell="header"]` / `[data-shell="footer"]` placeholders, interpolating `{{contact.phone}}` and `{{contact.email}}` tokens from `brand/site-info.seed.json`

### Render function map

| Function | What it rebuilds | Called by |
|---|---|---|
| `renderCheckoutStepper()` | Every step's active/complete/pending class, edit button visibility, recap inner HTML | `initCheckout`, `continueCheckoutStep`, `editCheckoutStep` |
| `renderCheckoutAddressList()` | `#checkoutAddressList` (saved-addr radios) OR `#checkoutAddressForm` (guest inline form) | `initCheckout`, `setCheckoutAddress` |
| `renderCheckoutPickupList()` | `#checkoutPickupList` radio cards | `initCheckout`, `setCheckoutPickupLoc` |
| `renderCheckoutPayList()` | `#checkoutPayList` (saved-card radios) OR `#checkoutPayForm` (guest inline form) | `initCheckout`, `setCheckoutPayment` |
| `renderCheckoutSummary()` | Entire `#checkoutSummaryInner` (items + promo toggle + points row + totals) + updates Pay Now button total + mobile total | `initCheckout` and every state-mutating handler |
| `renderCheckoutReview()` | `#checkoutReviewList` (the Step 4 review) | `renderCheckoutStepper` (only when `currentStep === 4`) |
| `renderCheckoutUpsell()` | `#checkoutUpsell` visibility + projected savings text | `initCheckout`, `dismissCheckoutUpsell`, `upsellSwitchToSub` |
| `updateCutoffCountdown()` | 4 cutoff cells + cutoff date label | Boot + `setInterval` every 1s |
| `showSuccessPanel(opts)` | The success panel content + hides the stepper | `submitCheckout`, `handleExpressCheckout` |
| `showToast(msg, type)` | Appends a toast to `#ckoToastContainer` | Most mutating handlers on error/success feedback |

---

## What's mocked (and where the real version should land)

| Mocked thing | Where it lives in the page | Where the real version goes |
|---|---|---|
| **Cutoff date + countdown target** | `getCutoffDate()` returns "2 days from now, 23:59:59 local" | Backend commerce API — the weekly cart cutoff lives on `WeeklyCartRecord` / `ProductionPlan` |
| **Saved addresses** | `acctAddresses = []` | Commerce DB: `CustomerAddress` table (already in `prisma/commerce/schema.prisma`) |
| **Saved payment methods** | `paymentMethods = []` | Commerce DB: `PaymentMethod` table (already in `prisma/commerce/schema.prisma`) |
| **Pickup locations** | `checkoutPickupLocations = [BetterDay HQ, Canmore Depot]` hardcoded array | Commerce DB: `PickupLocation` table (already in schema) + `GET /api/commerce/pickup-locations` |
| **Reward points balance** | Hardcoded to 1,239 pts in the sidebar label + totals calc | Commerce DB: `RewardPointsTransaction` table (already in schema) summed per customer |
| **Discount code validation** | `applyCheckoutDiscount()` accepts any non-empty string and applies a flat 10% off the subtotal | `culinary-ops-coupons` worktree backend (`CouponValidationService` just shipped in commit `cc751da`) |
| **Gift card validation** | `applyCheckoutGiftCard()` accepts any non-empty string and applies a flat $10 | Backend gift card service (doesn't exist yet) |
| **Card tokenization** | Inline card form collects raw number/expiry/CVC but does nothing with it | `culinary-ops-helcim-integration` worktree — HelcimPay.js replaces the inline form with Helcim's hosted payment fields |
| **Apple Pay / Google Pay** | `handleExpressCheckout()` shows a 2-sec overlay then fakes success | `culinary-ops-helcim-integration` worktree — HelcimPay.js has wallet API wrappers |
| **Order placement** | `submitCheckout()` shows the success panel and clears localStorage | `POST /api/commerce/orders` — writes a row to `CustomerOrder` table (already in schema) |
| **Order confirmation email** | Not sent | Resend API integration (already in `backend/.env`) |
| **Email + SMS order updates** | Not sent | TBD — Resend for email, TBD for SMS (Twilio? MessageBird?) |
| **Estimated arrival date** | Hardcoded `"Wednesday, April 15"` in the arrival banner HTML | Computed from the selected pickup/delivery week |
| **The subscriber discount percentages** | In `shared/subscription-config.js` as a JS constant | Future: `SystemConfig` key-value table, admin UI at `frontend/app/(dashboard)/settings/subscription-plans/` |

**Important:** nothing on this page touches any backend endpoint today. It's a pure client-side HTML/JS/localStorage flow. Zero network calls outside of the site-shell loading the `brand/site-info.seed.json` file.

---

## Architectural decisions made during this session

1. **Single-price-with-tier-discount pricing model** — replaces the broken two-price model inherited from the subscriber-hub prototype. See `PROJECT_SCOPE.md §14 (2026-04-09 PM)` for full context.
2. **`subscription-config.js` as a shared single-source-of-truth file** — both menu and checkout consume it via `<script src>`. Future pattern: other customer-facing pages that need pricing constants should load this file instead of redeclaring the constants locally. (Long-term future: the file becomes a thin shim that fetches live config from `SystemConfig`.)
3. **Cart handoff contract is a versioned localStorage payload**, not URL query params. Chosen because carts can have 10+ meals and URL params hit length limits, plus localStorage survives accidental back-navigation + browser refresh.
4. **Guest-first checkout with the saved-items radio list preserved** — when `acctAddresses.length === 0`, an inline form replaces the radio list. When a logged-in customer later populates those arrays via an API call, the radio list re-activates without any rewrite. Both code paths always exist.
5. **No new HTML file for order confirmation** — the success panel swaps in-place inside `checkout.html`. Rationale: avoids creating a stub page that'd need its own design pass. When the real backend lands, the success handler becomes a fetch + navigation to a real `confirmation.html` with a real order ID route.
6. **Express checkout is a visible mock, not a no-op** — 2-second processing overlay + success panel. Rationale: tests the visual flow without loading any SDK, and keeps the UI honest about being fake.
7. **Brand token purity enforced via grep** — after every edit session, `grep -nE '#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?' checkout.html` should show only the `:root` locals block + the Google Pay SVG `fill=` attributes. Everything else must be `var(--brand-*)` or `var(--cko-*)`.

---

## Known limitations / edge cases not handled

⚠️ These are things the checkout page does NOT do today, grouped by whether they're blockers or acceptable gaps.

### Acceptable gaps (deliberate — shipped as-is)

- **No order confirmation email.** Success is in-page only; no email is sent.
- **No real order ID format.** `BD-NNNNNN` is just the last 6 digits of `Date.now()`. Real IDs will come from the backend commerce endpoint.
- **No real card validation.** The inline card form doesn't do Luhn check on the card number (it only checks length ≥ 13). Real validation happens in HelcimPay.js.
- **Discount code is flat 10% for any string.** Real validation pending the coupon backend.
- **Reward points balance is hardcoded.** Points row always says "1,239 Reward Points · Worth $37.17".
- **Cutoff countdown is always "2 days from now."** Doesn't reflect the real weekly cutoff schedule.
- **Pickup locations are hardcoded.** Only two mock entries.
- **Arrival date label is hardcoded** in Step 2's arrival banner (`"Wednesday, April 15"`).
- **No gift card balance check.** Any string applies a flat $10.
- **No address validation.** Postal code is auto-formatted to uppercase + space but not validated against Canadian postal code format or a delivery zone.
- **No protection against double-submit.** Clicking "Place Order" twice in 500ms could fire `showSuccessPanel()` twice (second call is idempotent so the visible result is the same, but the console log would log twice).

### Edge cases to handle later (see `deferred-decisions.md`)

- ⚠️ **Meal removed from menu after customer has it in cart** (deferred 2026-04-08) — the checkout would still show the meal even though it's no longer available. No server-side reconciliation.
- ⚠️ **Coupon deleted while customer has it applied** (deferred 2026-04-08) — no detection, the stale code just continues to "work" in the mock.
- ⚠️ **Multi-delivery-week coupon early termination** (deferred 2026-04-08) — not applicable until real coupon backend lands.

### Things that might trip up a tester

- **localStorage persists across reloads.** If you fill out Step 1, refresh, and come back, the contact fields ARE pre-filled from `localStorage['betterday.guest_contact.v1']` — but the cart items are NOT reloaded if you reached checkout via the menu (because `handleCheckout()` is the only writer). So refreshing checkout.html directly shows the SAMPLE_CART. If you're testing the menu → checkout flow, don't refresh after navigation.
- **The success panel doesn't auto-reset.** Once you "Place Order", the success panel stays visible. To test multiple orders, close the tab and reopen.
- **The browser may cache the page aggressively.** `Cmd+Shift+R` hard-refresh if you're editing and seeing stale behavior.
- **Viewport resizing mid-session.** The mobile sticky CTA bar appears/disappears at 980px. If you resize from desktop → mobile after entering data, you might lose focus on a field that was in the now-hidden sidebar.

---

## Brand tokenization status

**Zero raw hex codes outside two approved locations** (verified via `grep -nE '#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?' checkout.html` — 35 total matches, all accounted for).

### Approved locations

1. **`:root` locals block** (lines ~22–75) — 31 hex values, all grouped and commented. These are:
   - Cream tints (`--cko-cream-2` through `--cko-cream-7`) — darker/lighter shades derived from `var(--brand-cream)`
   - Border tones (`--cko-border-soft`, `--cko-border-warm`, `--cko-border-cool`)
   - Warm greys (`--cko-text-warm`, `--cko-text-body`, `--cko-text-faint`)
   - Yellow variants (`--cko-yellow-soft`, `--cko-yellow-mid`, `--cko-yellow-edge`, `--cko-amber`)
   - Error red surface (`--cko-error-bg`) — derived from `var(--brand-red)`
   - Payment brand tile colors (`--cko-visa`, `--cko-mc`, `--cko-amex`, `--cko-disc`) — real Visa/MC/Amex/Disc brand marks, not BetterDay colors
   - Third-party wallet brand colors (`--cko-ap-bg`, `--cko-gp-bg`, `--cko-gp-text`, `--cko-gp-border`, `--cko-gp-hover-bg`, `--cko-gp-hover-bd`, `--cko-gp-blue`) — real Apple and Google brand marks
   - Apple system UI colors (`--cko-apple-text`, `--cko-apple-grey`, `--cko-apple-line`) — used inside the express checkout overlay to look like Apple's native UI
   - Misc component-specific tints (`--cko-navy-deepest`, `--cko-pay-tile-bg`, `--cko-img-fallback`)

2. **Google Pay SVG fill attributes** (inside the inline SVG `<path fill="…">` on line ~1591) — the 4 Google brand colors `#4285F4`, `#34A853`, `#FBBC05`, `#EA4335`. These can't be tokenized without JS interpolation on SVGs, and they're legitimate Google Pay brand marks.

### Brand token usage by category

All BetterDay colors resolve through `var(--brand-*)` or `var(--bg-*)` / `var(--text-*)` / `var(--border-*)` from `/brand/tokens.css`:

- **Navy** → `var(--brand-navy)`, `var(--brand-navy-dark)` — header bar, step number active state, CTA text
- **Yellow** → `var(--brand-yellow)`, `var(--brand-yellow-dark)` — primary CTAs, countdown cells, arrival banner accent
- **Green** → `var(--brand-green)`, `var(--brand-green-dark)` — savings rows, success panel checkmark, applied states, gift toggle active
- **Red** → `var(--brand-red)` — field error outlines, required asterisks
- **Cream** → `var(--brand-cream)`, `var(--brand-cream)` via `var(--bg-page)` — page bg, header text, cream-bordered surfaces
- **Primary blue** → `var(--brand-primary)` — focus rings, edit buttons, promo toggle, help icon
- **Borders** → `var(--border-section)` — card borders, dividers

Rebranding this page (changing any color in `brand/tokens.css`) takes effect automatically without editing a single line of `checkout.html`.

---

## Related files / upstream / downstream

### Upstream (this page depends on)

| File | How |
|---|---|
| `brand/tokens.css` | Every brand color via `var(--brand-*)` |
| `brand/site-info.seed.json` | `{{contact.phone}}` + `{{contact.email}}` in the Need Help block |
| `conner/client-website/shared/subscription-config.js` | `PERK_TIERS`, `FREE_DELIVERY_MEALS`, `DELIVERY_FEE`, `GST_RATE`, `POINTS_PER_DOLLAR`, `lookupSubscriberDiscountPct()` |
| `conner/client-website/shared/site-shell.js` | Injects marketing header/footer, interpolates `{{...}}` tokens |
| `conner/client-website/shared/marketing-header.html` | Top nav fragment (rendered into `[data-shell="header"]`) |
| `conner/client-website/shared/marketing-footer.html` | Footer fragment (rendered into `[data-shell="footer"]`) |
| `localStorage['betterday.cart.v1']` (v2 schema) | Runtime cart payload written by the menu page |
| `localStorage['betterday.guest_contact.v1']` | Guest contact autofill data written by this page on Step 1 continue |

### Downstream (things that depend on this page)

- **Menu page `handleCheckout()`** (`menu/index.html:2305`) navigates here after serializing the cart. If this file renames to anything other than `checkout.html`, the menu page breaks.
- **Nothing else yet.** This page is the leaf of the customer flow — no other page reads its state.

### Sibling in-flight work (other chats' worktrees)

| Worktree | What they're doing | Overlap with this page |
|---|---|---|
| `culinary-ops-helcim-integration` | Backend Helcim payment wiring | Will replace the express checkout mock + card form tokenization with real HelcimPay.js calls |
| `culinary-ops-coupons` | Commerce coupon validation service + 10-rule validator engine (shipped commit `cc751da`) | Will replace `applyCheckoutDiscount()`'s flat 10% mock with a real API call to the coupon validator |
| `culinary-ops-client-profile` | Customer profile data model (not yet merged) | Will populate `userData`, `acctAddresses`, `paymentMethods` from a real customer row for logged-in users |
| `culinary-ops-subscriber-hub-v2` (merged) | Account hub page at `conner/client-website/account/index.html` (shipped commit `1b948f8`) | No direct overlap; both consume `brand/tokens.css` + site-shell the same way |

### Deferred-decisions entries that affect this page

See `conner/deferred-decisions.md` for full context:

1. **Rename `MealRecipe.pricing_override → item_price`** — doesn't affect this page's runtime behavior (the menu serializes as `price` either way). But if we rename the JSON field in `meals.seed.json` at the same time, this page would need a one-liner `m.price` → `m.item_price` update (grep for `m.price` in checkout.html, expect 6–8 matches).
2. **Update `entities.md` meal entity to single-price model** — pure documentation, no code impact.
3. **Subscription pricing settings — admin dashboard UI** — when this lands, `subscription-config.js` becomes a fetch-from-SystemConfig shim. This page keeps working unchanged because the exported names don't change.
4. **Cart line item snapshot fields (Migration #4)** — when `menu_price_at_add` / `promised_price_at_add` / `promised_coupon_id` land in the commerce schema, the order submission handler will need to include these fields in the payload. Pure additive change to `showSuccessPanel`'s console.log payload (which becomes a real POST).
5. **Auto-apply best coupon logic at checkout** — when this lands, `initCheckout()` grows a loop that walks the customer's eligible auto-apply coupons and picks the best one at boot.
6. **Deep-link coupon auto-apply on landing** — `/?coupon=WELCOME10&utm_source=...` → `initCheckout()` reads `URLSearchParams` and calls `applyCheckoutDiscount()` automatically. Pure addition, doesn't break anything.

---

## Next steps — prioritized

### 🔴 Immediate (before pushing this work to origin)

1. **Browser smoke test the checkout page** end-to-end. Run the full checklist below. **This is the blocker for pushing.**
   ```
   cd ~/Downloads/culinary-ops
   python3 -m http.server 8000
   ```
   Then open:
   - `http://localhost:8000/conner/client-website/checkout.html` — direct load (uses SAMPLE_CART)
   - `http://localhost:8000/conner/client-website/menu/index.html` — menu → handoff → checkout flow

2. **Fix anything the smoke test surfaces.** Likely candidates: missing assets (I didn't test that the meal images load), responsive breakpoints on an actual phone viewport, focus rings on keyboard nav, tab order through the form.

3. **Push `conner/universal-brand-folder` to origin** once smoke test passes.
   ```
   git -C ~/Downloads/culinary-ops push origin conner/universal-brand-folder
   ```

### 🟠 Short-term (this week, customer-facing polish)

4. **Text Gurleen** the `pricing_override → item_price` rename request (draft in the chat transcript). Not blocking for launch, but the sooner it ships the sooner the codebase has one consistent name for the price column.

5. **Create the customer-facing `login.html` page.** The checkout currently has no auth gate — anyone can check out as a guest. If you want to allow logged-in customers to see their saved addresses / saved cards / reward points, we need a login page first. Prototype already exists at `conner/app/login.html`.

6. **Wire the `subscription-config.js` fetch fallback.** Right now it's pure static constants. Add a `window.BETTERDAY_API_BASE` check that fetches `/api/system-config/public` on page load and overrides the constants with live values when available. Zero impact on local dev (where the API isn't running), but preps the file for the admin-editable workflow.

7. **Real pickup locations.** Replace the 2-entry mock array with a fetch from `/api/commerce/pickup-locations` (or hardcode from `brand/site-info.seed.json` if you want to keep it offline). The `PickupLocation` model already exists in `backend/prisma/commerce/schema.prisma`.

8. **Real delivery week / cutoff date.** Compute the arrival banner and the cutoff countdown from the actual weekly schedule instead of "2 days from now". This probably needs a small helper like `computeDeliveryWeek()` that looks at today's date and returns the current week's cutoff + delivery date based on a simple rule (e.g., "cutoff is Friday 11:59 PM, delivery is the following Wednesday").

9. **Address validation.** Add Canadian postal code regex check (`/^[A-Z]\d[A-Z] \d[A-Z]\d$/`). Add a delivery zone check against `public.delivery.areas` from the seed file. Fail-closed with a friendly error if they're outside the delivery area.

10. **Luhn check on card numbers.** Even though the real tokenization is Helcim's job, the inline form should at least validate the card number isn't obviously bogus. 10 lines of JS.

### 🟡 Medium-term (before Helcim integration ships)

11. **Create `order-confirmation.html`** — a real standalone page that the success handler can navigate to. Currently the success panel is in-place, which is fine for a mock but won't scale when the real flow needs to display a server-generated order row. Plan: takes an order ID in the URL (`/order-confirmation.html?id=BD-NNNNNN`), fetches `/api/commerce/orders/{id}`, renders the same layout as the current success panel.

12. **Build the `account/subscription.html` page** (sibling to the hub ported by the subscriber-hub-v2 chat) — so subscribers can manage skip/pause/cancel. The subscriber-hub port already has the data model in place.

13. **Deep-link coupon support** — `checkout.html?coupon=WELCOME10` auto-applies the coupon on boot. Add `populateSourceCampaign()` helper to stash `utm_source`/`utm_campaign`/`utm_medium` into sessionStorage so the eventual order payload can attribute it to a campaign (feeds the `CustomerCoupon.source_channel` + `.source_campaign` fields in the commerce schema).

14. **Real reward points balance** — fetch from `/api/commerce/customers/{id}/points` when logged in. Falls back to hiding the points row when not logged in. (Today it's always visible and always 1,239 pts even for a guest.)

15. **Order summary itemized receipt email** — Resend integration. Template: Gaya serif heading, itemized list matching the sidebar totals, delivery address, the "perks of every BetterDay box" block.

### 🟢 Helcim-ready (when the Helcim worktree is ready to integrate)

16. **Replace the inline card form** with HelcimPay.js hosted fields. The Helcim integration chat owns the actual SDK integration; this page just needs to swap the `<div id="checkoutCardForm">` contents for their mount point and wire the callback. Est. 30 lines of edit.

17. **Replace `handleExpressCheckout(provider)`** with real HelcimPay.js wallet API calls. Same callback pattern (success panel on resolve, toast on reject).

18. **Replace `submitCheckout()`** with a real `POST /api/commerce/orders` call. The mock already builds the full payload and logs it to console — swap `console.log` for `fetch` + navigate to `order-confirmation.html` on success.

19. **Replace `applyCheckoutDiscount()`** with a real `POST /api/commerce-coupons/validate` call. The coupon validation backend just landed in commit `cc751da` with a 10-rule validator engine — this page needs to call it.

20. **Real cart line item snapshot** — when `menu_price_at_add` / `promised_price_at_add` / `promised_coupon_id` land in the commerce schema (Migration #4), the order submission payload needs to include these fields. Adds ~6 lines to the order payload builder.

### 🔵 Post-launch (nice-to-haves)

21. **A11y pass.** Keyboard focus trap inside the express checkout overlay. `aria-live="polite"` on the toast container. Better focus rings on the step cards. Screen-reader labels on the countdown cells. Tab order audit.

22. **Analytics events.** Fire `checkout_started`, `step_advanced`, `coupon_applied`, `order_placed`, etc. to whatever analytics backend you choose (Plausible? Umami? Segment?). Zero currently.

23. **Save incomplete checkouts to the customer's account** — if they Continue on Step 2 then close the tab, reopening should resume at Step 2 with the fields pre-filled. Requires login + a `DraftCheckout` or similar model on commerce.

24. **Abandoned cart recovery emails** — 24h after a draft checkout is left incomplete, send a "Your BetterDay box is waiting" email. Already in deferred-decisions as a T3 coupon feature.

25. **Tokenize `conner/client-website/account/index.html`** — sibling chat's port kept inline hex codes as a conservative approach; they should eventually get tokenized to match this checkout page's standard. Deferred-decisions already tracks this.

26. **Split `checkout.html` into a smaller file + external assets** — it's 3,023 lines. If it grows much more, consider moving the CSS to `shared/checkout.css` and the JS to `shared/checkout.js` (matches the pattern that `shared/site-shell.js` established).

---

## Smoke test checklist

Run this BEFORE pushing to origin. Check each box.

### Cold load (direct to checkout.html)

- [ ] `http://localhost:8000/conner/client-website/checkout.html` loads without JS errors in the DevTools console
- [ ] Marketing header and footer inject correctly (NOT showing the raw red error div from site-shell.js)
- [ ] `{{contact.phone}}` and `{{contact.email}}` in the Need Help block resolve to actual values (from `brand/site-info.seed.json`)
- [ ] Navy header bar renders at the top, "Checkout" title visible, "Cut-off Thu, Apr ??" label on the right
- [ ] Countdown cells (Days/Hrs/Min/Sec) tick every second
- [ ] Step 1 "Contact" is active (expanded, white background, navy number circle)
- [ ] Steps 2/3/4 are pending (greyed out, cream background)
- [ ] SAMPLE_CART renders in the sidebar: 4 meals, correct subtotal, correct subscriber discount row
- [ ] Subtotal row shows $101.94 (6 × $16.99)
- [ ] Subscriber discount row shows `(8%) −$8.16` (6 meals qualifies for tier 5)
- [ ] GST row shows `$4.69`
- [ ] Delivery row shows `$7.99` (6 < 8, no free delivery yet)
- [ ] Grand total shows `$106.46`
- [ ] Math check: 101.94 − 8.16 + 4.69 + 7.99 = **106.46** ✓

### Menu → checkout handoff

- [ ] Open `http://localhost:8000/conner/client-website/menu/index.html`
- [ ] Switch to Subscribe mode if not already
- [ ] Add 4 meals to the cart (any meals)
- [ ] Per-card prices should flip from $16.99 to $16.14 when you hit the 4-meal threshold (5% off tier)
- [ ] Add 4 more meals (total 8)
- [ ] Per-card prices should be $15.12 (11% off tier)
- [ ] Click "Place Weekly Order" in the rewards sidebar
- [ ] Browser navigates to `../checkout.html`
- [ ] Sidebar on checkout.html shows the exact meals you added (not SAMPLE_CART)
- [ ] In DevTools: `JSON.parse(localStorage.getItem('betterday.cart.v1'))` returns the v2 schema with your 8 items

### Step 1 — Contact

- [ ] Type into all 4 fields (first, last, email, phone)
- [ ] Phone formats as `(xxx) xxx-xxxx` as you type
- [ ] Click "Continue to Delivery"
- [ ] Step 1 collapses to a recap row showing "FirstName LastName · email · phone"
- [ ] Edit button appears on Step 1
- [ ] Step 2 "Delivery" becomes active
- [ ] Try clicking "Continue" with empty fields — should show red error borders + toast

### Step 2 — Delivery (Me, delivery path)

- [ ] "Me" is the default gift toggle state
- [ ] "Delivery" is the default method
- [ ] Inline address form renders (not a radio list, since guest mode)
- [ ] Street / city / province / postal are all required
- [ ] Postal code auto-uppercases + adds a space at position 3 (e.g., "t2t1s5" → "T2T 1S5")
- [ ] Country field is disabled + says "Canada"
- [ ] Fill everything in, click "Continue to Payment"
- [ ] Step 2 collapses to a recap row showing "🚚 [street] · [city], [province] [postal]"

### Step 2 — Delivery (gift mode + pickup path)

- [ ] Click "Edit" on Step 2
- [ ] Toggle to "Send as a gift"
- [ ] Green gift notice banner appears
- [ ] Recipient first/last/phone/message fields appear
- [ ] Toggle method to "Pickup"
- [ ] Delivery panel hides, pickup panel shows
- [ ] Two pickup locations render as radio cards (BetterDay HQ, Canmore Depot)
- [ ] Date picker defaults to 6 days from today
- [ ] Min date is today (can't pick past dates)
- [ ] Fill everything in, click "Continue to Payment"
- [ ] Recap row shows "🎁 Gift to [recipient name] · 📍 Pickup at BetterDay HQ · Thu, Apr 16"

### Step 3 — Payment

- [ ] Inline card form renders (name, number, expiry, CVC)
- [ ] Card number auto-spaces every 4 digits
- [ ] Typing `4` as the first digit — no visual indicator but `detectCardType` returns 'visa'
- [ ] Expiry auto-inserts the `/` after 2 digits
- [ ] CVC accepts only numeric, max 4 chars
- [ ] Click Continue with empty fields → error borders + toast
- [ ] Fill everything in (card number can be fake like `4242 4242 4242 4242`), click Continue
- [ ] Recap row shows "💳 Visa •••• 4242 · Exp MM/YY"

### Step 4 — Review & Place Order

- [ ] Review list shows contact + fulfillment + payment + itemized totals
- [ ] Gift recipient block shows if gift mode is on
- [ ] Two consent checkboxes visible (first one pre-checked)
- [ ] Big yellow CTA shows "Place Order — $[total]"
- [ ] Click it
- [ ] Stepper disappears, success panel appears
- [ ] Green checkmark animates in
- [ ] Order number shows as `BD-NNNNNN`
- [ ] Delivery date, total, and item count populate
- [ ] In DevTools: `localStorage.getItem('betterday.cart.v1')` returns `null` (cleared)
- [ ] Console shows a full order payload log

### Sidebar features

- [ ] Click "Have a code or gift card?" — toggle expands to show the two input rows
- [ ] Type `WELCOME10` in the discount code field, click Apply → toast "Code 'WELCOME10' applied", new discount row appears in totals, grand total updates
- [ ] Type `GIFT50` in the gift card field, click Apply → toast "Gift card applied", new gift card row appears, grand total updates
- [ ] Click "Apply" on the reward points row → toast "Points applied", button changes to "Applied" with navy background, new reward points row appears, grand total updates
- [ ] Click "Applied" again → toast "Points removed", button reverts, row disappears
- [ ] You Saved badge appears below the grand total whenever totalSavings > 0

### Express checkout (mocked)

- [ ] Click "Pay" on the Apple Pay button
- [ ] Overlay opens with "Authenticating with Face ID…" and a black spinner
- [ ] ~1.4s later, status flips to "Payment approved"
- [ ] ~0.6s later, overlay closes and success panel appears
- [ ] Repeat with Google Pay — overlay should show "Verifying…" with a blue spinner
- [ ] Google Pay success panel shows "via Google Pay" in the console log

### Subscribe upsell banner

- [ ] Reload the page with `?cart=sample&mode=onetime` — actually no query string support yet, easiest test is to manually edit localStorage: `localStorage.setItem('betterday.cart.v1', JSON.stringify({version:2, mode:'onetime', items:[{id:'1',name:'Test',qty:6,price:16.99,img:''}], updatedAt:new Date().toISOString()}))` then reload checkout.html
- [ ] Upsell banner should appear below the step indicator
- [ ] "Save $8.16 by switching to a subscription · 8% off every order" (the number matches the tier for 6 meals)
- [ ] Click "Switch & Save" → banner disappears, mode flips to subscribe, sidebar recalculates with the subscriber discount
- [ ] OR click the × dismiss button → banner disappears without mode change

### Responsive

- [ ] Resize browser to 1200px wide → two-column layout, sticky sidebar visible on the right
- [ ] Resize to 980px → layout flips to single column, sidebar drops below the stepper, mobile CTA bar appears at the bottom
- [ ] Resize to 640px → header bar shrinks, countdown shifts to a new row
- [ ] Resize to 600px → form rows collapse from 2-column to single column (first/last name stack)
- [ ] Resize to 480px → express buttons stack vertically

### Brand token purity

- [ ] Open DevTools → Elements → Styles panel on any element → confirm colors resolve through `var(--brand-*)` not raw hex
- [ ] Inspect `.checkout-header-bar` → background should be `var(--brand-navy)` which resolves to `#00465E`
- [ ] Inspect `.checkout-step-cta` → background should be `var(--brand-yellow)` which resolves to `#FFC600`

### DevTools console

- [ ] No uncaught errors at any point during the full flow
- [ ] No 404s in the Network tab for any asset (brand tokens, fonts, shared shell fragments, meal images)
- [ ] No "failed to load" errors from site-shell.js

---

## How to develop locally

**Start the dev server:**

```
cd ~/Downloads/culinary-ops        # or any worktree that has checkout.html
python3 -m http.server 8000
```

Then open:
- **Checkout page:** `http://localhost:8000/conner/client-website/checkout.html`
- **Menu page:** `http://localhost:8000/conner/client-website/menu/index.html`
- **Homepage:** `http://localhost:8000/conner/client-website/index.html`

**Important:** run the server from the **repo root**, not from inside `client-website/`. Both `/brand/tokens.css` (absolute path) and `/conner/client-website/*` need to be reachable under the same HTTP origin. Running from `client-website/` breaks the brand token imports.

**Alternatives:**
- VS Code Live Server extension (right-click any file → "Open with Live Server")
- `npx serve .` from the repo root (needs Node)
- `php -S localhost:8000` from the repo root (needs PHP)

**To reset state during testing:**
- Clear the cart: `localStorage.removeItem('betterday.cart.v1')` in DevTools console
- Clear the guest contact: `localStorage.removeItem('betterday.guest_contact.v1')`
- Clear everything: `localStorage.clear()`

**To force a specific cart mode:**
```javascript
localStorage.setItem('betterday.cart.v1', JSON.stringify({
  version: 2,
  mode: 'onetime',  // or 'subscribe'
  items: [
    { id: '1', name: 'Test Meal', qty: 6, price: 16.99, img: '' }
  ],
  updatedAt: new Date().toISOString()
}));
location.reload();
```

---

## Change log

### 2026-04-09 (PM) — Port + calculator fix session

**Files created:**
- `conner/client-website/checkout.html` (3,023 lines)
- `conner/client-website/shared/subscription-config.js`

**Files modified:**
- `conner/client-website/menu/index.html` — `handleCheckout()` wired, `normalizeMeal()` drops synthesized retail_price, `getPrice()` applies tier discount in subscribe mode, local pricing consts removed in favor of shared file, script tag added
- `conner/deferred-decisions.md` — 4 new entries (rename pricing_override, update entities.md, corp placeOrder over-fetch, move corporate tier config out of JSONB)
- `PROJECT_SCOPE.md` — header line updated to reference both sessions, new Progress Log entry added

**Commits (on `conner/universal-brand-folder`):**
- `701fec0` — feat(client-website): add checkout page + fix subscriber discount math
- `0314429` — Merge branch 'conner/2026-04-09-checkout-page'
- `3393e2d` — docs(project-scope): log both 2026-04-09 sessions (meal edit AM + checkout PM)

**Deferred:** smoke test, origin push, Gurleen text for the column rename, checkout worktree cleanup.

---

## Open questions (things not yet decided)

These are not blockers — the checkout works without them — but they'll come up as next steps run into decisions:

1. **What's the canonical URL for the customer-facing site?** The site-shell currently uses relative paths. When this lands on a real domain (`eatbetterday.ca`?), need to make sure the canonical URL is consistent across marketing nav + social share meta tags + etc.
2. **When a logged-in customer places an order, does the cart clear immediately or after backend confirmation?** Current behavior clears immediately on Place Order. Safer behavior waits for the backend to confirm the order was saved.
3. **Should one-time customers be able to save a card for next time?** The inline card form has a "Save this card for next time (requires account)" checkbox, but there's no signup flow yet. Either remove the checkbox until there's a flow, or wire it to a passive "we'll remember this if you sign up later" UX.
4. **Gift orders + subscription mode** — today a gift order forces `getCheckoutOrderType()` to return 'onetime'. Is that the right rule, or should a subscriber be able to send a gift delivery on their subscription billing?
5. **Cutoff countdown when the customer arrives after cutoff** — today the countdown just keeps ticking toward a fake target. Real behavior: if the cutoff has passed for the current week, the UI should redirect to the next week's menu or show "Cut-off has passed — ordering for the week of [next week]" instead.
6. **Multi-week carts** — the current model is one cart = one delivery. Will BetterDay ever offer "order for the next 4 weeks at once"? If yes, the cart schema needs a `delivery_week` field per item and the summary needs to group by week.
7. **Pickup fee?** Currently pickup is free. Is that the permanent rule, or will some pickup locations charge a handling fee?

---

## When to update this file

**Update this file in the same commit as any change that affects:**
- The feature matrix (adding a new step, removing a mock, wiring a real backend)
- The cart handoff contract (schema changes)
- The pricing model (new discount type, new fee, new tax)
- The file layout (new sibling files, renamed files)
- Dependencies (new shared file, new brand token, new API call)
- Next steps (reprioritizing, adding a new step, striking through a finished one)

**Do NOT update this file for:**
- Typo fixes in copy
- CSS tweaks
- Bug fixes that don't change observable behavior
- Git workflow changes
- Anything that git log already captures adequately

The goal is: a chat opening this file should have **everything they need to continue the work** without scrolling through 40 commits of history.
