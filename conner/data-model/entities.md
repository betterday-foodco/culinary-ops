# BetterDay Data Entities

Canonical data shapes for the BetterDay web app. This is the source of
truth for the eventual backend schema.

**Last updated:** 2026-04-08

## Status legend

- ✅ Stable
- 🚧 In progress
- 💭 Proposed

---

## customer ✅

The primary account entity. One row per BetterDay user (subscriber OR
guest who placed a one-time order).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `display_id` | text | human-readable: `BD-C-00012` |
| `email` | text | **unique**, indexed for lookup |
| `phone` | text | indexed, format: `(xxx) xxx-xxxx` |
| `first_name` | text | |
| `last_name` | text | |
| `birthday` | date | nullable |
| `member_since` | date | auto-set at signup |
| `status` | enum | `active` \| `paused_indefinite` \| `cancelled` \| `unclaimed` |
| `source` | enum | `signup` \| `apple_pay_express` \| `google_pay_express` \| `gift_redeem` \| `admin` |
| `password_hash` | text | nullable — null for unclaimed / OAuth-only accounts |
| `apple_id_sub` | text | nullable — for Sign in with Apple |
| `google_id_sub` | text | nullable — for Sign in with Google |
| `stripe_customer_id` | text | nullable — reference to processor's customer object |
| `sms_opt_in` | bool | default true |
| `email_opt_in` | bool | default true |
| `allergens` | text[] | e.g. `['Shellfish', 'Gluten']` |
| `diet_tags` | text[] | e.g. `['High Protein', 'Keto']` |
| `disliked_meals` | text[] | manual "never swap TO this" list |
| `favorite_meals` | text[] | manual preferred list |
| `internal_notes` | text | **admin-only**, CS notes |
| `tags` | text[] | **admin-only** segmentation e.g. `['VIP', 'frequent-edits']` |
| `last_contacted_at` | timestamp | nullable — last outbound CS touchpoint |
| `flagged` | bool | admin attention flag |
| `flagged_reason` | text | nullable |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |
| `last_login_at` | timestamp | nullable |

**Implemented in:** `app/subscriber-hub-2.0.html` as `userData` object
**Search by:** `email`, `phone`, `display_id`
**Unique constraint:** `email`

### Notes
- `status = 'unclaimed'` means the customer was silently auto-created from
  an Apple Pay / Google Pay contact token and hasn't set a password yet.
  They can still receive SMS order updates and use magic-link login.
- `allergens` drives the auto-swap logic when the weekly menu rotates.
- `disliked_meals` is a MANUAL override separate from allergens — used
  when a customer says "I just don't like beef" which isn't an allergy.
- `internal_notes` and `tags` are hidden from the customer's own UI and
  only visible in the admin dashboard.

---

## address ✅

A delivery or pickup address. A customer can have many.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `customer_id` | uuid | fk → customer.id |
| `label` | text | `Home`, `Office`, `Mom` (user-chosen) |
| `type` | enum | `delivery` \| `pickup` |
| `recipient_name` | text | **Not always the customer's name** — for gift addresses |
| `recipient_phone` | text | delivery SMS target |
| `company` | text | nullable |
| `street` | text | |
| `street2` | text | nullable, apartment/unit |
| `city` | text | |
| `state` | text | |
| `zip` | text | |
| `delivery_instructions` | text | nullable — "leave at side door" etc. |
| `is_default` | bool | at most one per customer per type |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Implemented in:** `app/subscriber-hub-2.0.html` as `acctAddresses` array

### Notes
- `recipient_name` is distinct from the customer's name. When Jose stores
  Mom's address, `customer_id` is Jose's but `recipient_name` is "Sarah
  Ramirez" (his mom).
- Only one address can have `is_default = true` per customer per `type`.
- `delivery_instructions` is per-address because instructions differ by
  location ("leave at side door" for home, "lobby desk" for office).

---

## payment_method ✅

