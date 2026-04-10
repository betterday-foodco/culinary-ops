# Helcim Integration — Research Notes

> **Status:** 🚧 In progress, research phase
> **Owner:** Conner
> **Started:** 2026-04-09
> **Worktree / branch:** `culinary-ops-helcim-integration` / `conner/2026-04-09-helcim-integration`
> **Companion doc:** `conner/data-model/helcim-integration-plan.md` (implementation spec — not yet written)

This is the research doc for wiring Helcim into the culinary-ops commerce backend. It is **not** an implementation plan — no code, no schemas, no migrations. Its job is to answer every open question about Helcim's API surface so that a follow-up chat can write code against a pinned-down spec.

The companion `helcim-integration-plan.md` translates these findings into a step-by-step NestJS build plan.

---

## 0. Executive summary

🚧 *final version written after §1–§13 are complete. Working draft below.*

**BetterDay's commerce payment model is merchant-initiated card-on-file, not subscription billing.** Every week, our own cron iterates active subscribers with a cart for the delivery week, totals the cart, and calls Helcim's Payment API with a saved card token to charge whatever the customer's cart currently holds. Helcim's Recurring API is not used.

**The core Helcim API surface** is three calls:
1. `POST /v2/helcim-pay/initialize` with `paymentType: "verify"` — tokenize a card without charging (first-time save).
2. `POST /v2/payment/purchase` with `cardData.cardToken` — charge a saved card (every weekly cutoff).
3. `POST /v2/payment/refund` with a prior `transactionId` — refund flow.

**Three critical gaps surfaced during research** that the implementation chat will need to resolve before shipping:

