# Flow: Menu Overlay

The full-screen meal browser and cart editor. Used both as a standalone
page and as a modal inside the subscriber hub's "Edit Cart" action.

**Implemented in:** `app/menu-overlay.html`

---

## When it opens

1. **From the subscriber hub:** user clicks "Edit Cart" on the My
   Subscription tab. The hub opens the overlay as a full-screen modal,
   passing in the current `weekly_cart_record.cart_items`.
2. **Standalone:** the user navigates directly to the menu (from the
   marketing site, a link, etc.) to browse without an account.

---

## Entities involved

- `meal` (the catalog being browsed)
- `weekly_cart_record` (read + write when in subscription mode)
- `checkoutState` (when the user clicks Checkout from here)

---

## Modes

The overlay has two modes controlled by a toggle in the top-right:

### Subscribe mode (default for logged-in subscribers)
- Shows subscriber prices
- Applies tier discounts as the cart grows
- Checkout button goes to the weekly cart update (not a separate order)
- Savings tier progress bar visible

### One-time mode (for guests or logged-in users ordering a separate box)
- Shows retail prices
- No tier discounts
- Checkout button goes to a dedicated one-time checkout flow
- No carryover — this is a one-shot cart

The toggle lives in `eoMode` state and affects price display + checkout
button behavior throughout.

---

## Main UI areas

```
┌─────────────────────────────────────────────────────┐
│  Header: brand logo + mode toggle + cutoff pill     │
├────────────────────┬────────────────────────────────┤
│                    │  Category tabs                 │
│  Cart sidebar      │  Sort & Filter dropdown        │
│  (sticky, right)   ├────────────────────────────────┤
│                    │                                │
│                    │  Meal grid (4-wide on desktop) │
│  - Rewards box     │  - Real meal photos            │
│  - Category lists  │  - Qty controls                │
│  - Checkout button │  - Swap button                 │
│                    │                                │
└────────────────────┴────────────────────────────────┘
```

### Meal cards
- Blue bg = meat, green bg = vegan (category indicator)
- Real meal photo from `app/photos/`
- Name (BDSupper font)
- Tag pills (High Protein, Vegan, Gluten-Free, etc.)
- Qty +/- controls (or Add button if not in cart)
- "Swap" button that opens the swap panel
- "+info" pill → opens meal detail modal

### Category tabs
- All, Entrees, Sandwich & Wraps, Breakfasts, Snacks & Other

### Sort & Filter
- Sort: Popular / Price Low→High / Price High→Low / Calories
- Filter: Protein tier, diet tags, allergens to exclude

### Cart sidebar (right)
- Rewards box at top (points balance + savings tier)
- Current cart items grouped by category with Gaya headers
- "| N Total" suffix per category
- Each item: 46px square thumb, name, qty, price
- Stacked actions: qty controls on top, swap button below
- Trash icon (navy, red on hover) replaces minus when qty=1
- Multi-qty price: "$16.99 × 2 $33.98"
- Savings tier strip at top
- Confirm button at bottom ("Checkout" or "Save Cart Changes")
- Allergen + menu changes notice pills (single-line, clickable)

---

## Interactions

### Add a meal
- Click `+` on a meal card or Add button
- Meal's `qty` increments in `allMeals` state
- Card switches to "in-cart" visual state (purple bg in subscriber hub style)
- Sidebar updates with new item / new qty
- Savings tier recalculates

### Remove a meal
- Click `-` on cart sidebar (or on the card)
- Qty decrements
- If qty reaches 1, the `-` becomes a trash icon
- If qty reaches 0, removed from cart

### Swap a meal
- Click Swap button on a cart item
- Opens the Swap Panel (centered overlay modal)
- Shows 3-wide grid of same-category alternatives
- Two modes: Replace All (swap every instance) / Mix & Match (one at a time)
- Mix mode auto-closes when all slots are filled

### Open meal detail
- Click "+info" pill or the meal name
- Opens Meal Detail modal (side-by-side: 55% photo, 45% info)
- Shows: tag pills, allergen pills, macro cell strip, description,
  ingredients, heating instructions
- Has qty controls if in cart, or Add/Swap buttons if not

---

## Data movements

### On open (from subscriber hub)
- Hub passes current `weekly_cart_record.cart_items` into the overlay
- Overlay populates `allMeals` with qty from the cart

### On close (save)
- Overlay writes back `allMeals.filter(m => m.qty > 0)` to the hub
- Hub calls `PATCH /api/weekly-cart-records/:id` with new `cart_items`

### On close (cancel)
- Nothing written; hub keeps its original state

### On Checkout click (subscription mode)
- Saves cart changes
- Navigates to the checkout tab (or returns to hub and opens checkout tab)

### On Checkout click (one-time mode)
- Creates a fresh `checkoutState`
- Navigates to the checkout flow with `window.checkoutOrderType = 'onetime'`
  so the Subscribe & Save upsell banner triggers

---

## Notes

- The menu-overlay is the primary place where the customer interacts with
  the catalog. The subscriber hub's "Cart Summary" on My Subscription is
  just a read-only preview — edits happen here.
- Meal photos are stored in `app/photos/` and referenced by relative path.
- Category ordering, tier thresholds, and free delivery meal count are
  all driven by the constants at the top of the script block (see
  `PERK_TIERS`, `FREE_DELIVERY_MEALS`, `CATEGORY_ORDER`).
- The overlay shares styling with the subscriber hub (same fonts, same
  color palette, same card radius language).

---

## Related flows

- `flows/subscriber-hub.md` — the hub that opens the overlay
- `flows/checkout.md` — where the checkout button leads
