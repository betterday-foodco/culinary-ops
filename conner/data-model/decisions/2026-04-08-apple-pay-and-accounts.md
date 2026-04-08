# ADR: Apple Pay / Google Pay + Account Model

**Date:** 2026-04-08
**Status:** Accepted
**Deciders:** Conner

---

## Context

Question: how do Apple Pay and Google Pay interact with BetterDay's
account model? Do they replace the account? Do they require one? What
happens if a guest uses Apple Pay? What if a logged-in user uses Apple
Pay and the device info differs from their profile?

This ADR captures the full architectural decision.

---

## Key insight

**Apple Pay and Google Pay are payment methods, not checkout
replacements or identity providers.** They are tokenization layers that:

1. Let the user pay with a card stored in their device's Wallet
2. Return contact data stored on the device (Apple ID / Google Account)
3. Return a one-time-use payment token to the merchant

The merchant decides what to do with the contact data. Apple and Google
don't know (or care) whether the user has an account on BetterDay.

---

## Data sources (two separate stores)

```
┌─────────────────────────────┐    ┌─────────────────────────────┐
│   BetterDay database        │    │   Device (Apple/Google)     │
├─────────────────────────────┤    ├─────────────────────────────┤
│  customer.first_name        │    │  Apple ID first name        │
│  customer.email             │    │  Apple ID email             │
│  customer.phone             │    │  Apple ID phone             │
│  address.street             │    │  Apple Wallet shipping addr │
│  payment_method.last4       │    │  Apple Wallet cards         │
└─────────────────────────────┘    └─────────────────────────────┘
```

These are independent. Apple Pay does NOT read from BetterDay's profile.
BetterDay does NOT read from the Apple ID. The only thing that flows
between them is the payment token and contact data that Apple returns
when the user authorizes a payment.

---

## Account model decisions

### 1. Subscriptions require an account
Recurring billing requires a stable customer identity for pause/cancel,
dispute resolution, fraud checks, invoicing, tax records. Non-negotiable.
You cannot sign up for a BetterDay subscription as a guest.

### 2. One-time orders allow guest checkout
Guests can place one-time orders (including gifts) without ever creating
a password. The order is attached to a silently-created `customer` row
with `status = 'unclaimed'`.

### 3. Silent account creation from Apple Pay contact data
When a guest uses Apple Pay:
- Apple Pay returns billing contact (name, email, phone)
- Merchant checks: does a customer already exist with this email?
  - **YES:** attach the order to the existing customer (guest flow merges
    with any previous account they had)
  - **NO:** create a new customer row with `source = 'apple_pay_express'`
    and `status = 'unclaimed'`
- The user never sees "an account has been created" — it just happens

### 4. Post-purchase soft account claim
On the order confirmation page, show a prominent (but skippable) prompt:

> *"To track your order & get delivery updates, finish setting up your account"*
>
> [email is pre-filled]
> [password field]
> [Create Account & Track Order button]
>
> ─── or ───
>
> *"Just text me delivery updates instead"*

- Option A: user sets a password → `customer.status = 'active'`, can log in later
- Option B: user picks "just text me" → `customer.status = 'unclaimed'`, SMS only
- Option C: user closes the tab → `customer.status = 'unclaimed'`, we send a
  magic-link email letting them claim later

This is NOT a forced account creation. The order is already confirmed
and paid. We're offering value-adds (order tracking dashboard, future
checkouts) in exchange for a password.

### 5. Magic link fallback
Any unclaimed customer can later enter their email on the login page
and get a magic link emailed to them. Clicking the link logs them into
their unclaimed account, where they can set a password or just manage
the account as-is.

---

## Express checkout reconciliation rules

When a user taps Apple Pay / Google Pay at the TOP of the checkout page:

### If user is logged in to BetterDay
- **Account data wins.** Use the customer's saved default address,
  saved default card (selected in the Apple Pay sheet), and saved contact.
- The Apple Pay sheet should be configured with:
  ```js
  requiredShippingContactFields: []  // don't even ask
  requiredBillingContactFields: []
  ```
- The sheet becomes a pure "pick a card, Face ID, done" experience
- Apple Pay's returned contact data is ignored for this order
- The account stays unchanged

### If user is a guest
- **Apple Pay data wins**, because there's nothing in the database to
  override with.
