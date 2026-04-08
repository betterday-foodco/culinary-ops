# Flow: Checkout

The 4-step accordion checkout inside the subscriber hub.

**Implemented in:** `app/subscriber-hub-2.0.html` → `#panel-checkout`

---

## High-level structure

```
┌─────────────────────────────────────────────────────┐
│ [ Apple Pay Express ] [ Google Pay Express ]        │  ← express row
│      Or pay with card below                         │
├─────────────────────────────────────────────────────┤
│ ┌───── Navy Header ─────────────────────────────┐  │
│ │ Checkout       ⏰ Cut-off + countdown         │  │
│ └────────────────────────────────────────────────┘  │
│   Step X of 4                                        │
│                                                      │
│   ●──── [Step 1] Contact                             │
│   │                                                  │
│   ●──── [Step 2] Delivery                            │
│   │                                                  │
│   ◯──── [Step 3] Payment                             │
│   │                                                  │
│   ◯──── [Step 4] Review & Place Order                │
│                                                      │
│   [Summary sidebar: items, totals, perks, help]     │
└─────────────────────────────────────────────────────┘
```

---

## Entities involved

- `customer` (logged in, OR guest = silent-created from Apple Pay)
- `address` (shipping — customer's saved OR gift recipient's)
- `payment_method` (saved card OR Apple Pay token)
- `order` (the output — one row per checkout)

---

## Client-side state

Lives in `checkoutState` object:

```js
checkoutState = {
  currentStep: 1..4,
  completedSteps: {1: bool, 2: bool, 3: bool, 4: bool},

  // Step 1 — contact profile sync
  profileSyncChoice: 'update' | 'local',   // whether to persist edits to profile
  _originalContact: {firstName, lastName, email, phone},  // snapshot for edit detection

  // Step 2 — fulfillment
  method: 'delivery' | 'pickup',
  addressId: uuid,
  pickupLocId: int,
  pickupDate: ISO date,

  // Step 2 — gift mode
  isGift: bool,
  giftRecipient: {firstName, lastName, phone, message},

  // Step 3 — payment
  paymentId: uuid,

  // Sidebar
  discountCode: string,
  giftCard: string,
  pointsApplied: bool,
  upsellDismissed: bool,
  _initialized: bool,
}
```

---

## The 4 steps (detail)

### Step 1 — Contact

**Fields:** first name, last name, email, phone, "keep me updated" checkbox

**Behavior:**
- Pre-filled from `userData` on load (for logged-in users)
- Any edit triggers `onCheckoutContactEdit()` which compares to the
  snapshot and reveals the **Profile Sync banner**
- Profile sync offers two radios:
  - **Update my profile** (default) — on Continue, calls
    `updateUserContactFromCheckout()` which updates `userData`, the
    Customer Info tab displays, and the profile header name + avatar
  - **Use for this order only** — edits stay session-local, not persisted
- Smart auto-complete: if contact is fully filled on first load, Step 1
  is marked complete automatically and the accordion opens at Step 2

**Validation on Continue:**
- All 4 fields required
- Email matches regex
- Phone has at least 10 digits

---

### Step 2 — Delivery

**Top of the body:** Gift toggle (`Me` vs `Send as a gift`)

**Gift mode ON:**
- Reveals recipient name + recipient phone + optional gift message fields
- Shows the gift notice banner: "Gift orders are one-time only. Your
  regular subscription isn't affected. Order confirmation goes to you —
  delivery updates go to your recipient."
- The address picker label changes to "Recipient's delivery address"
- `getCheckoutOrderType()` returns `'onetime'` regardless of subscription mode
- Computing totals uses one-time pricing (no subscriber discount, no
  free delivery threshold)

**Gift mode OFF (default):**
- Normal delivery-to-self flow
- Address picker shows the customer's saved delivery addresses

**Fulfillment method toggle:** Delivery / Pickup (inherits default from
Address & Billing tab)

**Delivery panel:**
- Radio list of saved delivery addresses
- "Add a new address" link → opens the existing address modal

**Pickup panel:**
- Radio list of pickup locations (from `checkoutPickupLocations`)
- Date picker (defaults to ~6 days out, min date = today)

**Estimated arrival banner:** "Your order arrives Wednesday, April 15.
We deliver between 4–8 PM — you'll get a text when your driver is on
the way."

**Validation on Continue:**
- If delivery: `addressId` must be set
- If pickup: `pickupLocId` and `pickupDate` must be set
- If gift mode: recipient first name + last name + phone required, phone
  ≥ 10 digits

---

### Step 3 — Payment

**Fields:**
- Saved payment methods radio list (from `paymentMethods`)
- "Add a new card" link → opens the payment modal
- Security row: "Encrypted & PCI compliant" + VISA/MC/AMEX/DISC brand badges

**Validation on Continue:**
- `paymentId` must be set

**Note:** There's also an express Apple Pay / Google Pay row at the TOP
of the checkout (above Step 1). That's a separate entry point — see
"Apple Pay / Google Pay" below.

---

### Step 4 — Review & Place Order

**Contents:**
- Inline review of all previous steps:
  - Contact (or "Order placed by" + "receipt goes here" if gift)
  - Gift Recipient block (if gift)
  - Fulfillment
  - Payment
  - Item totals
- Two SMS consent checkboxes:
  - Transactional notifications (checked by default)
  - Marketing promotions (unchecked by default)
- Big yellow "Place Order — $XXX.XX" CTA
- T&Cs microcopy underneath