A tokenized reference to a payment card. Real card numbers never stored.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `customer_id` | uuid | fk → customer.id |
| `processor` | enum | `stripe` \| `braintree` \| `adyen` \| `apple_pay` \| `google_pay` |
| `processor_token` | text | the tokenized reference (no real PAN) |
| `brand` | enum | `visa` \| `mc` \| `amex` \| `disc` \| `other` |
| `last4` | text | e.g. `4242` |
| `exp_month` | int | 1–12 |
| `exp_year` | int | e.g. 2027 |
| `cardholder_name` | text | nullable |
| `is_default` | bool | at most one per customer |
| `created_at` | timestamp | |

**Implemented in:** `app/subscriber-hub-2.0.html` as `paymentMethods` array

### Notes
- Full card numbers NEVER touch BetterDay's database. Processor handles PCI.
- Apple Pay / Google Pay "tokens" are per-device DPANs, so if a customer
  uses the same Apple Pay card on two devices, you'll have two
  `payment_method` rows.

---

## subscription ✅

A recurring delivery commitment. A customer has at most one active
subscription at a time.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `customer_id` | uuid | fk → customer.id — **required** (gifts can't start subs) |
| `cadence` | enum | `weekly` \| `biweekly` \| `monthly` |
| `status` | enum | `active` \| `paused` \| `paused_indefinite` \| `cancelled` |
| `next_renewal_at` | timestamp | when the next weekly cart record gets generated |
| `default_payment_id` | uuid | fk → payment_method.id |
| `default_address_id` | uuid | fk → address.id |
| `default_meal_count` | int | e.g. 9 — used for carryover target |
| `savings_tier` | int | current % off: 5 \| 8 \| 11 \| 14 \| 17 \| 20 |
| `started_at` | timestamp | |
| `paused_at` | timestamp | nullable |
| `cancelled_at` | timestamp | nullable |
| `cancel_reason` | text | nullable |
| `lifetime_orders` | int | denormalized counter |
| `lifetime_spend` | decimal | denormalized counter |

**Implemented in:** `app/subscriber-hub-2.0.html` as `subscriptionStatus` and tier logic

### Notes
- Only subscribers can have a subscription row. Guests and gift recipients
  do not get one.
- `savings_tier` is computed from `default_meal_count` against the tier
  table (4→5%, 5→8%, 7→11%, 8→free delivery, 9→14%, 11→17%, 13→20%).
- Cancelled subscriptions are soft-deleted (status change), not hard-deleted,
  for win-back campaigns.

---

## weekly_cart_record 🚧

Per-customer, per-week cart state. Generated every Friday morning for
all active subscribers. This is how skip/pause work without invoice chaos.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `subscription_id` | uuid | fk → subscription.id |
| `customer_id` | uuid | fk → customer.id |
| `delivery_week` | date | the Sunday of that delivery week |
| `delivery_status` | enum | `scheduled` \| `confirmed` \| `skipped` \| `paused` \| `cancelled` |
| `cart_items` | jsonb | `[{meal_id, qty, price_snapshot}]` |
| `order_id` | uuid nullable | fk → order.id — set when cutoff fires and order is created |
| `processed_at` | timestamp nullable | null until Thursday cutoff |
| `last_reviewed_at` | timestamp nullable | when the customer last viewed/edited |
| `created_at` | timestamp | |

**Implemented in:** Not yet — planned for the cart carryover system.

### Notes
- Created for EVERY active subscriber every week, no exceptions.
- `delivery_status = 'skipped'` or `'paused'` means the record exists but
  the order isn't generated — production cart report filters these out.
- See `decisions/2026-04-07-skip-pause-model.md` (TODO: write this).

---

## order ✅

A single delivery. One order = one delivery. Always.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `display_id` | text | human-readable: `BD-2026-04-0012345` |
| `customer_id` | uuid | fk → customer.id — who owns this order |
| `subscription_id` | uuid | nullable — fk if recurring, null if one-time |
| `order_type` | enum | `one_time` \| `subscription_first` \| `subscription_renewal` \| `add_on` |
| | | |
| **Contact snapshots (never mutate)** | | |
| `billing_contact` | jsonb | `{name, email, phone}` at time of order |
| `payment_method_id` | uuid | fk → payment_method.id |
| `processor_charge_id` | text | the charge reference from Stripe/etc. |
| | | |
| **Fulfillment** | | |
| `fulfillment_method` | enum | `delivery` \| `pickup` |
| `shipping_address_id` | uuid | nullable — fk if delivery |
| `pickup_location_id` | uuid | nullable — fk if pickup |
| `pickup_date` | date | nullable |
| `estimated_delivery_date` | date | nullable — what we told the customer |
| | | |
| **Gift fields** | | |
| `is_gift` | bool | default false |
| `gift_recipient` | jsonb | nullable `{first_name, last_name, phone, message}` |
| `gift_sms_sent_at` | timestamp | nullable |
| | | |
| **Line items (snapshot)** | | |
| `line_items` | jsonb | `[{meal_id, name, qty, price, img_url}]` — prices snapshotted at order time |
| `meals_count` | int | denormalized sum of qty |
| | | |
| **Money** | | |
| `subtotal` | decimal | |
| `subscriber_discount` | decimal | 0 for one-time |
| `savings_pct` | int | 0 for one-time |
| `code_discount` | decimal | from promo code |
| `gift_card_amount` | decimal | |
| `points_redeemed` | decimal | dollar value of points used |
| `tax` | decimal | GST 5% |
| `delivery_fee` | decimal | 0 if free-delivery threshold met |
| `total` | decimal | final amount charged |
| `points_earned` | int | awarded to customer after delivery |
| | | |
| **Status** | | |
| `status` | enum | `pending` \| `confirmed` \| `in_kitchen` \| `out_for_delivery` \| `delivered` \| `cancelled` \| `refunded` |
| `placed_at` | timestamp | |
| `confirmed_at` | timestamp | nullable |
| `delivered_at` | timestamp | nullable |
| | | |
| **Audit / CS** | | |
| `admin_notes` | text | admin-only per-order notes |
| `edit_history` | jsonb[] | append-only log of changes, see below |
| `is_locked` | bool | true after cutoff |
| `locked_at` | timestamp | nullable |
| `locked_by` | text | `cutoff_job` \| `admin:conner` |

**Implemented in:** Not yet fully — partial in `app/subscriber-hub-2.0.html`
order history data.

### `edit_history` shape

Append-only JSON array. Every change (customer or admin) gets a row.

```json
[
  {
    "edited_at": "2026-04-07T14:32:00Z",
    "edited_by": "admin:conner",
    "reason": "customer email",
    "before": { "items": [...], "total": 143.76 },
    "after":  { "items": [...], "total": 159.74 },
    "delta":  { "added": ["Bang Bang Salmon x2"], "removed": ["Blackened Caesar x1"] }
  }
]
```

### Notes
- **The order is the atomic unit.** Never split one delivery across
  multiple orders. If a customer adds an add-on BEFORE cutoff, mutate
  `line_items` and append to `edit_history` — don't create a new order.
- After cutoff, the order is locked (`is_locked = true`) and any extras
  become a separate `order_type = 'add_on'` order.
- `billing_contact` is a jsonb snapshot, not a foreign key, so historical
  receipts always show the contact info at time of purchase.
- `line_items` include meal name and price snapshots so order history
  doesn't break when meals get renamed or repriced.

---

## meal ✅

The product catalog. Weekly menu items.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | |
| `category` | enum | `Entrees` \| `Sandwich & Wraps` \| `Breakfasts` \| `Snacks & Other` |
| `description` | text | |
| `image_url` | text | |
| `price` | decimal | subscriber price |
| `retail_price` | decimal | one-time price (~8% higher) |
| `is_available` | bool | whether it's on the current menu |
| `available_week` | date | which week's menu it's on |
| `allergens` | text[] | `['Shellfish', 'Gluten', ...]` |
| `diet_tags` | text[] | `['High Protein', 'Vegan', ...]` |
| `calories` | int | nullable |
| `protein_g` | decimal | nullable |
| `carbs_g` | decimal | nullable |
| `fat_g` | decimal | nullable |
| `ingredients` | text | nullable |
| `heating_instructions` | text | nullable |

**Implemented in:** `app/menu-overlay.html` as `allMeals` array

---

## pickup_location 🚧

A BetterDay pickup depot. Small list, updated manually by ops.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | `BetterDay HQ` |
| `address` | text | full street address |
| `city` | text | |
| `pickup_days` | text[] | `['Wed', 'Thu']` |
| `pickup_hours` | text | `5 PM – 8 PM` |
| `active` | bool | |

**Implemented in:** `app/subscriber-hub-2.0.html` as `checkoutPickupLocations`

---

## reward_points_transaction 💭

Every points earned or spent event. Immutable ledger.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `customer_id` | uuid | |
| `type` | enum | `earned` \| `spent` \| `expired` \| `admin_adjust` |
| `points` | int | positive for earned, negative for spent |
| `dollar_value` | decimal | at time of transaction |
| `order_id` | uuid | nullable — related order if any |
| `reason` | text | human-readable |
| `created_at` | timestamp | |

---

## coupon 💭

A reusable discount code or personalized offer.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `code` | text | unique |
| `type` | enum | `percentage` \| `dollar_amount` \| `free_item` \| `free_delivery` |
| `value` | decimal | |
| `applies_to` | enum | `order` \| `category` \| `specific_meal` |
| `min_order_value` | decimal | nullable |
| `max_uses` | int | nullable |
| `max_uses_per_customer` | int | nullable |
| `expires_at` | timestamp | nullable |
| `customer_id` | uuid | nullable — if personal |
| `created_at` | timestamp | |

---

## audit_log 💭

System-wide audit trail. Anything that changes customer data or orders
gets a row here.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `actor` | text | `customer:<id>` \| `admin:<username>` \| `system:<job_name>` |
| `action` | text | `order.edit`, `customer.update`, `subscription.pause`, ... |
| `entity_type` | text | `order`, `customer`, `subscription`, ... |
| `entity_id` | uuid | |
| `before` | jsonb | snapshot of the state before |
| `after` | jsonb | snapshot of the state after |
| `ip_address` | text | for security forensics |
| `user_agent` | text | |
| `created_at` | timestamp | |

### Notes
- Append-only. Never update or delete audit_log rows.
- Separate from `orders.edit_history` — audit_log is the system-wide
  firehose; edit_history is the per-order denormalized view for CS.

---

## Relationships

```
customer 1 ─── n addresses
         1 ─── n payment_methods
         1 ─── 0..1 subscription
         1 ─── n orders
         1 ─── n weekly_cart_records (via subscription)
         1 ─── n reward_points_transactions
         1 ─── n coupons (if personal)

subscription 1 ─── n weekly_cart_records
             1 ─── n orders (via subscription_id)

weekly_cart_record 1 ─── 0..1 order (one order generated per record at cutoff)

order n ─── 1 customer
      0..1 ─── 1 subscription
      0..1 ─── 1 shipping_address
      0..1 ─── 1 pickup_location
      0..1 ─── 1 payment_method
      n ─── n meals (via line_items jsonb — denormalized snapshot)
```

## Indexes needed (for when we build the real DB)

- `customer.email` — unique
- `customer.phone` — indexed
- `customer.display_id` — unique
- `address.customer_id` — fk index
- `payment_method.customer_id` — fk index
- `subscription.customer_id` — fk index
- `order.customer_id` — fk index
- `order.subscription_id` — fk index
- `order.display_id` — unique
- `order.status` — indexed (dashboard queries filter by this)
- `order.placed_at` — indexed (order history sorts by this)
- `weekly_cart_record.subscription_id, delivery_week` — composite unique
- `weekly_cart_record.delivery_week, delivery_status` — composite index for cart report