1. **No documented MIT flag.** Helcim's Purchase endpoint has no explicit "card on file" / "merchant initiated" parameter. Either the classification is auto-inferred or it's not enforced at the API level. Needs confirmation from Helcim support. (See §2.1 gap #1, §14.)
2. **`ipAddress` is required on every Purchase call** — including Thursday cron charges where no customer is present. We'll need a `Customer.last_login_ip` field (or similar) to populate this. (See §2.1 gap #2, §13.)
3. **Webhooks are basically useless for e-commerce.** Only two event types are documented, both for physical card terminals. No webhook for refund completion, dispute filed, or card updater. Synchronous response handling covers purchase + refund, but we lose async visibility into disputes entirely unless we build a daily reconciliation cron. (See §2.1 gap #3, §7, §14.)

**Idempotency keys are mandatory** on Payment API calls (5-minute TTL, 409 on collision). This is a built-in protection against double-charging during cron retries — good news.

**Schema impact is small** — the existing commerce schema already has `Customer.helcim_customer_id`, `PaymentMethod.processor_token`, `CustomerOrder.processor_charge_id`. Likely additions: `Customer.last_login_ip`, `PaymentMethod.cof_agreement_at`, `CustomerOrder.charge_attempts`, `WebhookEvent` dedup table. (See §13.)

---

## 1. Our payment model — card-on-file, not subscriptions

BetterDay operates a *managed weekly cart* model, not a fixed-amount recurring subscription. Each week, the customer has a `WeeklyCartRecord` (variable contents, variable total) that they can edit up until the Thursday cutoff. At cutoff, our own cron iterates active subscribers and charges the saved card for the exact amount currently in the cart.

This is a **merchant-initiated transaction (MIT) / card-on-file (CoF)** pattern, not a payment-processor subscription. The `Subscription` model in `backend/prisma/commerce/schema.prisma:270` represents a *business* commitment (cadence, status, savings tier), not a payment-processor subscription object.

### Why not Helcim's Recurring API

Helcim *does* have a Recurring API (Payment Plans, Subscribers, Add-ons, Procedures — mentioned in the API overview), but it's designed for **fixed-cadence fixed-amount** billing like gym memberships and SaaS subscriptions. Our model doesn't fit for three reasons:

1. **Variable amounts.** Each week's total is computed from cart contents + coupons + tax + delivery fee, and isn't known until the Thursday cutoff fires.
2. **Merchant-controlled scheduling.** We decide when to charge based on our own cutoff calendar and skip/pause state, not a static recurrence rule.
3. **Customer-editable up to cutoff.** A subscriber can add meals, remove meals, apply a coupon, or switch to pickup right up until Thursday evening. A payment-processor subscription assumes the amount is locked in at creation time.

A "subscription" in Helcim's world is a commitment to be billed a fixed amount on a fixed schedule. A "subscription" in BetterDay's world is a commitment *to keep receiving weekly cart reminders and have the current cart charged*. Those are different things, and conflating them at the payment layer would force us to fight Helcim's abstractions every single week.

### What each side owns

| Helcim owns | We own |
|---|---|
| Card vault (storing raw PAN, tokenizing) | Scheduling when to charge |
| PCI scope reduction via HelcimPay.js iframe | Retry logic on failed charges |
| Fraud Defender analysis (when `ecommerce: true`) | Dunning (emails, pausing subscriptions) |
| The `/payment/purchase` API | Cart composition + totals + tax calculation |
| Synchronous charge success/failure response | `CustomerOrder` + `WeeklyCartRecord` state |
| Card + customer CRUD endpoints | All customer lifecycle state (status, skip, pause, cancel) |
| Settlement + payout to our bank account | Customer communication at every stage |

### The two distinct payment moments

**Moment 1 — "customer-present, save card":** happens once per customer (at signup checkout, or the first time they add a payment method via their account). Uses HelcimPay.js iframe. Card enters Helcim's vault, we get back a `cardToken` and `customerCode`, we display a stored-credential consent notice, we persist the tokens on our side. This is §4 / Flow A.

**Moment 2 — "merchant-initiated, charge saved card":** happens at every Thursday cutoff, for every active subscriber. Our cron iterates the `WeeklyCartRecord` rows for the delivery week, totals each cart, and POSTs to `/v2/payment/purchase` with `cardData.cardToken` + the saved `customerCode` + an `idempotency-key`. No customer present. No browser. Straight server-to-server. This is §5 / Flow B.

These two flows share the Helcim customer + card tokens but use different APIs (HelcimPay.js `initialize` vs Payment API `purchase`) and have different concerns (PCI compliance vs idempotent retries).

---

## 2. Helcim API surface we consume

All endpoints in this table are verified against `devdocs.helcim.com` as of 2026-04-09. See Appendix A for the specific doc pages consulted.

### Base URL + common headers

- **Base URL:** `https://api.helcim.com/v2/`
- **Versioning:** URL-path versioned. Current is `v2` (docs also reference `v2.2` as a subvariant but the live endpoints still resolve under `/v2/`).
- **Required headers on every request:**
  - `api-token: <token>` — auth
  - `accept: application/json`
  - `content-type: application/json`
- **Required on Payment API specifically:**
  - `idempotency-key: <25-36 alphanumeric chars, may contain - and _>` — **not optional**, returns 400 if missing. 5-minute TTL. Same key + same payload → cached response returned; same key + different payload → 409 Conflict. **This is load-bearing for our cron retry safety** (§5, §6).

### Endpoint reference table

| # | Endpoint | Method | Flow | Purpose |
|---|---|---|---|---|
| 1 | `/helcim-pay/initialize` | `POST` | Flow A (first card save) | Creates a HelcimPay.js checkout session. Returns `{checkoutToken, secretToken}`. Takes `paymentType: verify\|purchase\|preauth`, `amount`, `currency`, optional `customerCode`, `customerRequest`, `setAsDefaultPaymentMethod`. |
| 2 | `/payment/purchase` | `POST` | Flow A + Flow B | Direct charge. In Flow B (weekly charge) we pass `cardData: { cardToken }` to charge a saved card without the customer present. |
| 3 | `/payment/preauth` | `POST` | Not used initially | Authorization hold without capture. Noted for future "hold at order time, capture at ship time" flows. |
| 4 | `/payment/capture` | `POST` | Not used initially | Capture a prior preauth. |
| 5 | `/payment/verify` | `POST` | Possibly Flow A | $0 auth to tokenize a card without charging. Alternative to using HelcimPay.js in `verify` mode — we'll pick one in §4. |
| 6 | `/payment/refund` | `POST` | Refunds (§8) | Full or partial refund of a prior transaction. |
| 7 | `/payment/reverse` | `POST` | Refunds (§8) | Reverse a same-day transaction before it settles. |
| 8 | `/customers` | `POST` | Flow A | Create a Helcim customer. Returns a `customerCode` used in all subsequent calls. |
| 9 | `/customers/{id}` | `GET` / `PUT` | Profile edits | Read or update a customer. |
| 10 | `/customers` | `GET` | Admin | List customers (paginated). |
| 11 | `/customers/{id}/cards` | `GET` | Account UI | List cards saved to a customer. |
| 12 | `/customers/{id}/cards/{cardId}` | `GET` / `DELETE` | Account UI | Get or remove a single saved card. |
| 13 | `/customers/{id}/cards/{cardId}/default` | `PUT` | Account UI | Mark a card as the customer's default. |

Endpoints deliberately **not** in our scope:
- **Recurring API** (Payment Plans, Subscribers, Add-ons, Procedures) — fixed-cadence fixed-amount billing. Doesn't fit our variable-amount merchant-scheduled weekly charge model. See §1 for the rationale.
- **ACH Payment API** — no ACH at launch.
- **Payment Hardware API** — we have no card terminals.
- **Invoice API** — we may use `invoiceNumber` as a cross-reference field on purchases, but we won't build invoices in Helcim. Our `CustomerOrder` table is the source of truth.

### Purchase endpoint — request/response shape (Flow B is the load-bearing call)

**Request** — `POST /v2/payment/purchase` with headers above + `idempotency-key`:

```json
{
  "ipAddress": "string",              // REQUIRED — see §2.1 gap below
  "ecommerce": true,                  // triggers Helcim Fraud Defender — always true for us
  "currency": "CAD",                  // CAD or USD
  "amount": 67.23,                    // Decimal number, 2 places
  "customerCode": "CST-00042",        // Optional per docs, but we always send it
  "invoiceNumber": "BD-2026-04-0012345",   // Our CustomerOrder.display_id
  "cardData": {
    "cardToken": "a63d4eb597114b06bb7a14"   // 23-char saved card reference
  }
}
```

**Response on success (HTTP 200):**

```json
{
  "transactionId": 25764674,
  "cardBatchId": 98765,
  "dateCreated": "2026-04-16T12:00:00-06:00",
  "status": "APPROVED",
  "user": "Helcim System",
  "type": "purchase",
  "amount": 67.23,
  "currency": "CAD",
  "avsResponse": "Y",
  "cvvResponse": "M",
  "cardType": "VI",
  "approvalCode": "123456",
  "cardToken": "a63d4eb597114b06bb7a14",
  "cardNumber": "454545****5454",
  "cardHolderName": "Jose Ramirez",
  "customerCode": "CST-00042",
  "invoiceNumber": "BD-2026-04-0012345",
  "warning": null
}
```

**Failure response (any non-2xx):**

```json
{
  "errors": ["Card declined: insufficient funds"]
}
```

**HTTP status codes** from the Helcim message format doc: `200`, `201`, `202`, `204`, `400`, `401`, `403`, `405`, `409` (idempotency collision), `429` (rate limit), `500`, `522`.

### HelcimPay.js initialize — request/response shape (Flow A is the load-bearing call)

**Request** — `POST /v2/helcim-pay/initialize` with the base headers (no `idempotency-key` required here, it's a session init not a charge):

```json
{
  "paymentType": "verify",            // "verify" = tokenize without charging
  "amount": 0,                        // 0 for verify; real amount for purchase
  "currency": "CAD",
  "customerCode": "CST-00042",        // Attach vault to an existing customer
  "setAsDefaultPaymentMethod": 1,
  "confirmationScreen": false,
  "hideExistingPaymentDetails": 0,
  "displayContactFields": 0
}
```

**Response:**

```json
{
  "checkoutToken": "CHKT-abc123...",
  "secretToken": "SKT-xyz789..."
}
```

Both tokens expire ~60 minutes after issuance. `checkoutToken` goes to the browser to render the iframe via `appendHelcimPayIframe(checkoutToken)`. `secretToken` **stays server-side** and is used to HMAC-verify the browser's postMessage callback (see §4).

### §2.1 — Critical gaps found during API surface mapping

These are things the docs either don't cover or cover in a way that directly affects our design. **Flagged here because they'll shape the §4/§5 flow design and the implementation plan.**

1. **No documented MIT / stored-credential flag on the Purchase endpoint.** ❌
   The Purchase request has `ecommerce: boolean` and that's it — no `cardOnFile`, `storedCredential`, `initiator`, `channel`, or `off_session` parameter documented. Possibilities:
   - **(a)** Helcim auto-infers: any `/v2/payment/purchase` with `cardData.cardToken` + no customer session is implicitly treated as card-on-file.
   - **(b)** Helcim doesn't enforce the Visa/MC stored-credential framework at the API level; compliance is handled through the merchant agreement and terms-of-service the customer accepts in our UI.
   - **(c)** The flag exists but lives on an undocumented Helcim account setting or a support-ticket configuration.
   - **(d)** The flag exists and I missed it in the doc pages I read.
   **Action:** open question — needs confirmation from Helcim support before we ship. See §14.

2. **`ipAddress` is a REQUIRED field on `/payment/purchase`** — and we don't have one for cron-initiated charges. ⚠️
   From the docs: *"IP address of the customer making the transaction, used as part of fraud detection."* For Flow A (customer at checkout) we pass `req.ip`. For Flow B (Thursday cron) there's no customer session. Three candidate strategies:
   - Store the IP of the customer's most recent login on `Customer.last_login_ip` and use that as the "last known customer IP" for subsequent MIT charges.
   - Pass our backend server's outbound IP (constant per Render deploy).
   - Pass the IP the customer originally used to save the card (`PaymentMethod.saved_from_ip`).
   **My recommendation:** add a `Customer.last_login_ip` field and use it for MIT charges, falling back to our server IP if no login has happened yet (e.g. customer saved a card via Apple Pay Express and never opened the app). Needs verification that Helcim's fraud engine accepts stale / server IPs without flagging.
   **Action:** open question — schema proposal in §13, behavior proposal in §5.

3. **Webhooks are basically useless for e-commerce.** ⚠️⚠️⚠️
   The documented webhook events are **only `cardTransaction` and `terminalCancel`** — both for physical card terminals. There are **no webhooks** documented for:
   - Online purchase success/failure (you get it synchronously in the Purchase response, so fine)
   - Refund completion
   - Chargeback / dispute filed
   - Dispute status changes
   - Card updater (network-level card reissue)
   - Customer created
   This is a material departure from what Stripe-style mental models assume. **Implications for our design:**
   - We rely on the **synchronous response** from Purchase for charge state. No async confirmation event.
   - We rely on the **synchronous response** from Refund for refund state.
   - **Disputes/chargebacks** have no programmatic notification. We'd learn about them only by logging into the Helcim dashboard or by a bank debit showing up in settlement reports. This is bad enough that it needs to be escalated as an open question.
   - We should **still build the webhook endpoint** to at least receive `cardTransaction` events (for any future hardware use) and to handle whatever else Helcim quietly adds later.
   **Action:** open question — confirm with Helcim support whether dispute/chargeback webhooks exist under a different name, or whether we need to build a daily reconciliation cron against the Transactions API. See §14.

4. **No card updater / account updater.**
   No documented event for expired-card auto-replacement. We'll need our own "your card is expiring" cron + email nudge. This isn't a blocker but it's extra work we need to plan for. See §9.

5. **`customerCode` format origin is ambiguous.**
   The docs describe it as "unique reference for your customer in the Helcim system" but don't say whether Helcim generates it on `POST /customers` or whether we supply it. Affects whether `Customer.helcim_customer_id` is written at the time we call Helcim or at the time we read the response.
   **Action:** minor — I'll try a test call via the Helcim sandbox in the implementation chat, or ask Helcim support. Default assumption: Helcim generates and returns it.

6. **Sandbox / test environment not yet mapped.**
   The docs reference "developer testing" and test card numbers but don't specify a separate base URL or flag. Needs a follow-up fetch to the "testing" or "sandbox" page. See §10.

---

## 3. Credentials + environments

### Env vars we'll add

| Var | Where | Used for | Notes |
|---|---|---|---|
| `HELCIM_API_TOKEN` | `backend/.env` | Every `/v2/*` API call (backend → Helcim) | Single token, full scope. Generated in Helcim dashboard → All Tools → Integrations → API Access Configurations. |
| `HELCIM_WEBHOOK_VERIFIER_TOKEN` | `backend/.env` | HMAC-verifying incoming webhooks | Separate token from the API token — comes from Helcim dashboard → All Tools → Integrations → Webhooks. Must be base64-decoded before use as the HMAC key. |

**NOT adding** `NEXT_PUBLIC_HELCIM_CHECKOUT_TOKEN` — the old PROJECT_SCOPE mentioned it but the actual HelcimPay.js flow doesn't require a client-side token. The client only needs the `checkoutToken` returned by `/helcim-pay/initialize` on a per-session basis, and the CDN script `https://secure.helcim.app/helcim-pay/services/start.js` is served without auth.

### Auth header

`api-token: <token>` — confirmed in docs and in the betterday-app reference. Not `Authorization: Bearer`. Not `X-API-Key`.

### Token rotation

Via Helcim dashboard. Rotation process:
1. In Helcim dashboard → All Tools → Integrations → API Access Configurations, create a new token.
2. Update `HELCIM_API_TOKEN` in Render's env var dashboard AND `backend/.env` locally (the symlinked copy).
3. Verify a test charge succeeds on the new token.
4. Disable the old token in the dashboard.

**Compromise response:** disable immediately in the dashboard, then rotate.

### Sandbox / test mode

**Not yet mapped.** Needs a follow-up fetch — see §10. Current assumption is that Helcim issues separate tokens for test vs production, but the docs I've read so far don't confirm this.

---

## 4. Flow A — First card save (customer-present)

Runs once per customer, the first time they add a payment method. Can happen at two moments:
- **(a)** During their first checkout — the cart has items, the customer enters their card, we charge them, and the card is saved as a side effect.
- **(b)** In account settings "Add payment method" — no cart, no charge, we're just tokenizing the card for future use.

Both use the same mechanism (HelcimPay.js iframe) with a different `paymentType`.

### Sequence diagram

```
Customer        Browser (client-website)        Our Backend              Helcim
   │                    │                            │                       │
   │  enters cart       │                            │                       │
   │───────────────────>│                            │                       │
   │                    │   POST /commerce/checkout/init                     │
   │                    │───────────────────────────>│                       │
   │                    │                            │  POST /v2/helcim-pay/initialize
   │                    │                            │  { paymentType: "verify"|"purchase",
   │                    │                            │    amount, currency: "CAD",
   │                    │                            │    customerCode?,
   │                    │                            │    setAsDefaultPaymentMethod: 1 }
   │                    │                            │──────────────────────>│
   │                    │                            │                       │
   │                    │                            │   200 { checkoutToken,│
   │                    │                            │         secretToken } │
   │                    │                            │<──────────────────────│
   │                    │                            │                       │
   │                    │                            │ persist HelcimCheckoutSession
   │                    │                            │ (id: checkoutToken,   │
   │                    │                            │  secretToken, customer│
   │                    │                            │  _id, amount, expires_at)
   │                    │                            │                       │
   │                    │  200 { checkoutToken }     │                       │
   │                    │<───────────────────────────│                       │
   │                    │                            │                       │
   │                    │ appendHelcimPayIframe(checkoutToken)                │
   │                    │────────────────────── renders iframe from ────────>│
   │                    │                    secure.helcim.app               │
   │                    │                                                    │
   │  enters card       │                                                    │
   │───────────────────>│  iframe POSTs card details directly to Helcim     │
   │                    │──────────────────────────────────────────────────>│
   │                    │                                                    │
   │                    │                                                    │
   │                    │  window.postMessage({                              │
   │                    │    eventName: 'helcim-pay-js-<token>',            │
   │                    │    eventStatus: 'SUCCESS',                         │
   │                    │    eventMessage: '{ "transactionId": N,            │
   │                    │      "cardToken": "...",                           │
   │                    │      "customerCode": "...",                        │
   │                    │      "cardNumber": "454545****5454",               │
   │                    │      "cardHolderName": "..." }'                    │
   │                    │  })                                                │
   │                    │<─────────────────────────────────────────────────  │
   │                    │                                                    │
   │                    │  POST /commerce/checkout/confirm                   │
   │                    │  { checkoutToken, eventMessage }                   │
   │                    │───────────────────────────>│                       │
   │                    │                            │                       │
   │                    │                            │ SERVER-SIDE VERIFY:   │
   │                    │                            │  - load secretToken   │
   │                    │                            │    via checkoutToken  │
   │                    │                            │  - re-fetch txn from  │
   │                    │                            │    Helcim to confirm  │
   │                    │                            │    it exists + matches│
   │                    │                            │    amount + customerCode
   │                    │                            │  - only then trust it │
   │                    │                            │                       │
   │                    │                            │ persist Customer      │
   │                    │                            │ (helcim_customer_id), │
   │                    │                            │ PaymentMethod         │
   │                    │                            │ (processor_token,     │
   │                    │                            │  cof_agreement_at),   │
   │                    │                            │ CustomerOrder (if purchase)
   │                    │                            │                       │
   │                    │  200 { orderId }           │                       │
   │                    │<───────────────────────────│                       │
   │<───────────────────│                            │                       │
   │  sees confirmation │                            │                       │
```

### The three design decisions in Flow A

**Decision 1: `paymentType` for the init call.**
- **Purchase checkout (cart has items):** `paymentType: "purchase"` + real amount. Helcim charges the card AND saves the card token to the customer's vault in one operation.
- **Account settings "add card" (no cart):** `paymentType: "verify"` + `amount: 0`. Helcim does a zero-dollar verification auth, tokenizes the card, saves it to the vault, doesn't actually charge. This is the closest thing to Stripe's SetupIntent.

**Decision 2: Creating the Helcim customer.**
- If the customer already has `Customer.helcim_customer_id`: pass `customerCode: <existing>` to `/v2/helcim-pay/initialize`. The new card gets saved under that existing customer.
- If they don't: pass `customerRequest: { contactName, cellPhone, billingAddress, ... }` — Helcim creates the customer inline and returns its `customerCode` on the transaction response. We persist it to `Customer.helcim_customer_id`.
- **Alternative:** call `POST /v2/customers` explicitly first, get the `customerCode`, then pass it to `/helcim-pay/initialize`. This is more predictable (two calls, each with clear ownership) and is the pattern I'll recommend in the implementation plan.

**Decision 3: How we trust the browser's postMessage result.**

**This is the betterday-app gap we're not repeating.** The browser can POST anything back to our server claiming "the payment succeeded, here's txnId=99999" — nothing stops a malicious client from fabricating a success event. betterday-app trusts the value blindly. We don't.

After reading the HelcimPay.js SDK source at `secure.helcim.app/helcim-pay/services/start.js`:
- The SDK does NOT contain a `validateHash()` function. Earlier docs mention one, but it's not in the live code. Either it's implemented elsewhere or the docs are out of date.
- The SDK's `watchForExit()` function only listens for `eventStatus === 'HIDE'` and auto-removes the iframe — it does not participate in success/failure delivery.
- Success/failure delivery is entirely handled by the merchant's own `window.addEventListener('message', ...)` code.

**Our verification strategy** (server-side, independent of anything the browser says):

1. Browser POSTs `{ checkoutToken, eventMessage }` to `/commerce/checkout/confirm`.
2. Backend looks up the `HelcimCheckoutSession` row by `checkoutToken` (load from DB, not memory — we need this to survive server restarts, unlike betterday-app's in-memory dict).
3. Backend verifies:
   - The session exists
   - `expires_at > now()`
   - The session hasn't already been confirmed (idempotent — a second POST with the same checkoutToken returns the first order, not a new one)
4. Backend parses the txnId out of `eventMessage`.
5. **Backend calls Helcim directly to look up that transaction** (via whatever endpoint the Transaction History API exposes — 🚧 exact URL TBD from sandbox testing) and verifies:
   - The transaction exists
   - The `amount` matches what the session was initialized with
   - The `customerCode` matches the session's customer
   - The `status === "APPROVED"`
6. Only if all checks pass do we persist the order / card.
7. If any check fails: log, reject the confirm POST with an error, let the customer retry.

This eliminates the browser spoofing attack entirely. The browser just tells us "please go look at txn X," and we go look. The secretToken becomes belt-and-suspenders rather than the primary defense.

### Stored-credential consent UI language

Per Visa/MC rules (and good practice regardless), we must display language at the moment of card capture notifying the customer that we'll charge the card for future weekly orders until they cancel. Draft copy:

> *"By saving this card, you authorize BetterDay to charge it for your weekly meal orders at the price shown in your cart each week, until you pause or cancel your subscription. You can change or remove this card anytime in Account Settings."*

This text will be rendered in the client-website checkout page, in our UI, ABOVE the HelcimPay.js iframe — not inside it. When the customer completes the save, we persist `PaymentMethod.cof_agreement_at: now()` as proof of consent for any future dispute.

Needs legal review before shipping — I'll add this to `conner/deferred-decisions.md` under "Design decisions pending."

### Open items for the implementation plan

- Add `HelcimCheckoutSession` table to the commerce schema (see §13) — tracks active checkout sessions + their secretTokens for the duration of a customer payment, replaces betterday-app's in-memory dict.
- Confirm the exact Helcim "get transaction by ID" endpoint and request shape during sandbox testing.
- Legal review of consent language.

---

## 5. Flow B — Weekly charge (merchant-initiated)

The Thursday cutoff cron flow. No customer present, no iframe, no browser — just our backend calling Helcim directly to charge an already-saved card. This runs once per week per active subscriber.

### Trigger

The cron fires on a schedule we control — proposed: **Thursday at 8:00 PM Mountain Time**, but the exact hour is a product decision separate from this integration. Location: a NestJS `@Cron` decorator on a method in `commerce-checkout/weekly-charge.cron.ts` (new file, see implementation plan).

### Sequence

```
Cron (Thursday cutoff)
   │
   ├── SELECT WeeklyCartRecord
   │   WHERE delivery_week = <this_delivery_week>
   │     AND delivery_status = 'scheduled'
   │     AND order_id IS NULL
   │
   ├── For each row:
   │     │
   │     ├── Lock the row (SELECT ... FOR UPDATE SKIP LOCKED)
   │     │
   │     ├── Compute order total
   │     │   - Sum line items from cart_items JSONB
   │     │   - Apply subscriber discount (from Subscription.savings_tier)
   │     │   - Apply coupons (from CustomerCoupon with status='applied')
   │     │   - Add tax (from §11 — AB GST 5% v1)
   │     │   - Add delivery fee
   │     │
   │     ├── Resolve payment method
   │     │   - customerCode = Customer.helcim_customer_id
   │     │   - cardToken = Subscription.default_payment → PaymentMethod.processor_token
   │     │   - If either is null → mark order `payment_method_missing`, skip, notify customer
   │     │
   │     ├── Build idempotency key
   │     │   - Format: `<order_display_id>-<attempt_number>` (e.g. "BD-2026-04-0012345-1")
   │     │   - Attempt number comes from CustomerOrder.charge_attempts (starts at 1)
   │     │   - 25-36 char alphanumeric + hyphens — matches Helcim's format requirement
   │     │
   │     ├── Call POST https://api.helcim.com/v2/payment/purchase
   │     │   Headers:
   │     │     api-token: <HELCIM_API_TOKEN>
   │     │     accept: application/json
   │     │     content-type: application/json
   │     │     idempotency-key: BD-2026-04-0012345-1
   │     │   Body:
   │     │     {
   │     │       "ipAddress": "<Customer.last_login_ip or server IP fallback>",
   │     │       "ecommerce": true,
   │     │       "currency": "CAD",
   │     │       "amount": 67.23,
   │     │       "customerCode": "CST-00042",
   │     │       "invoiceNumber": "BD-2026-04-0012345",
   │     │       "cardData": { "cardToken": "a63d4eb597114b06bb7a14" }
   │     │     }
   │     │
   │     ├── On HTTP 200 + status "APPROVED":
   │     │   - Create CustomerOrder row (or update if already exists from cart confirmation)
   │     │   - Set processor_charge_id = response.transactionId
   │     │   - Set status = 'confirmed'
   │     │   - Set confirmed_at = now()
   │     │   - Increment Subscription.lifetime_orders + lifetime_spend
   │     │   - Update WeeklyCartRecord.order_id + processed_at
   │     │   - Award points (RewardPointsTransaction)
   │     │   - Send order confirmation email
   │     │
   │     ├── On HTTP 200 + status "DECLINED":
   │     │   - Increment CustomerOrder.charge_attempts
   │     │   - Persist CustomerOrder.last_charge_error = errors[0]
   │     │   - Schedule retry per §6 retry policy
   │     │
   │     ├── On HTTP 409 (idempotency collision):
   │     │   - This means we already submitted the same key with a different payload
   │     │   - Should NEVER happen if we're disciplined about key construction
   │     │   - Log alert, do not retry with the same key, page on-call
   │     │
   │     ├── On HTTP 401/403:
   │     │   - Token revoked or permissions wrong — halt the entire cron, page on-call
   │     │
   │     ├── On HTTP 429 (rate limit):
   │     │   - Back off per Retry-After header if present, else 60s
   │     │   - Resume the loop from the next row
   │     │
   │     └── On HTTP 500/522 or timeout:
   │           - Record as transient failure
   │           - Re-enqueue for retry in 15 minutes (Helcim side issue)
```

### Why `customerCode` is sent even though it's optional

The Helcim docs mark `customerCode` as optional on `/payment/purchase`. We always send it anyway, for three reasons:

1. **Audit clarity** — every charge in the Helcim dashboard is linked to a customer automatically, no manual reconciliation.
2. **The reconciliation cron (§7) can filter by `customerCode`** when scanning for disputes or discrepancies.
3. **It may be load-bearing for stored-credential classification** — until we get clarity on gap #1 (MIT flag), sending `customerCode` alongside `cardToken` is the closest thing to saying "this is a known customer, we have a standing relationship."

### Idempotency key construction

The format `<order_display_id>-<attempt_number>` is deliberately human-readable. Example:

- First attempt: `BD-2026-04-0012345-1`
- Retry after decline: `BD-2026-04-0012345-2`
- Retry after another decline: `BD-2026-04-0012345-3`

Why attempt number and not a timestamp or UUID:
- **Deterministic from state.** We can reconstruct the exact key that was used for any past attempt by reading `CustomerOrder.charge_attempts`. No UUID lookup table needed.
- **Protects against in-flight retries.** If the cron crashes mid-call and restarts, the restart computes the same key and gets Helcim's cached response (or the cached error) instead of double-charging.
- **Human-readable in logs.** When something goes wrong, grepping logs for `BD-2026-04-0012345-*` shows every attempt on that order.

The trade-off: if we ever change the key format mid-flight (e.g., refactor the display_id scheme), old attempts won't deduplicate against new ones. Mitigation: never change the format without a flag day.

### Server-side IP for `ipAddress` (gap #2)

Pending resolution via Helcim support (§14 Q2), the proposed populate logic:

```
ipAddress = Customer.last_login_ip
         ?? PaymentMethod.saved_from_ip
         ?? process.env.SERVER_PUBLIC_IP
         ?? "0.0.0.0"
```

This requires two new schema fields (§13) and Render's public IP published in an env var. The fallback to `"0.0.0.0"` is a last-resort — if we hit it, something went wrong with the earlier options and we should alert.

### Failure = notification + retry, not silent

Every decline triggers a customer email within 5 minutes of the cron attempt, regardless of whether we'll auto-retry. The email says: *"We couldn't process your weekly order payment. We'll try again in 6 hours. To update your card sooner, visit [Account → Payment Methods]."* After the final retry fails, the subscription moves to `paused_indefinite` and the email changes to "Subscription paused — please update your card to resume." See §6 for the full state machine.

---

## 6. Failure handling + retries

### The unhelpful error format

Helcim returns errors as `{ errors: <string | object> }`. Per the docs:

- 401 auth failure: `{ "errors": "Unauthorized" }` (string)
- 400 validation failure: `{ "errors": { "cardData[cardNumber]": "Missing required data..." } }` (object with field keys)
- Payment decline: presumably a string or array — docs are unclear. **There is no machine-readable decline code**. The only signal we get is English text. Retry logic has to pattern-match phrases, which is brittle.

**Action:** during sandbox testing (§10) we deliberately generate every decline type and record the exact error strings so we can build a `decline-classifier.ts` that maps known phrases to categories.

### Proposed decline classifier (best effort, refined in sandbox)

| Category | Example phrases | Our action |
|---|---|---|
| **Retryable — transient** | "Try again", "Temporary failure", "Network timeout", "Processor unavailable" | Retry immediately (5-min backoff). Don't count against attempt budget. |
| **Retryable — funds** | "Insufficient funds", "Exceeds withdrawal limit", "Do not honor" | Count as attempt, retry per schedule (6h, then 24h, then 48h). |
| **Fatal — card issue** | "Expired card", "Invalid card number", "Stolen card", "Lost card", "Pick up card" | Do NOT retry. Pause the subscription immediately. Email customer. |
| **Fatal — auth issue** | "Declined", "Do not honor" (ambiguous), "Call issuer" | Count as attempt but lower retry budget (1 retry only, not 3). |
| **Fatal — fraud** | "Fraud suspected", "Pickup card", anything AVS/CVV hard fail | Do NOT retry. Flag the account in admin. Email customer to contact support. |
| **Unknown** | Anything not matched above | Log at WARN, treat as retryable-transient, alert on-call if seen >5 times per day. |

### Retry policy (proposed)

For non-fatal declines:

```
Attempt 1 → cron fires at Thursday cutoff
  ↓ decline
Attempt 2 → 6 hours later (same day)
  ↓ decline
Attempt 3 → 24 hours later (Friday evening)
  ↓ decline
Attempt 4 → 48 hours later (Sunday morning — last chance before delivery week starts)
  ↓ decline
Give up → Subscription → paused_indefinite, email customer, unblock delivery week
```

Four attempts over ~3 days. Balances "don't spam the bank with declines" (which can hurt our merchant standing) against "give the customer time to top up their account."

### State machine — `SubscriptionStatus` transitions on failure

```
active
  │
  │ charge_attempts = 1 → declined (retryable)
  ├───────────> active (UI shows warning banner "Payment failed, retrying")
  │
  │ charge_attempts = 4 → all attempts exhausted
  ├───────────> paused_indefinite (UI shows "Subscription paused — update card to resume")
  │
  │ charge_attempts = 1 → declined (fatal card issue)
  └───────────> paused_indefinite (immediate pause, email explains why)
```

Resume path: customer updates card → `PaymentMethod` is swapped → admin or customer action sets `Subscription.status = 'active'` → next Thursday's cutoff picks them up normally.

### Customer-facing email copy

Three emails needed:

1. **First decline (retryable)** — *"We couldn't charge your card for this week's order. We'll try again automatically in 6 hours. If you'd like to update your card now, visit Account → Payment Methods."*
2. **Final decline (give-up after 4 attempts)** — *"We've been unable to charge your card for this week's order after several attempts. Your subscription has been paused. When you're ready to resume, update your payment method in Account Settings and your next week's order will resume automatically."*
3. **Fatal decline (expired / stolen / fraud)** — *"Your weekly order couldn't be processed because your card is [expired/invalid/flagged by your bank]. Please update your payment method in Account Settings to resume your subscription."*

Copy needs the marketing voice review (same one that handles coupon error messages — see `conner/deferred-decisions.md`). Not a blocker for implementation but the placeholder copy must clearly not be final.

### Interaction with skip/pause/cancel

- **Customer skipped this week** (`WeeklyCartRecord.delivery_status = 'skipped'`): cron does NOT charge, no attempt recorded. Cart becomes inert until next week.
- **Customer paused subscription** (`Subscription.status = 'paused'` or `paused_indefinite`): cron does NOT charge, no WeeklyCartRecord is even generated for that week.
- **Customer cancelled** (`Subscription.status = 'cancelled'`): same as paused — no generation, no charge.
- **Customer has an empty cart** (all items removed before cutoff): cron does NOT charge, mark the WeeklyCartRecord as `skipped`, no delivery that week.

---

## 7. Webhooks

### Helcim's webhook coverage is sparse

Per the public `/docs/webhooks` page (2026-04-09), Helcim documents **only two webhook event types**:

| Event type | Scope | Payload shape |
|---|---|---|
| `cardTransaction` | Payment Hardware (physical terminal) transactions | `{ "id": "<txnId>", "type": "cardTransaction" }` |
| `terminalCancel` | Payments cancelled on device before processing | `{ "type": "terminalCancel", "data": { "cancelledAt", "currency", "customerCode", "deviceCode", "invoiceNumber", "transactionAmount" } }` |

Both are hardware-terminal events. **Neither applies to our e-commerce flow.** There are no documented webhooks for:

- Online purchase success/failure (we get these synchronously from the Purchase response)
- Refund completion (we get this synchronously from the Refund response)
- Chargeback / dispute filed
- Dispute status updates
- Card updater / account updater events
- Customer created / updated
- Settlement / payout

### Consequence: we can't rely on async events for disputes

This is the single biggest departure from how a Stripe-style integration works. If a customer disputes a charge weeks after the fact, no webhook fires. We'd learn about it either by logging into the Helcim dashboard manually, or by noticing a settlement debit in our bank reconciliation.

**Per the product decision in Milestone A: we're building a daily reconciliation cron** as the primary mechanism for learning about disputes, refunds, and any state changes that happen outside our direct API calls.

### Daily reconciliation cron — the dispute fallback

```
Daily Reconciliation Cron (runs at 6:00 AM MT)
   │
   ├── Fetch yesterday's Helcim transactions
   │   - Via Transaction History API (exact endpoint TBD from sandbox testing — the legacy
   │     docs URL timed out during research; confirmed to exist but shape not verified)
   │   - Filter: dateRange = yesterday ± 1 day (overlap handles timezone edge cases)
   │
   ├── For each transaction from Helcim:
   │     ├── Parse transactionId, type (purchase/refund/dispute/etc.), amount, customerCode
   │     │
   │     ├── Look up our CustomerOrder by processor_charge_id = transactionId
   │     │
   │     ├── If found:
   │     │    ├── Compare statuses — does Helcim's status match ours?
   │     │    ├── If Helcim shows REFUNDED and we don't: create OrderRefund row,
   │     │    │   update CustomerOrder.status = 'refunded', notify customer
   │     │    ├── If Helcim shows DISPUTED and we don't: create Dispute row,
   │     │    │   update CustomerOrder, pause Subscription, alert admin
   │     │    ├── If Helcim shows REVERSED: similar to refund
   │     │    └── If statuses match: no-op
   │     │
   │     └── If NOT found:
   │          ├── This is a transaction we don't know about
   │          ├── Log + alert (should not happen in normal flow, indicates:
   │          │   - A charge that happened outside our system (manual Helcim dashboard charge)
   │          │   - A reconciliation bug
   │          │   - A race condition between cron runs)
   │
   ├── Record reconciliation run in a ReconciliationLog table
   │   (for audit and to detect gaps if cron fails to run)
   │
   └── Email daily summary to ops team if any discrepancies found
```

**What this cron can and cannot detect:**

- ✅ Refunds initiated from the Helcim dashboard (someone on ops processes a refund manually)
- ✅ Disputes / chargebacks that land on existing transactions
- ✅ Transactions that happened outside our system
- ❌ Real-time notification — there's a 6-to-30-hour delay depending on when the cron runs
- ❌ Nothing the Transaction History API doesn't expose — if disputes live in a separate API, we need to hit that too

**Open item:** verify the Transaction History API actually returns dispute info, not just charges/refunds. Added to §14 Q11.

### The webhook endpoint we're still building

Even though the documented webhooks are useless for e-commerce, we're still building a functioning webhook receiver because:

1. **Future-proofing.** Helcim may quietly add events (e.g., a `disputeCreated` event) that we want to catch the moment they exist.
2. **`cardTransaction` events might fire for e-comm charges** — the docs only describe them in the context of terminals but the field `customerCode` appears in the `terminalCancel` payload, suggesting these events may apply more broadly. Sandbox testing in the implementation chat will verify.
3. **HMAC verification infrastructure is reusable** — once we have the NestJS raw-body middleware + signature verifier written, adding new event types later is a 10-line change.

### Endpoint design

- **Path:** `POST /api/commerce/helcim/webhook`
- **Auth:** none (public — Helcim posts to us from their infrastructure, can't supply an API token)
- **Verification:** HMAC-SHA256 check on the raw body before parsing
- **Response:** `204 No Content` on success, `400` on signature mismatch (do NOT `500` — that tells Helcim to retry, which we don't want for bad signatures)

### HMAC verification procedure

From the docs:

```
signedContent = webhook-id + "." + webhook-timestamp + "." + raw-body
hmac_key = base64_decode(HELCIM_WEBHOOK_VERIFIER_TOKEN)
expected_signature = HMAC_SHA256(signedContent, hmac_key)
valid = constant_time_compare(expected_signature, webhook-signature header)
```

Three headers must be present:
- `webhook-id` — unique event ID from Helcim
- `webhook-timestamp` — ISO timestamp, should be within 5 minutes of now (reject older to prevent replay)
- `webhook-signature` — the HMAC Helcim computed

### NestJS raw-body gotcha

NestJS's default body parser is `express.json()`, which consumes the raw body and replaces it with a parsed object. **HMAC verification needs the raw bytes**, not the parsed object (JSON serialization is not canonical — `{"a":1}` and `{ "a": 1 }` hash differently).

The fix in NestJS:

```typescript
// main.ts
const app = await NestFactory.create(AppModule, { bodyParser: false });
app.use('/api/commerce/helcim/webhook', express.raw({ type: 'application/json' }));
app.use(express.json()); // default parser for every other route
```

And in the controller, access the raw bytes via `req.rawBody`. This is documented in NestJS's "Raw body" cookbook — not novel, but easy to miss and causes confusing "valid signature rejected" errors when forgotten.

### Idempotency — the `WebhookEvent` dedup table

Helcim retries webhooks on non-2xx response per this schedule: immediately, 5s, 5m, 30m, 2h, 5h, 10h, 10h. Same event can arrive twice. To guard against double-processing:

```prisma
model WebhookEvent {
  id              String   @id          // webhook-id header value
  type            String
  received_at     DateTime @default(now())
  processed_at    DateTime?
  signature_valid Boolean
  raw_body        String
  result          String?              // "processed" | "skipped_duplicate" | "error"
  error_detail    String?

  @@index([type, received_at])
  @@index([processed_at])
}
```

Logic: first thing the controller does is `findOrCreate({ id: webhookId })`. If `processed_at` is set, return 204 immediately without re-processing. Otherwise process, then set `processed_at`.

---

## 8. Refunds, disputes, chargebacks

### Refund endpoint

`POST https://api.helcim.com/v2/payment/refund`

**Required body:**
```json
{
  "originalTransactionId": 25764674,
  "amount": 67.23,
  "ipAddress": "10.0.0.1"
}
```

**Optional body:**
```json
{
  "ecommerce": true
}
```

**Required header:** `idempotency-key` (same 25–36 char format as Purchase)

**Response:** same `SuccessfulPaymentResponse` shape as Purchase — you get a new `transactionId` for the refund, plus `type: "refund"`, `status`, `amount`, etc. The original `originalTransactionId` is NOT echoed back in the response, so we must track the link ourselves.

### Partial refunds

Supported natively — pass `amount` < original. Helcim tracks the running refunded total server-side and rejects refunds that would exceed the original amount. We should mirror that check on our side for better UX (show "available to refund: $X" in the admin).

### Who initiates refunds

Two paths:

**(a) Admin-initiated** (the common case): Conner or an ops person opens the admin UI, picks an order, clicks "Refund." Our backend calls `/v2/payment/refund`, persists an `OrderRefund` row, updates `CustomerOrder.status = 'refunded'` (or `partially_refunded`), emails the customer.

**(b) Automatic / business rules** (edge case): e.g. a cancelled subscription with a pending order is auto-refunded. Same API call, just triggered by a cron / event handler instead of an admin click.

**Never customer-initiated directly** — customers file a refund request via support, we process it manually. No "refund button" in the customer UI.

### `ipAddress` for admin-initiated refunds

Same gap as Purchase (§2.1 gap #2). Options:

1. Admin's browser IP (we'd pass `req.ip` from the admin's session)
2. Our server IP
3. The original transaction's IP (stored on `CustomerOrder`)

**Recommendation:** pass the admin's browser IP. It's the most "honest" value and gives Fraud Defender a real human IP to look at if they're doing any cross-check.

### Reverse vs Refund

Helcim has two related endpoints:

- `POST /v2/payment/refund` — creates a new refund transaction, can be partial, works at any time after the original
- `POST /v2/payment/reverse` — reverses a transaction before it settles (same day), as if it never happened

For our use case, **refund is always the right call** because by the time a refund is processed, the original will usually have settled. Reverse is a card-terminal optimization we don't need for e-commerce.

### Disputes and chargebacks

As established in §7: **Helcim does not publicly document any webhook, endpoint, or notification for dispute filed / chargeback opened**. This is the single largest gap in the Helcim integration and remains blocked on the open question in §14 Q3.

**Planned handling until clarified:**

- **Detection:** via the daily reconciliation cron (§7) — whenever a transaction's status in Helcim diverges from ours, we treat it as a dispute signal and page the admin.
- **Business reaction:** when a dispute is detected, we create a `Dispute` row, freeze the `PaymentMethod` (mark as `disputed` so it's not used for next week's charge), move the `Subscription` to `paused_indefinite`, and alert ops via email.
- **Evidence submission:** handled manually via the Helcim dashboard for v1. An admin gathers the order details (line items, delivery confirmation, customer correspondence), uploads them to Helcim's dispute UI. Automating this is a v2+ feature. Added to `conner/deferred-decisions.md`.

### Refunds from a disputed transaction

If Helcim auto-refunds a disputed charge (standard chargeback behavior), the refund shows up in the reconciliation cron the next morning. Our cron creates the `OrderRefund` row, updates the `CustomerOrder.status = 'refunded'`, records that it was dispute-driven (as opposed to admin-initiated) on a new field `OrderRefund.reason = 'dispute'`. No customer email in this case — the customer already knows, they're the one who filed the dispute.

---

## 9. Card updater / expired card handling

### What the docs say (nothing)

The Helcim Cards doc page documents `cardExpiry` as a stored field in MMYY format but **does not mention**:

- Account Updater / Automatic Billing Updater (the Visa / Mastercard service that auto-replaces cards when banks reissue)
- Any webhook event for expired cards
- Any auto-refresh of `cardToken` when the underlying card is reissued
- Any "card expiring soon" notification

**Assumption going forward:** Helcim does **not** support network-level account updater. Our integration must handle expired cards entirely on our own.

**Open question:** confirm with Helcim support whether any form of account updater is available as an add-on service. Added to §14 Q4. If it turns out to exist, we'll adopt it — but we're not blocking on it.

### Our fallback: "card expiring soon" email cron

```
Card Expiry Cron (runs daily at 9:00 AM MT)
   │
   ├── SELECT PaymentMethod
   │   WHERE is_default = true
   │     AND processor = 'helcim'
   │     AND expires_within(30 days OR 14 days OR 3 days)
   │     AND last_expiry_warning_sent_at < now() - 7 days  (avoid spamming)
   │
   ├── For each card:
   │     ├── Email customer: "Your card ending in {last4} expires {expMonth/expYear}.
   │     │   Update it in Account Settings to avoid a pause in your weekly delivery."
   │     │
   │     └── UPDATE PaymentMethod SET last_expiry_warning_sent_at = now()
```

Three escalating touchpoints: 30 days out (soft nudge), 14 days out (firmer), 3 days out ("update today or your next delivery will skip"). After expiry passes, the weekly charge fails naturally and falls into the retry state machine from §6.

### What happens when expiry hits and nothing was updated

Flow:
1. Card expires mid-week.
2. Thursday cutoff cron attempts charge.
3. Helcim returns a decline with "expired card" text.
4. Decline classifier (§6) categorizes as **fatal — card issue**.
5. No retry. Subscription immediately moves to `paused_indefinite`.
6. "Your card expired" email fires.
7. When the customer updates their card via Account Settings, they click "Resume subscription" — next Thursday picks them up.

### Schema additions for this flow

Proposed to `PaymentMethod`:

```prisma
last_expiry_warning_sent_at  DateTime?
```

Tracks the last warning email so we don't re-send every day. Added to §13.

---

## 10. Sandbox / test mode

### Getting a test account

Helcim doesn't have a self-serve sandbox. Per their docs:

1. Email **`tier2support@helcim.com`** (note: NOT the generic support address)
2. Provide: existing Helcim merchant ID + a description of what you want to test
3. Wait for manual provisioning

⚠️ **Disclaimer from their docs:** *"Receiving a test account is not confirmation that a new merchant to Helcim would be approved for processing."* — i.e., a test account is not an endorsement that your use case will pass compliance review.

**Since we already have a production Helcim account** (the one set up "briefly" for betterday-app per the 2026-04-09 conversation), we should request a test account from that same merchant ID to get one with the right organization attached.

### Environment topology

- **Same base URL** — `https://api.helcim.com/v2/` for both test and production
- **Same endpoints** — identical request/response shapes
- **Different API token** — test accounts issue a distinct `api-token` that only works against their own test data
- **Different webhook verifier token** — test accounts issue their own `HELCIM_WEBHOOK_VERIFIER_TOKEN`
- **No `?test=true` query flag needed** (this is a legacy Helcim.js pattern, not HelcimPay.js)

### Env var split for local vs production

```env
# backend/.env (local dev — symlinked across worktrees)
HELCIM_API_TOKEN="<test_account_token>"
HELCIM_WEBHOOK_VERIFIER_TOKEN="<test_account_verifier>"

# Render production — set in Render dashboard, not in .env
HELCIM_API_TOKEN="<production_account_token>"
HELCIM_WEBHOOK_VERIFIER_TOKEN="<production_account_verifier>"
```

Switching from test to production is just swapping the token. No code changes. No URL changes. No flag.

### Test card numbers

From the docs:

| Card | Number | Expiry | CVV | Notes |
|---|---|---|---|---|
| Visa | `4242 4242 4242 4242` | Any future date | Any 3 digits | Classic success card |
| Mastercard | `5454 5454 5454 5454` | Any future date | Any 3 digits | Classic success card |
| Amex | `3782 8224 6310 005` | Any future date | Any 4 digits | Amex is 4-digit CVV |

### Simulating declines

Helcim documents a **CVV trick**: pass a CVV value of `200` or higher to trigger a decline in the Payment API. This is a clever testing mechanism because it's inert in production (real cards have 3-digit CVVs 000-999, of which only a few are actually valid for any given card).

**Actionable:** in the implementation chat, we'll write a `sandbox-test.ts` script that runs every decline variation (`CVV=200`, `CVV=500`, `CVV=999`) and records the exact error string returned, populating the decline classifier from §6.

### Sandbox webhook behavior

**Not documented.** We don't know if webhooks fire in test mode, and if so whether the verifier token is the same as production's.

**Action:** test in sandbox during implementation. If webhooks don't fire in test mode, we'll need to write a fake webhook sender script to exercise the HMAC verifier.

### Production cutover checklist

When we're ready to go live:

1. [ ] Generate production API token in Helcim dashboard under `BetterDay Food Co` account
2. [ ] Generate production webhook verifier token
3. [ ] Update Render's env vars (NOT `backend/.env` — that stays pointed at test)
4. [ ] Run a $1 test charge through the live customer-website UI
5. [ ] Issue a $1 refund against that charge
6. [ ] Verify both show up in the Helcim production dashboard
7. [ ] Verify the daily reconciliation cron picks up both events the next morning
8. [ ] Disable the test account's API token (so an accidental `.env` leak can't be used maliciously)
9. [ ] Document the cutover date in `conner/deferred-decisions.md` under "Resolved"

---

## 11. Tax (gap analysis — no decision)

Helcim has no built-in tax calculation equivalent to Stripe Tax. The amount we pass to `/v2/payment/purchase` is the final total the customer will be charged — tax must be computed on our side before the API call.

This section is **gap analysis only**. The final decision is a product + legal question that should be handled separately from this integration work, by someone with Canadian tax expertise.

### Canadian tax basics (non-expert summary — verify before relying on)

- **GST** (Goods & Services Tax) — 5% federal, applies to most taxable goods & services across Canada
- **HST** (Harmonized Sales Tax) — replaces GST + provincial sales tax in 5 provinces: ON (13%), NS (15%), NB (15%), NL (15%), PEI (15%)
- **PST** (Provincial Sales Tax) — separate provincial tax in BC (7%), SK (6%), MB (7%)
- **QST** (Quebec Sales Tax) — 9.975% in Quebec, stacked on GST
- **Alberta** — GST only (5%), no provincial sales tax — **our home province and primary market**
- **Basic groceries are typically GST/HST exempt** — but prepared meals sold ready-to-eat are NOT considered "basic groceries" under CRA rules and ARE taxable. Our meals fall into the taxable bucket. Verify with an accountant.

### Option A — Hardcoded Alberta GST 5%

**For:** simplest possible implementation, zero external dependencies, correct for ~100% of our launch market (we're AB-only at start), can ship with the rest of the integration.

**Against:** breaks the moment we ship to a second province. Every expansion requires code changes. No audit trail.

**Implementation cost:** ~1 hour. Add a constant, multiply by it in `commerce-checkout/tax.service.ts`, store as `tax` field on `CustomerOrder`.

### Option B — Third-party service (TaxJar, Avalara, Stripe Tax via API)

**For:** handles every province correctly out of the box, handles exemptions (basic groceries vs prepared meals), handles tax holidays, audit-ready.

**Against:** monthly cost (~$20-$200/mo depending on volume), new external dependency (another thing that can fail at cutoff time), integration time (1-3 days).

**Implementation cost:** depends on service. TaxJar is the most widely used for small merchants; Stripe Tax only works if you're on Stripe, which we're not.

**Interesting:** since we're on Helcim not Stripe, Stripe Tax is NOT available as a standalone service. It's tightly coupled to Stripe's payment processing. This rules out what would otherwise be the obvious pick.

### Option C — Manual admin-configured rates per region

**For:** in-house, no external dependency, scales to a handful of provinces, admin can tune rates as rules change.

**Against:** real work for ops to keep current, error-prone (rates change, holidays happen), doesn't handle exemptions automatically, no audit.

**Implementation cost:** 1-2 days. Adds a `TaxRate` table keyed by province + effective date, admin UI to edit, a service that looks up the right rate per order.

### Recommended path (but not a decision)

**Start with Option A for v1**, with a `TaxCalculator` interface that has a single `computeTaxCents(order): number` method. Swap in a different implementation later without touching any caller code. This lets us ship with the rest of the integration, move to Option B or C when we expand beyond AB, and never have to rip out anything.

Decision blocker: **get an accountant to confirm our meals are in fact taxable under CRA rules** before we commit to Option A's 5% constant. If it turns out prepared meal subscriptions fall under a different classification, we need to know that now, not after we've billed 50 customers.

**Added to `conner/deferred-decisions.md`:** 
- *(Design decisions pending)* Tax calculation strategy — hardcoded AB 5% vs TaxJar vs manual, contingent on accountant review of meal classification

---

## 12. Compliance checklist

Card-network and PIPEDA requirements the implementation must satisfy. Each item references either a specific control to build or a question to resolve before shipping.

### PCI DSS — SAQ A scope

- [ ] **HelcimPay.js iframe is the only card-entry surface.** No `<input name="cardNumber">` anywhere in `conner/client-website/`, no card data touches our backend, no card data touches our logs.
- [ ] **Production `backend/.env` never contains raw card data.** Only API tokens, which are secrets but not card data.
- [ ] **Backend logs redact any field that might contain card data.** If `cardNumber` or `cardCVV` ever appears in a request body that's logged (e.g. for debugging), it must be masked before the log line is written. Add a Pino serializer or NestJS log interceptor.
- [ ] **HTTPS enforced on every inbound request** to `/api/commerce/*` — already handled by Render.

### Stored-credential framework (Visa / Mastercard)

- [ ] **Consent language shown at card capture.** Exact copy in §4. Must be visible BEFORE the customer submits the HelcimPay.js form.
- [ ] **`PaymentMethod.cof_agreement_at` timestamp persisted** at the moment of consent, with the exact copy version stored as `PaymentMethod.cof_agreement_text_version` for audit.
- [ ] **MIT flag correctly set on every merchant-initiated charge** — 🚧 **pending resolution of §14 Q1**. Placeholder: we send `customerCode` + `cardToken` + `ecommerce: true` and hope that's sufficient. Update this after Helcim support clarifies.
- [ ] **Customer can see the stored card in Account Settings** (last4, brand, expiry, consent date).
- [ ] **Customer can remove the stored card** at any time via Account Settings → Payment Methods → Remove. Uses `DELETE /v2/customers/{id}/cards/{cardId}`.
- [ ] **Removing the default card pauses the subscription** immediately (can't charge what we don't have).

### Cancellation path (anti-dark-pattern)

- [ ] **Customer can cancel their subscription self-service** without calling support. Cancel button in Account Settings → Subscription → Cancel. No "chat with us" wall.
- [ ] **Cancellation confirmation email fires within 5 minutes** of cancellation.
- [ ] **Cancelled subscription triggers no further charges** — cron's `WHERE` clause filters out `status = 'cancelled'`.

### Audit trail (for dispute defense)

- [ ] **Every charge has a full provenance record**:
  - `CustomerOrder.placed_at` — cart locked in
  - `CustomerOrder.confirmed_at` — Helcim charge approved
  - `CustomerOrder.processor_charge_id` — Helcim's transaction ID
  - `CustomerOrder.billing_contact` JSONB snapshot
  - `CustomerOrder.line_items` JSONB snapshot (immutable post-placement)
  - `PaymentMethod.cof_agreement_at` — when consent was given
  - `Customer.last_login_ip` — most recent customer IP (used for MIT ipAddress field)
- [ ] **Every charge attempt is logged** in an append-only table (`ChargeAttempt`?) — request sent, response received, error string if any. Never deleted.
- [ ] **Email delivery is logged** — order confirmation, charge failure, payment updated, etc. — so we can prove to a dispute reviewer that we notified the customer.
- [ ] **Admin actions on orders** (refund, reversal, manual status change) are logged with the admin user and timestamp.

### PIPEDA (Canadian privacy)

- [ ] **Privacy policy in `brand/site-info.seed.json` explicitly covers**:
  - Storage of Helcim customer code and card tokens
  - Purpose of storage (recurring weekly charges)
  - Retention period (for active subscribers + N years after cancellation per CRA tax requirements)
  - Customer's right to request deletion
- [ ] **Customer data deletion on request** — if a customer asks us to delete their data, we can delete their `Customer` row + cascade everything in commerce, and separately call `DELETE /v2/customers/{id}` in Helcim to remove their vault entry. Some records must be retained for tax purposes — document what and for how long.
- [ ] **Data breach notification procedure** — who gets notified within what window if our database leaks.

### Things that are NOT our responsibility

- Card number storage — that's Helcim's PCI scope, not ours
- Network tokenization — Helcim does it (or doesn't — see §9)
- Fraud scoring — Helcim Fraud Defender runs when `ecommerce: true` is set
- Interchange rate negotiation — that's the Helcim merchant agreement, handled outside this integration

### Sign-off required from

- **You (Conner)** — consent copy review, customer-facing email copy review
- **Accountant** — meal taxability classification (§11), retention period requirements (PIPEDA checklist above)
- **Lawyer (light review)** — consent language one-off review before first production charge
- **Helcim support** — the three blocking open questions in §14

---

## 13. Schema gap analysis

Walks the current `backend/prisma/commerce/schema.prisma` against what the research turned up. Lists what's already there, what's missing, and proposes additions — **but does not create migrations**. Those happen in the companion implementation plan doc.

### Already covered (no action needed)

| Field | Location | Purpose |
|---|---|---|
| `Customer.helcim_customer_id String?` | `schema.prisma:154` | Stores Helcim's `customerCode`. Written after the first `POST /customers` call. |
| `PaymentMethod.processor PaymentProcessor @default(helcim)` | `schema.prisma:248` | Enum includes `helcim`, `apple_pay`, `google_pay`. |
| `PaymentMethod.processor_token String` | `schema.prisma:249` | Stores Helcim's `cardToken`. |
| `PaymentMethod.brand CardBrand` | `schema.prisma:250` | Enum: `visa`, `mc`, `amex`, `disc`, `other`. Helcim returns `cardType` as `VI`/`MC`/`AX`/`DI` — we map. |
| `PaymentMethod.last4 String` | `schema.prisma:251` | Pulled from Helcim's `cardNumber` field (F6L4 format, last 4 digits). |
| `PaymentMethod.exp_month Int`, `exp_year Int` | `schema.prisma:252-253` | Pulled from Helcim's `cardExpiry` (MMYY). |
| `PaymentMethod.is_default Boolean` | `schema.prisma:254` | Mirrors Helcim's default card designation (`PUT /customers/{id}/cards/{cardId}/default`). |
| `CustomerOrder.processor_charge_id String?` | `schema.prisma:344` | Stores Helcim's `transactionId` as a STRING (even though Helcim returns it as a number — we stringify on the way in for flexibility). |
| `CustomerOrder.payment_method_id String?` | `schema.prisma:348` | FK to `PaymentMethod`, identifies which saved card was used. |

### Proposed additions (to be migrated in the implementation chat)

#### On `Customer`

```prisma
// For the MIT ipAddress requirement on /v2/payment/purchase
last_login_ip     String?   // IP of most recent login, populated by auth middleware
```

**Why:** `/v2/payment/purchase` requires `ipAddress`. For customer-present flow we use `req.ip`. For the Thursday cron MIT flow we have no session, so we fall back to the customer's most recent login IP. See §5.

#### On `PaymentMethod`

```prisma
// Stored-credential consent audit (Visa/MC compliance)
cof_agreement_at              DateTime?   // When the customer agreed to save the card for future charges
cof_agreement_text_version    String?     // e.g. "v1-2026-04-09", lets us reconstruct what they saw
saved_from_ip                 String?     // IP address at the moment of tokenization — fallback for MIT ipAddress

// Card expiry warning throttling
last_expiry_warning_sent_at   DateTime?   // Prevents spamming the customer daily as expiry approaches

// Dispute freeze
is_disputed                   Boolean   @default(false)   // Set true when reconciliation finds a dispute; prevents reuse
disputed_at                   DateTime?
```

**Why:**
- `cof_agreement_*` — proves consent at dispute time. If a customer claims "I never agreed to be charged weekly," we have the date + copy version to show.
- `saved_from_ip` — a second-choice fallback for §5 ipAddress if `Customer.last_login_ip` is null.
- `last_expiry_warning_sent_at` — the card expiry cron (§9) needs this to avoid re-sending daily.
- `is_disputed` / `disputed_at` — set by the reconciliation cron (§7) when Helcim shows a dispute; prevents using the same card for next week's charge.

#### On `CustomerOrder`

```prisma
// Retry state machine (§6)
charge_attempts               Int         @default(0)       // Increments each time we POST /v2/payment/purchase
last_charge_attempt_at        DateTime?
last_charge_error             String?                       // Last error string from Helcim, for customer emails + debugging
next_charge_retry_at          DateTime?                     // When to retry next; null means no retry scheduled

// MIT audit (§12 compliance checklist)
mit_indicator                 Boolean     @default(false)   // true = merchant-initiated (cron), false = customer-present (checkout)
charge_initiated_by           String?                       // "customer" | "cutoff_cron" | "admin_manual"
charge_ip_address             String?                       // The value we passed in the ipAddress field — for audit

// For faster reconciliation cron queries
@@index([processor_charge_id])
```

**Why:** 
- Retry state — the cron needs to know how many times it's tried and when to try again. Today's schema has none of this.
- MIT audit — separate from the consent audit on PaymentMethod; this is per-charge.
- `processor_charge_id` index — the reconciliation cron looks up orders by Helcim transaction ID; without an index we'd full-scan the table every morning.

#### New table — `HelcimCheckoutSession`

```prisma
model HelcimCheckoutSession {
  id                String   @id              // = the checkoutToken returned by /helcim-pay/initialize
  secret_token      String                    // The secretToken Helcim returned (for potential hash verification)
  customer_id       String?                   // Null for unauthenticated guests, set for logged-in customers
  payment_type      String                    // "purchase" | "verify" | "preauth"
  amount            Decimal  @db.Decimal(10, 2)
  currency          String   @default("CAD")
  
  created_at        DateTime @default(now())
  expires_at        DateTime                  // = created_at + 60 minutes
  
  confirmed_at      DateTime?                 // When the customer returned from the iframe
  confirmed_order_id String? @unique          // FK to CustomerOrder (for purchase flow)
  
  @@index([customer_id])
  @@index([expires_at])                       // For cleanup cron
}
```

**Why:** replaces betterday-app's in-memory `_token_store` dict with a persistent, multi-instance-safe store. Required for:
- Surviving backend restarts mid-checkout
- Working across multiple Render dynos
- Being able to "resume" a checkout on the customer's next visit
- Giving the confirmation endpoint (§4 step 2) a place to look up the secretToken + session metadata without trusting the browser

Cleanup: daily cron deletes rows where `expires_at < now() - 7 days` (keep a week of history for debugging, then purge).

#### New table — `WebhookEvent`

```prisma
model WebhookEvent {
  id              String   @id              // = webhook-id header from Helcim
  type            String                    // "cardTransaction" | "terminalCancel" | ... (future)
  received_at     DateTime @default(now())
  processed_at    DateTime?
  signature_valid Boolean                   // false = we rejected it; log anyway for audit
  raw_body        String   @db.Text          // Raw JSON as received, for debugging + replay
  result          String?                   // "processed" | "skipped_duplicate" | "ignored_event_type" | "error"
  error_detail    String?  @db.Text
  
  @@index([type, received_at])
  @@index([processed_at])
}
```

**Why:** idempotent webhook handling (§7). Helcim retries webhooks on failure, so the same event can arrive multiple times. The controller's first action is `findOrCreate({ id: webhookId })` — if it was already processed, return 204 without re-running any business logic.

#### New table — `ReconciliationLog`

```prisma
model ReconciliationLog {
  id                    String   @id @default(uuid())
  run_at                DateTime @default(now())
  period_start          DateTime                      // The date range we queried
  period_end            DateTime
  transactions_fetched  Int      @default(0)
  matched_ok            Int      @default(0)          // Helcim + our DB agree
  discrepancies_found   Int      @default(0)          // Diffs that required action
  disputes_found        Int      @default(0)
  refunds_found         Int      @default(0)
  unknown_transactions  Int      @default(0)          // Helcim has a txn we don't know about
  errors                String?  @db.Text             // Any cron-level errors
  duration_ms           Int?
  
  @@index([run_at])
}
```

**Why:** the daily reconciliation cron (§7) needs an audit trail — proves it ran every day, shows ops what was found, lets us detect when the cron stops running.

#### New table — `OrderRefund`

```prisma
enum RefundReason {
  admin_goodwill             // CS comped the order
  admin_quality_issue        // Order was wrong, customer complained, refunded
  admin_cancelled_delivery   // Delivery route failed, full refund
  dispute                    // Dispute auto-refunded by Helcim
  system_error               // Something went wrong in fulfillment
  other
}

model OrderRefund {
  id                        String       @id @default(uuid())
  order_id                  String
  processor_refund_id       String                      // Helcim's new transactionId for the refund
  amount                    Decimal      @db.Decimal(10, 2)
  reason                    RefundReason @default(other)
  reason_note               String?                     // Free-text admin note
  initiated_by              String                      // "admin:conner" | "reconciliation_cron" | "system"
  initiated_at              DateTime     @default(now())
  completed_at              DateTime?                   // When Helcim returned success
  
  order                     CustomerOrder @relation(fields: [order_id], references: [id])
  
  @@index([order_id])
  @@index([processor_refund_id])
}
```

**Why:** today's schema treats refunds as a status change on `CustomerOrder.status`, which is too flat — it can't represent partial refunds, multiple refunds against the same order, or distinguish admin refunds from dispute auto-refunds. A separate ledger table solves all three.

**Related change to `CustomerOrder`:** add status values `partially_refunded` to the `OrderStatus` enum (`schema.prisma:107-115`). The existing `refunded` value stays for fully-refunded orders.

### Migrations — not in this chat

All of the above is proposed shape, not applied. The implementation chat will:

1. Create a new Prisma migration `20260410000000_helcim_integration_support` (name tentative)
2. Run against the `dev` Neon branch (`br-icy-river-akvz3mg6`)
3. Verify the schema compiles and the TypeScript client regenerates
4. Commit the migration + regenerated client changes
5. Apply to `main` Neon branch only after end-to-end sandbox testing passes

---

## 14. Open questions

*Running list — items that public docs don't answer and will need Helcim support / sandbox testing / a product decision before the implementation chat can proceed.*

### Blocking (must resolve before shipping)

1. **Does Helcim enforce a Visa/MC stored-credential framework flag on MIT charges, and if so what's the parameter name?**
   The Purchase endpoint docs show no `cardOnFile` / `storedCredential` / `initiator` / `off_session` parameter. Three scenarios:
   - Helcim auto-infers it from the `cardToken` + no-customer-session context ✅ good for us
   - Helcim doesn't enforce it at the API level, it's handled in the merchant agreement ✅ good for us
   - The flag exists but is documented elsewhere ❌ we'd need to find it
   **Resolution path:** email Helcim support describing our use case (weekly variable-amount MIT charges against saved cards) and ask for explicit guidance on the correct request shape.

2. **What IP address should we send on cron-initiated `/payment/purchase` calls?**
   `ipAddress` is a required field, described as "IP address of the customer making the transaction, used as part of fraud detection." Our cron runs on a Render backend with no customer session. Options: last known customer IP, our server IP, the IP the customer used when originally saving the card. Whatever we pick, we need to confirm Helcim's fraud engine doesn't flag the value as suspicious.
   **Resolution path:** ask Helcim support + test in sandbox.

3. **Are there Helcim webhooks for disputes, chargebacks, or refunds that aren't in the public docs?**
   The public webhooks page lists only `cardTransaction` and `terminalCancel`. If disputes truly have no notification mechanism, we need to build a daily reconciliation cron against the Transactions API (or pull from settlement reports). That's a significant add to the scope of this integration.
   **Resolution path:** email Helcim support, ask explicitly: *"When a customer disputes a charge, what notification does our merchant backend receive, if any?"*

### Non-blocking (can ship, resolve later)

4. **Does Helcim support network-level account updater** (Visa Account Updater / Mastercard Automatic Billing Updater)?
   Not documented. If yes: we need to handle a "card updated" event and refresh `PaymentMethod.processor_token` + `exp_month`/`exp_year`. If no: we need a "card expiring" email cron 30 days before expiry.
   **Resolution path:** ask Helcim support. Don't block the initial ship on this — build the email cron as a fallback regardless.

5. **Is `customerCode` merchant-supplied or Helcim-generated on `POST /customers`?**
   Docs describe it as "unique reference" but don't specify. Affects whether we write `Customer.helcim_customer_id` before or after the API call.
   **Resolution path:** test in sandbox — the answer falls out of the first `POST /customers` response.

6. **HelcimPay.js `verify` mode vs direct `/payment/verify` endpoint — which is the right save-card flow?**
   Both exist. HelcimPay.js `verify` uses the iframe (customer enters card, we get a token). `/payment/verify` is a direct $0 auth (we'd need the raw card, which defeats the PCI-scope reduction). **Obvious answer: HelcimPay.js `verify`**, but we should confirm that mode actually returns a reusable `cardToken` rather than just a single-use auth reference.
   **Resolution path:** test in sandbox.

7. **Does the HelcimPay.js `verify` mode attach the tokenized card to an existing `customerCode` if one is passed to `initialize`, or does it create a floating card that we then have to associate manually?**
   Ideal: passing `customerCode` to `initialize` + `paymentType: verify` causes Helcim to save the new card directly to that customer's vault, and we read it back via `GET /customers/{id}/cards`.
   **Resolution path:** test in sandbox.

8. **What's the exact `validateHash()` / secretToken verification algorithm?**
   Docs mention it exists but don't give the algorithm. Since we're relying on this to close the spoofing gap that betterday-app left open, we need the exact bytes.
   **Resolution path:** read the HelcimPay.js client SDK source (it's served from `https://secure.helcim.app/helcim-pay/services/start.js` — we can fetch and inspect it) OR ask support.

9. **Sandbox environment — separate base URL, separate token, or a flag?**
   Docs reference test card numbers but don't describe the environment topology.
   **Resolution path:** the "Testing" section of devdocs, which I haven't fetched yet. Will be answered in §10.

10. **Decline code taxonomy for retry-vs-fatal decisions.**
    Purchase response on failure is `{ errors: [...] }` — an array of strings. There's no machine-readable decline-reason code structure documented. If all we get is a string, our retry logic has to pattern-match English phrases, which is brittle.
    **Resolution path:** make many deliberate declines in sandbox (expired card, insufficient funds, stolen card) and record what each actually returns.

---

## Appendix A — Sources consulted

### Helcim documentation (devdocs.helcim.com)

- [Overview of Helcim API](https://devdocs.helcim.com/docs/overview-of-helcim-api) — top-level API resource list
- [Authentication with the Helcim API and HelcimPay.js](https://devdocs.helcim.com/docs/authentication-with-the-helcim-api-and-helcimpayjs) — `api-token` header confirmed
- [API Message Format](https://devdocs.helcim.com/docs/api-message-format) — JSON request/response, required headers, HTTP status codes
- [Idempotency](https://devdocs.helcim.com/docs/idempotency) — mandatory on Payment API, 5-min TTL, 25–36 char format
- [Payment API overview](https://devdocs.helcim.com/docs/payment-api) — endpoint list (Purchase, Preauth, Capture, Verify, Refund, Reverse)
- [Process Purchase Transaction](https://devdocs.helcim.com/reference/purchase) — full request/response schema for `/v2/payment/purchase`
- [Overview of HelcimPay.js](https://devdocs.helcim.com/docs/overview-of-helcimpayjs) — iframe model, `appendHelcimPayIframe` / `removeHelcimPayIframe`, `validateHash`
- [Initialize a HelcimPay.js Checkout Session](https://devdocs.helcim.com/docs/initialize-helcimpayjs) — narrative version
- [Creates a HelcimPay.js Checkout Session](https://devdocs.helcim.com/reference/checkout-init) — API reference for `/v2/helcim-pay/initialize`
- [Customer API](https://devdocs.helcim.com/docs/customer-api) — `/customers` CRUD + `/customers/{id}/cards/*`
- [Cards](https://devdocs.helcim.com/docs/cards) — Card object schema, `cardToken` format
- [Processing with Card Tokens](https://devdocs.helcim.com/docs/processing-with-card-tokens) — saved-card flow description
- [Webhooks](https://devdocs.helcim.com/docs/webhooks) — only `cardTransaction` and `terminalCancel` documented; HMAC-SHA256 with `webhook-signature`/`webhook-timestamp`/`webhook-id` headers

### External reference code

- `betterday-foodco/betterday-app` Flask app — `app.py:1706-1766` (`/api/helcim/checkout` init endpoint) and `templates/work.html:907-2139` (HelcimPay.js client integration). **Read for API-shape confirmation only**; culinary-ops will build from scratch per the decision in this chat on 2026-04-09.

### Still to consult (upcoming research rounds)

- Helcim sandbox / testing page (§10)
- Helcim refund API reference (§8)
- HelcimPay.js client SDK source at `https://secure.helcim.app/helcim-pay/services/start.js` — for the `validateHash()` implementation (§14 Q8)
- Helcim support emails (for the three blocking open questions in §14)

---

## Appendix B — Deferred-decisions entries generated by this doc

Edge cases, pending design decisions, and TODOs that surfaced during research. Each of these is (or will be) appended to `conner/deferred-decisions.md` under the appropriate section. This appendix is a one-stop audit trail of what *this* chat added.

### 🔮 Edge cases to handle later

- **[2026-04-09] Card removed from Helcim customer vault while it's the subscription's default**
  If someone deletes a card via the Helcim dashboard directly (not via our admin), our `PaymentMethod.processor_token` becomes orphaned. The next cron charge fails with an "invalid card token" error. Need to detect this and either (a) refresh from `GET /customers/{id}/cards` periodically or (b) treat the error as "card removed" in the decline classifier.

- **[2026-04-09] Customer cancels Helcim card from the reconciliation cron finding an unknown transaction**
  The daily reconciliation cron may find a Helcim transaction we don't have a `CustomerOrder` for. Could happen if: (a) an admin processed a manual charge in the Helcim dashboard, (b) a race condition between the weekly cron and the reconciliation cron, (c) a reconciliation bug. Need a policy for how to handle unknown transactions — just log? alert? auto-create a placeholder order?

- **[2026-04-09] Two worktrees running the weekly cron simultaneously**
  In dev, if two chats both have the backend running and both cron schedules fire, both will try to charge the same cart. Idempotency key prevents the double-charge but the orders would both exist. Mitigation: disable the weekly cron in dev entirely, only run it manually via a dev-only endpoint.

- **[2026-04-09] Helcim checkout session expires mid-entry**
  `checkoutToken` + `secretToken` are valid for ~60 minutes. If a customer opens the checkout modal, walks away to make dinner, comes back 90 minutes later, the iframe fails silently. UI needs to detect this (via a timestamp check) and gracefully re-initialize instead of showing a broken form.

### 🎯 Design decisions pending

- **[2026-04-09] Tax calculation strategy — hardcoded AB 5% vs TaxJar vs manual**
  See §11 of helcim-integration.md. Contingent on an accountant confirming our prepared meals are taxable under CRA rules (i.e. not classified as "basic groceries"). Ship Option A (hardcoded 5%) unless the accountant says otherwise, with a `TaxCalculator` interface that lets us swap strategies later.

- **[2026-04-09] Stored-credential consent copy — legal review**
  Draft language in §4 of helcim-integration.md. Needs a light legal review before first production charge. Not urgent — can ship to sandbox without it, but cannot ship to production without it.

- **[2026-04-09] Customer-facing decline email copy**
  Three emails: first decline, final decline (give-up), fatal decline (expired/stolen). Draft copy in §6 of helcim-integration.md. Needs the same marketing-voice review that coupon errors need. Track alongside coupon error copy in `conner/deferred-decisions.md`.

- **[2026-04-09] Which dispute fallback strategy — daily reconciliation cron vs manual dashboard check**
  ✅ **Resolved in this chat (2026-04-09):** daily reconciliation cron. See §7.

### 🛠️ Implementation TODOs

- **[2026-04-09] Helcim Customer API `POST /customers` call — verify `customerCode` is server-generated**
  Research couldn't confirm whether the `customerCode` field is merchant-supplied or Helcim-generated. Test in sandbox — the first `POST /customers` call will show which. Affects whether `Customer.helcim_customer_id` is written before or after the API call.

- **[2026-04-09] Build `decline-classifier.ts` from sandbox testing**
  Generate every decline variation (CVV=200, 500, 999; expired card; etc.) and record the exact error string Helcim returns. Populate the classifier in §6.

- **[2026-04-09] Confirm exact Helcim "get transaction by ID" endpoint**
  Server-side verification in §4 step 5 depends on this. Either a direct endpoint (e.g. `GET /v2/payment/transactions/{id}`) or via the Transaction History API. Verify in sandbox.

- **[2026-04-09] Write a sandbox webhook sender script**
  If Helcim's sandbox doesn't fire real webhooks, we need a local script that constructs a signed webhook body and POSTs it to our dev backend for HMAC verification testing.

- **[2026-04-09] Email Helcim tier2support@helcim.com to request a test account**
  Provide existing merchant ID + description of the use case. Wait for manual provisioning before the implementation chat can do sandbox testing.

- **[2026-04-09] Draft Helcim support email covering the three blocking open questions**
  §14 Q1 (MIT flag), Q2 (ipAddress for MIT), Q3 (dispute webhooks). One email, three questions. Draft in the implementation chat before going to production.

### 💡 Future ideas

- **[2026-04-09] Port culinary-ops Helcim patterns back to betterday-app**
  Once the culinary-ops integration is stable, translate the NestJS patterns (secretToken validation, persistent checkout session, webhook HMAC, reconciliation cron) back to betterday-app's Flask codebase. The betterday-app Helcim integration is a first draft with known shortcuts; our NestJS work will be the canonical pattern.

- **[2026-04-09] Automated dispute evidence submission**
  When the reconciliation cron detects a dispute, gather the order details (line items, delivery confirmation, customer correspondence), format them into Helcim's evidence template, and submit via API — if Helcim exposes an evidence-submission endpoint. Currently handled manually via the Helcim dashboard.

- **[2026-04-09] Pre-authorization + delayed capture for perishable orders**
  Instead of charging Thursday, pre-auth on Thursday and capture on delivery day. Locks in the funds without collecting them until the meal actually ships. Protects against "we charged you, then fulfillment failed, now refund." Uses `/v2/payment/preauth` + `/v2/payment/capture`. Extra complexity, but better customer experience for delivery failures.

- **[2026-04-09] Helcim Recurring API for non-subscription products**
  If we ever sell something that IS a fixed-amount subscription (e.g., a monthly meal-planning coaching add-on at $29/mo), that's where Helcim's Recurring API fits. Out of scope for the cart-based core product.