**On submit:**
- Validates all 3 previous steps are marked complete
- Fires the order creation API call
- If gift: toast reads "Gift order placed! [Name] will get delivery
  updates. Receipt sent to you."
- Otherwise: toast reads "Order placed! Confirmation will be emailed."

---

## Express Checkout (Apple Pay / Google Pay)

### Top of the page — Express Row

```
┌─────────────────────────────────────┐
│  🎯 Express Checkout  [Fastest]    │
│                                     │
│  [ Apple Pay ]  [ Google Pay ]     │
│                                     │
│  ─── Or pay with card below ───    │
└─────────────────────────────────────┘
```

**On tap:**
- Opens a simulated native payment sheet (real integration would use
  Apple Pay JS SDK / Google Pay JS API)
- 4-state animation: idle → authenticating → processing → success
- On success: closes sheet, marks all steps complete, fires success toast

**Data provided by Apple Pay / Google Pay:**
- Billing contact (name, email, phone) — **from the device's Apple ID /
  Google Account**, NOT from the BetterDay database
- Shipping contact (when not locked)
- Payment token (tokenized card reference for the processor)

### Logged-in vs guest behavior

- **Logged-in:** Merchant ignores Apple Pay's contact/shipping fields
  and uses the BetterDay profile's saved defaults. Apple Pay sheet
  should be configured with `requiredShippingContactFields: []` and
  `requiredBillingContactFields: []` so it only asks for payment.
- **Guest:** Merchant uses Apple Pay's contact data to silently create
  an unclaimed customer row. See `decisions/2026-04-08-apple-pay-and-accounts.md`.

### Gift orders + Express

Gift orders should NOT use the express Apple Pay button at the top
(it would ship to the buyer's own saved address). Instead:
1. User sets gift mode in Step 2
2. Fills in recipient info
3. At Step 3, taps a (separate) Apple Pay button inside the Payment step
4. That button uses Apple Pay for payment ONLY, respecting the gift
   shipping info already set in Step 2

**Implementation note:** A future Apple Pay button inside Step 3 is
planned. The current build only has the top express button. See
`decisions/2026-04-08-apple-pay-and-accounts.md` for the architecture.

---

## Price computation — `computeCheckoutTotals()`

```
subscriberPrice = sum of cart.m.price * m.qty
onetimePrice = sum of cart.m.retail_price * m.qty

isSub = getCheckoutOrderType() === 'subscription'  // returns 'onetime' if isGift

baseSubtotal = isSub ? subscriberPrice : onetimePrice
mealSavings = isSub ? max(0, onetimePrice - subscriberPrice) : 0

savePct = PERK_TIERS tier based on total meal count
freeDelivery = isSub && isDelivery && meals >= FREE_DELIVERY_MEALS
deliveryCost = isDelivery ? (freeDelivery ? 0 : DELIVERY_FEE) : 0

gst = baseSubtotal * 0.05
codeDiscount = checkoutState.discountCode ? baseSubtotal * 0.10 : 0  // mock
giftAmount = checkoutState.giftCard ? 10 : 0  // mock
pointsAmount = checkoutState.pointsApplied ? min(baseSubtotal, 1239 * 0.03) : 0

total = baseSubtotal + gst + deliveryCost - codeDiscount - giftAmount - pointsAmount
earned = floor(baseSubtotal * 0.7)   // mock — 0.7 pts per dollar
totalSavings = mealSavings + (freeDelivery ? DELIVERY_FEE : 0)
              + codeDiscount + giftAmount + pointsAmount
```

---

## Profile sync logic (Step 1)

When a logged-in user edits contact fields in checkout, we don't
silently overwrite the profile. Instead:

1. On tab open, snapshot the original contact:
   `checkoutState._originalContact = {firstName, lastName, email, phone}`
2. Every keystroke fires `onCheckoutContactEdit()` which compares current
   values to the snapshot
3. If anything has changed, reveal the Profile Sync banner with two
   radio options (default = "update profile")
4. On "Continue to Delivery", if changes detected AND choice is "update",
   call `updateUserContactFromCheckout()` which:
   - Updates `userData` (the client-side customer state)
   - Updates the Customer Info tab's display values + edit inputs
   - Updates the profile header name + avatar initials
   - Updates the snapshot so further edits detect correctly
5. If choice is "local", edits stay in the form only, profile untouched
6. Toast confirms either way

See `decisions/2026-04-08-contact-profile-sync.md` (TODO — write this)
for the rationale.

---

## Open questions 💭

- How do we handle Apple Pay at Step 3 vs the top express button
  cleanly in the UI? (Planned: a separate payment-only button inside
  Step 3 that respects gift shipping)
- Should the express button be disabled when gift mode is active in
  Step 2? (Yes, with a tooltip. Planned.)
- Cart abandonment: if a user abandons checkout mid-flow, how long do
  we preserve their `checkoutState`? (Not yet decided.)
- Phone number format validation is currently ≥10 digits, but should
  we enforce Canadian format specifically since BetterDay is Calgary-only?
- Postal code validation for delivery addresses — integrate Canada Post
  API or Google Places?

---

## Related files

- `flows/subscriber-hub.md` — overall hub structure (checkout is one tab)
- `decisions/2026-04-07-checkout-accordion-rebuild.md` — why we rebuilt
  from 6-card layout to 4-step accordion
- `decisions/2026-04-07-gift-flow-architecture.md` — gift orders architecture
- `decisions/2026-04-08-apple-pay-and-accounts.md` — how Apple Pay /
  Google Pay interact with the account model
