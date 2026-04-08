# ADR: Gift Flow Architecture

**Date:** 2026-04-07
**Status:** Accepted
**Deciders:** Conner

---

## Context

Need to support the use case: "I (a BetterDay subscriber) want to send
a one-time meal box to my mom as a gift."

This raises a whole family of questions:
- Who's the account holder vs the recipient?
- Who pays?
- Who gets the receipt vs the delivery notifications?
- Can the gift be a subscription or only one-time?
- What happens to the recipient's info afterward — do they get an account?
- How does this interact with Apple Pay / Google Pay?

---

## Options considered

### Option A: Same-account gifts (Amazon model)
- The buyer's account owns the order
- Just a "This is a gift" checkbox on shipping
- Recipient gets nothing from BetterDay directly
- Gift-giver tracks the order in their own account
- **Pro:** simple, familiar
- **Con:** recipient can't track delivery or contact CS if something goes wrong

### Option B: Create recipient accounts automatically
- Gift creates a placeholder account for the recipient
- Recipient can claim it later via magic link
- Both accounts are linked
- **Pro:** gives the recipient ownership
- **Con:** complicated auth, weird relationship between accounts, hard to
  reason about billing/subscription ownership

### Option C: Buyer owns the order, recipient gets delivery SMS only (chosen)
- Order belongs to the buyer's `customer_id`
- `is_gift` flag on the order
- `gift_recipient` jsonb on the order with name + phone + optional message
- Receipt email goes to the buyer's contact (account holder)
- Delivery SMS (on-the-way, arrived) goes to the recipient's phone
- Recipient never gets an account unless they choose to sign up later
  via their own flow
- **Pro:** simple data model, no weird account linking
- **Pro:** matches DoorDash / Uber Eats / Amazon patterns
- **Con:** recipient can't track the order themselves (only gets SMS updates)

---

## Decision

**Option C.** The buyer's account owns the order. The recipient gets a
delivery SMS but no account.

## Gift subscriptions — separate flow

Gift orders in the main checkout are **one-time only**. Gift
subscriptions (like HelloFresh's "give 4 weeks to a friend") add a lot
of complexity:

- Whose card renews?
- Who can pause / cancel?
- Can the recipient edit meals each week?
- What happens when the prepaid period ends?

These questions are real and solvable but they belong in a dedicated
"Give a Gift Subscription" flow — HelloFresh's model — where you buy a
prepaid gift code upfront and the recipient redeems it via their own
signup process. We'll build that as a separate page later, not as a
mode of the main checkout.

**For the main checkout right now:** gift mode forces `order_type = 'one_time'`
regardless of whether the buyer is a subscriber.

## Data model

Orders have these new fields:

```
order {
  ...
  is_gift: bool,
  gift_recipient: jsonb | null {
    first_name, last_name, phone, message
  },
  gift_sms_sent_at: timestamp | null,
  ...
}
```

The shipping address is still a normal `address_id` — the recipient's
address gets stored as an address row on the BUYER's account (with
`recipient_name = "Mom"`). This way the buyer can reuse it for future
gifts without re-entering.

## Notifications

- **Receipt email** → buyer's `billing_contact.email`
- **Order confirmation SMS** (immediate) → buyer's phone
- **Delivery-day SMS** ("your order is out for delivery") → **recipient's
  phone** (from `gift_recipient.phone`)
- **Arrived SMS** → recipient's phone
- **Customer service email reply-to** → buyer (they own the order, they
  handle problems)

## UI implications

- Gift toggle added to Step 2 of the checkout accordion
- When gift mode is on:
  - Reveals recipient name + phone + message fields
  - Shows info banner explaining the notification split
  - Address picker label changes to "Recipient's delivery address"
  - Computes totals as one-time (bypasses subscriber discount / free delivery)
- Step recap when collapsed shows `🎁 Gift to [name]`
- Step 4 Review shows a dedicated Gift Recipient block
- Submit toast distinguishes: "Gift order placed! Sarah will get delivery updates."

---

## Consequences

- One-time gifts work cleanly with zero new entities beyond `is_gift`
  and `gift_recipient` on the order
- Gift subscriptions require a whole separate flow (deferred)
- Apple Pay at the top of the checkout should NOT be used for gifts
  (it would ship to the buyer's own saved address). Gift orders should
  use the saved card in Step 3 OR a future Apple Pay button inside Step 3.
  See `2026-04-08-apple-pay-and-accounts.md`.
- If a recipient wants to become a BetterDay customer themselves, they
  sign up fresh — no automatic migration from "I got a gift once" to
  "I have an account."
