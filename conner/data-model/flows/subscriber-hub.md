# Flow: Subscriber Hub

The main customer account dashboard. 6 tabs, each a different view
into the customer's account.

**Implemented in:** `app/subscriber-hub-2.0.html`

---

## Tabs

| Tab | Entities touched | Main purpose |
|---|---|---|
| **My Subscription** | `customer`, `subscription`, `weekly_cart_record`, `meal` | Show next delivery, current cart, skip/pause controls |
| **Customer Info** | `customer` | Edit name, contact, allergens, diet preferences |
| **Address & Billing** | `customer`, `address`, `payment_method` | Manage saved addresses + saved cards, set defaults |
| **Order History** | `order`, `meal` | View past deliveries, receipts, reorder button |
| **Discounts** | `customer`, `reward_points_transaction`, `coupon` | Points balance, redemption, referral code, coupons |
| **Checkout** | See `flows/checkout.md` | The 4-step accordion checkout flow |

---

## Data loaded on page open

```
GET /api/me
  → returns:
    - customer (full row)
    - subscription (if active)
    - addresses (all)
    - payment_methods (all)
    - current_weekly_cart_record (this week's cart)
    - reward_points_balance
    - recent_orders (last 5)
```

One bulk fetch on page load, everything cached in memory.

---

## Tab: My Subscription

### What the customer sees
- "Your Next Delivery: Thursday, April 2" header
- Cart summary by category with meal thumbnails
- Weekly savings progress (tier + free delivery)
- Skip / Pause / Edit Cart actions
- 4-week rolling calendar showing skip/unskip state per week
- Rewards preview, offers, referral

### Data movements
- Editing the cart → opens the menu-overlay, writes back to `weekly_cart_record.cart_items`
- Clicking Skip on a week → updates `weekly_cart_record.delivery_status = 'skipped'`
- Clicking Pause → updates `subscription.status = 'paused_indefinite'` and sets all
  future `weekly_cart_record.delivery_status = 'paused'`
- Clicking Cancel → gauntlet modal, then `subscription.status = 'cancelled'`

### State transitions
See `decisions/2026-04-07-skip-pause-model.md` (TODO) for the full state machine.

---

## Tab: Customer Info

### What the customer sees
- Name, birthday (editable in-place)
- Email, phone (editable in-place, with format validation)
- SMS opt-in toggle
- Allergens chips (multi-select)
- Diet preference chips (multi-select)
- "Save Preferences" button

### Data movements
- Any change → `PATCH /api/customer/me` with just the changed fields
- Allergens change → queue a job to re-scan upcoming `weekly_cart_records`
  for the customer and auto-swap flagged items

### Notes
- The checkout flow's Contact step can ALSO edit these fields, with a
  prompt to "update profile?" — see `flows/checkout.md`.

---

## Tab: Address & Billing

### What the customer sees
- Default delivery method toggle (Delivery / Pickup)
- Pickup location selector (if pickup default)
- List of saved delivery addresses as cards
- "Add Address" modal with full form + autocomplete
- List of saved payment methods as cards
- "Add Card" modal

### Data movements
- Add address → `POST /api/addresses`
- Edit address → `PATCH /api/addresses/:id`
- Delete address → `DELETE /api/addresses/:id` (soft delete recommended,
  in case it's referenced by past orders)
- Set default → `PATCH /api/addresses/:id` with `is_default: true`, backend
  clears the flag on all other addresses of the same type
- Same pattern for payment methods

### Notes
- You can't actually DELETE a payment_method or address if it's referenced
  by a confirmed or pending order — instead mark it `is_deleted` and
  filter it from the UI.
- Address validation (via Google Places API) happens at form submit, not
  as you type.

---

## Tab: Order History

### What the customer sees
- Paginated list of past orders (5 per page)
- Each row: order #, date, status badge, total, item count
- Expandable to show full item list + delivery address + reorder button
- "Reorder" button opens the menu-overlay with the previous order's
  items pre-filled in the cart

### Data movements
- Initial load → `GET /api/orders?limit=5&offset=0`
- Pagination → `GET /api/orders?limit=5&offset=N`
- Expand row → lazy-load line_items if not already cached
- Reorder → `POST /api/cart/from-order/:order_id`

### Notes
- Line items are stored as jsonb on the order, so reorder just copies
  them into the current weekly_cart_record.
- Items that are no longer available need a fallback — the UI should
  show "X of Y items available" if any are missing from the current menu.

---

## Tab: Discounts

### What the customer sees
- Points balance (big number)
- Tier progress bar (Silver / Gold / Platinum / Diamond)
- Redeem buttons for available rewards (free snack, $5 off, etc.)
- Points history list (earned / spent events)
- Refer a Friend — code + copy button + share buttons
- Referral stats (referred / earned / pending)
- Available coupons grid

### Data movements
- Redeem → `POST /api/rewards/redeem` with reward type
  → creates a `reward_points_transaction` with negative points
  → may create a `coupon` row if it's "get $5 off next order"
- Referral stats come from a view over `customer.referred_by`

### Notes
- Points-to-dollars ratio: 1 point = $0.03 (3¢)
- Tier thresholds: Silver 0, Gold 1000, Platinum 1500, Diamond 3000

---

## Global header

- ECC-style top nav (blue bar)
- Account tabs bar (sticky under top nav)
- Logout button (far right of tabs bar)
- No footer — the page is treated as a "blinder mode" app experience

---

## Related flows

- `flows/checkout.md` — 4-step accordion checkout (the Checkout tab)
- `flows/menu-overlay.md` — full-screen menu editor (opened from My Subscription)
