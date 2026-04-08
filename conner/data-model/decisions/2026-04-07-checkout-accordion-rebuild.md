# ADR: Rebuild Checkout as Accordion Stepper

**Date:** 2026-04-07
**Status:** Accepted
**Deciders:** Conner

---

## Context

The initial checkout implementation was built as 6 side-by-side cards
(Contact, Order Type, Delivery Method, Tip, Payment, Consent) each with
a colored header (navy / purple / lightgreen / lightpurple / navy).

Feedback: too visually noisy. The multi-color hero cards worked for the
subscriber hub (where each card is a functionally distinct area) but on
a sequential task like checkout, the color variety became competing
attention instead of organization.

Also: all 6 sections were always visible, which meant the user saw ALL
decisions at once rather than being guided through them sequentially.

---

## Options considered

### Option 1: Keep the 6-card layout, just tone down the colors
- Pro: minimal refactor
- Con: still visually busy, still doesn't guide the user
- Con: still buries Order Type and Tip as their own full sections

### Option 2: Wrap the existing cards in an accordion (surgical retrofit)
- Pro: faster to build
- Con: the hero cards are designed to look good when open; they look
  weird when collapsed as just a header strip
- Con: half-measure — visual noise stays

### Option 3: Full rebuild as a proper stepper (chosen)
- Pro: matches the industry standard (Shopify new checkout, Casper,
  Brooks, Away, Stripe Checkout)
- Pro: guides the user through one decision at a time
- Pro: enables smart auto-advance for pre-filled sections
- Pro: enables clean "Edit" affordance on completed steps
- Con: larger refactor, ~60% of the existing code gets replaced

---

## Decision

**Rebuild the checkout as a 4-step accordion stepper.** 4 steps, not 6.
Removed Tip Our Team entirely (decision: don't tip on checkout). Order
Type is no longer on the checkout — it's set on menu-overlay and
(optionally) a last-second upsell banner for one-time customers.

The 4 steps:
1. Contact
2. Delivery
3. Payment
4. Review & Place Order

### Visual language
- Numbered circles on the left with a vertical connector line (Brooks pattern)
- Single white cards on cream background, no multi-color headers
- Active step expanded, completed shows data + Edit link, pending dim
- Yellow "Continue to [Next]" CTA at bottom of each active step
- Final step has the big Place Order CTA

### References
Inspired by:
- **Casper** — savings pills, YOU SAVED badge, perks icons
- **Brooks** — vertical timeline, each step as own card
- **Away** — cleanest Edit affordance + recap pattern
- **Shopify new checkout** — 3-step collapsible pattern

---

## Consequences

- Had to remove the Order Type toggle from checkout entirely (was being
  set at the wrong stage)
- Had to remove the Tip section (decision from the same conversation)
- Had to design a one-time → subscription upsell banner for when a user
  lands on checkout with `?type=onetime`
- Gift mode got added to the Delivery step as a toggle (see gift-flow ADR)
- Added a "Step X of 4" indicator
- Added a merged navy header bar with the cutoff countdown on the right
- Added a perks icon row and Need Help footer in the summary sidebar
  (Casper pattern)

## Follow-up work

- [x] Full rebuild of checkout panel HTML, CSS, and JS
- [x] New accordion stepper with numbered circles and connector line
- [x] Edit affordance on completed steps (click anywhere on the step card)
- [x] Profile sync banner on Step 1 (see separate ADR)
- [x] Gift mode toggle on Step 2 (see separate ADR)
- [ ] Add a second Apple Pay button inside Step 3 for gift flows
- [ ] Wire real countdown timer (currently static)
