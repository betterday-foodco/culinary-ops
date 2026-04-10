# ADR: Phone Number Format Standardization

**Date:** 2026-04-08
**Status:** Accepted
**Deciders:** Conner

---

## Context

Phone numbers were appearing in multiple inconsistent formats across
the subscriber hub:
- `(630) 267-9543` (formatted)
- `Phone number` (plain text placeholder)
- `(403) 555-1234` (example placeholder)
- Accepting any string as input with no format enforcement

This creates problems for:
- Matching customers by phone across systems
- Sending SMS via a telephony provider that expects E.164
- Display consistency
- Customer support lookups

---

## Decision

**Standardize on `(xxx) xxx-xxxx` as the display format everywhere.**
All phone inputs must:
1. Format live as the user types
2. Show `(xxx) xxx-xxxx` as the placeholder
3. Cap at 14 characters (the length of the formatted string)
4. Use `inputmode="tel"` for mobile keyboards
5. Use `autocomplete="tel"` for password manager integration
6. Validate on blur — flag as error if fewer than 10 digits entered
7. Save in the database as the formatted display string

Storage format is the display format (`(403) 555-1234`). When we
integrate with a real SMS provider later, we'll convert to E.164
(`+14035551234`) at the API call site, not at storage time. This way
the customer-visible format and the stored format match.

---

## Implementation

Two helper functions in the main script block of `subscriber-hub-2.0.html`:

```js
function formatPhoneNumber(value) {
  // Strips non-digits, caps at 10, progressively formats
  // "" → ""
  // "6" → "(6"
  // "630" → "(630"
  // "6302" → "(630) 2"
  // "630267" → "(630) 267"
  // "6302679543" → "(630) 267-9543"
}

function attachPhoneFormatter(input) {
  // Wires the live-format handler, sets attrs, adds blur validation
}

function initAllPhoneInputs() {
  // Runs on DOMContentLoaded, finds all tel inputs and formats them
}
```

Called on:
- DOMContentLoaded (for static inputs in the page)
- `renderCheckoutTab()` (for the checkout tab's dynamic inputs)
- `openAddressModal()` (for the address form input)
- Any future phone input we add

`saveContact()` and `saveAddress()` pass values through `formatPhoneNumber()`
before persisting to ensure the stored value is always in the canonical format.

---

## Consequences

- All phone inputs now have a consistent interaction (format-as-you-type)
- Storage is unified — no need to normalize when looking up customers
- When we integrate a real SMS provider, we convert to E.164 at the API
  call site, not at storage time
- International phone numbers are NOT currently supported. BetterDay is
  Calgary-only, so North American format is fine. If we ever go
  international, this needs a rethink.
- The format helper is defensive — passing in a partial number or a
  pre-formatted number both work correctly

## Known limitations

- No country code support (assumes North American)
- No validation against real phone number lookup services (e.g. Twilio
  Lookup) — a 10-digit number could be fake
- Visual validation is on blur only, not on submit — if user never blurs
  the field the error state won't show until they try to Continue