- After Face ID, show a lightweight **"Review & Confirm"** micro-sheet:
  - Shipping address (editable)
  - Contact email + phone (editable)
  - Payment (not editable — already tokenized)
  - Total
  - "Place Order" button
- User confirms or edits, then taps Place Order
- Silent account creation fires, order is placed
- Post-purchase confirmation page offers the account claim flow

### If user is logged in but using a different device (shared iPad etc.)
- Apple Pay returns someone else's contact (wife, roommate)
- Merchant uses the LOGGED-IN account's customer_id (not the Apple Pay
  contact's)
- Billing contact snapshot on the order uses the Apple Pay data (because
  that's whose card was used)
- Order still belongs to the logged-in user's account

---

## Gift flow + Apple Pay

Apple Pay express at the TOP of the checkout should NOT be used for
gifts — it would ship to the buyer's own saved address, not the
recipient's.

Instead:
1. User enters gift mode in Step 2 and fills in recipient info
2. User proceeds to Step 3 Payment
3. A second Apple Pay / Google Pay button inside Step 3 offers payment
4. This button is configured with `requiredShippingContactFields: []` —
   shipping is LOCKED because the user already set it in Step 2
5. Apple Pay only returns billing contact + payment token
6. Order is created with:
   - `customer_id` = the logged-in user
   - `billing_contact` = from Apple Pay
   - `shipping_address_id` = from Step 2 (the gift recipient's address)
   - `gift_recipient` = from Step 2 (the gift form data)
   - `payment_method` = the Apple Pay token

The current build only has the express button at the top; the Step 3
Apple Pay button is planned but not yet implemented.

### Guarding the express button
When gift mode is active in Step 2, clicking the express button at the
top should show a tooltip / warning:

> *"Express checkout ships to your saved address. To send a gift, use
> the Pay with Apple Pay button in Step 3."*

---

## Customer identity matrix

| Situation | customer_id | billing_contact | shipping_contact | payment |
|---|---|---|---|---|
| Subscriber normal weekly | logged-in | profile | profile default | saved card |
| Subscriber Apple Pay express | logged-in | profile (override Apple Pay) | profile default (override) | apple_pay_token |
| Subscriber one-time gift (saved card) | logged-in | profile | gift recipient addr | saved card |
| Subscriber gift paid via Apple Pay (Step 3) | logged-in | apple_pay_billing | gift recipient addr (Step 2, not Apple Pay) | apple_pay_token |
| Guest one-time via Apple Pay | new_auto_created (or matched-by-email) | apple_pay_billing | apple_pay_shipping (or edited in Review sheet) | apple_pay_token |
| Guest one-time gift via Apple Pay | new_auto_created | apple_pay_billing | gift recipient addr (Step 2) | apple_pay_token |

---

## Notifications (phone-first model)

BetterDay leans heavy on SMS updates:

- Apple Pay gives the customer's phone → delivery SMS starts automatically
- First SMS: "Your BetterDay order #BD-12345 is confirmed for Wed Apr 15!
  Reply STOP to unsubscribe, or reply YES to get updates on future orders too."
- Customer replies YES → `customer.sms_opt_in = true`
- Customers can live as SMS-only indefinitely — "account" is secondary

This matches the DoorDash model where a huge chunk of customers never
use the web dashboard, just SMS.

---

## Consequences

- Every guest Apple Pay order creates a customer row, even if the user
  never sees an account prompt
- Email is the primary identity key (customers are unique by email) —
  if someone uses Apple Pay twice with the same Apple ID email, they
  get the same customer_id (accounts merge)
- Post-purchase account claim is strongly encouraged but NOT required
- Unclaimed customers can still interact with BetterDay via SMS and
  magic-link email; they can claim an account at any time
- Gift orders NEVER use the express button at the top — must go through
  the stepper so the gift shipping data is honored

## Follow-up work

- [ ] Add a second Apple Pay / Google Pay button inside Step 3 of the checkout
- [ ] Label the top express row with "Uses your saved info" subtitle
- [ ] Add gift-mode guard/warning on the top express button
- [ ] Build the "Review & Confirm" micro-sheet for guest express flow
- [ ] Build the post-purchase "Create Account" confirmation page
- [ ] Wire the silent account creation logic (requires real backend)
- [ ] Set up magic-link email infrastructure
