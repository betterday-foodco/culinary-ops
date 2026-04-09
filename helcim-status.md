# Helcim Integration — Project Status

> **Written:** 2026-04-09
> **Audience:** Conner (non-technical) + any future Claude chat picking this up
> **Companion docs:**
> - `conner/data-model/helcim-integration.md` — the research doc (what Helcim's API does)
> - `conner/data-model/helcim-integration-plan.md` — the implementation plan (how to build it)
> - **This file** — where we are right now + what to do next

**This file is the "where are we?" document.** If you haven't touched the Helcim project in a while and need to get back up to speed, start here. If a new Claude chat is picking up the work, have it read all three docs in this order: `helcim-status.md` → `helcim-integration.md` → `helcim-integration-plan.md`.

---

## 🎯 TL;DR — The 30-second version

**What Helcim is:** your payment processor (Canadian alternative to Stripe).

**What we're building:** The backend plumbing to (a) save a customer's credit card when they first order, and (b) automatically charge that saved card every Thursday for whatever is in their weekly meal cart.

**Where we are:** The backend code is **~90% written**. The database is ready. 8 commits are pushed to the branch `conner/2026-04-09-helcim-integration`. Everything compiles cleanly. But **we haven't made a single real API call to Helcim yet** because we need a test account from them first.

**What's next:** Email `tier2support@helcim.com` to request a developer test account (1–2 business day wait). Once credentials arrive, we can do the first real sandbox test. After that, there are three specific questions Helcim's support team needs to answer before we can go fully live in production.

**When you can actually charge real customers:** When the customer-facing checkout HTML is built AND the cart-to-order logic is built AND Helcim answers the three questions AND legal reviews the consent copy. Those four tracks can happen in parallel.

---

## 🗺️ The big picture — why this took so much work

### What Helcim does in one sentence
Helcim stores credit card numbers securely (so you don't have to) and charges them when you tell it to.

### The key realization
I originally thought BetterDay needed a "subscription" in the payment-processor sense — like how Netflix charges you $15.99 every month automatically. You corrected me: BetterDay doesn't work that way. Every week is a **fresh cart** with a **different total**, and you don't know what that total is until the Thursday cutoff. That's not a subscription in the Netflix sense — it's called **card-on-file** in the industry. You save the card once, then charge it whatever amount you want, whenever you want, within the agreement the customer signed when they saved it.

This distinction saved us from a lot of wasted work. Helcim has a "Recurring API" specifically for Netflix-style fixed-amount subscriptions, and it would have been the wrong tool for you. Instead, we use Helcim's normal "charge this card" API, triggered by our own Thursday-night cron job.

### Why this is actually simpler
- **We** decide when to charge (Thursday 8pm Mountain Time)
- **We** decide how much (whatever the customer's cart totals)
- **We** handle retries if the bank declines
- **We** handle pausing subscriptions if a card expires
- **Helcim** just stores the card and does the charge when we ask

Less coupling to Helcim. More control for us. Easier to swap processors later if needed.

### The one catch
Because we're doing "merchant-initiated" charges (no customer is sitting in front of a browser when the Thursday cron fires), there are some industry rules (from Visa and Mastercard) about how to mark those charges so banks don't reject them as suspicious. Helcim's documentation doesn't fully explain how to comply with those rules, which is why we have three open questions for their support team.

---

## ✅ Status at a glance

### What's done and working

| Thing | Status | Notes |
|---|---|---|
| Research — understand Helcim's entire API | ✅ Done | 1,430-line research doc with 13 sourced pages |
| Implementation plan | ✅ Done | 1,355-line step-by-step plan |
| Database schema design | ✅ Done | 4 new tables, 15 new fields, 1 new enum |
| Database migration applied to dev | ✅ Done | Live on Neon dev branch, verified with prisma migrate status |
| TypeScript types for Helcim API | ✅ Done | 5 type files, ~250 lines covering every request/response shape |
| Low-level Helcim HTTP client | ✅ Done | Typed wrapper for 11 Helcim endpoints |
| Error classification | ✅ Done | `HelcimApiError` class with helpers for retry decisions |
| Session storage (replace betterday-app's broken in-memory dict) | ✅ Done | `HelcimCheckoutSession` table + repository |
| Webhook signature verification | ✅ Done | HMAC-SHA256 with constant-time comparison + replay protection |
| Idempotency key builder | ✅ Done | Deterministic format survives cron restarts |
| "Save a card" backend endpoint | ✅ Done | `POST /api/commerce/checkout/init` |
| "Confirm the card save" backend endpoint | ✅ Done | `POST /api/commerce/checkout/confirm` |
| Thursday weekly charge cron | ✅ Done | Scaffolded, guarded off in dev |
| Charge-a-saved-card function | ✅ Done | Handles approved / declined / errored / network-failed |
| Admin manual trigger for testing | ✅ Done | `POST /api/admin/commerce/checkout/weekly-charge/run-once` |
| Refund endpoint | ✅ Done | `POST /api/admin/commerce/orders/:orderId/refund` — supports partial refunds, validates against order total, writes to ledger |
| Webhook receiver endpoint | ✅ Done | `POST /api/commerce/helcim/webhook` with full verification + dedup |
| Daily reconciliation cron | ✅ Done (degraded) | Skeleton runs, records audit log row, but doesn't fetch transactions yet |
| Card expiry warning cron | ✅ Done (degraded) | 30/14/3-day warnings with throttling — logs instead of emails |
| 3 crons wired + scheduled | ✅ Done | Disabled in dev to prevent cross-worktree collision |
| TypeScript compiles cleanly | ✅ Done | `npx tsc --noEmit` exits 0 |
| Pushed to GitHub | ✅ Done | Branch `conner/2026-04-09-helcim-integration`, 8 commits |

### What's blocked + why

| Thing | Blocked on | Estimate |
|---|---|---|
| First sandbox API test | Helcim test account (email `tier2support@helcim.com`) | 1–2 business days |
| Confirming the "get transaction by ID" endpoint path | Sandbox access | Immediate once unblocked |
| Replacing guessed decline patterns with real ones | Sandbox access | 1 hour once unblocked |
| Wiring the Transaction History API | Sandbox access + endpoint URL from Helcim support | Depends on support reply |
| Going fully live in production | Three support questions + one-off live test | Depends on Helcim |
| The weekly charge cron actually creating orders | Cart-to-order pipeline (doesn't exist in any chat yet) | Multi-day separate workstream |
| Customer-facing checkout HTML | Client-profile chat is touching that folder in parallel | Resume after they merge |
| Customer card management UI (list/delete/default) | Same as above | Same |
| Real email delivery on failures/warnings | Shared email service (doesn't exist yet) | Medium-size separate task |
| Stored-credential consent copy approval | Legal review | Fast but external |
| Tax calculation strategy | Accountant review of meal classification | External |

---

## 🛠️ What's been built — phase by phase

This is the human-readable version. For the machine-readable version, read the git commit messages on the branch.

### Phase 0 — Research (commit `1f6b479`)

**Two very long reference documents** live in `conner/data-model/`:
- `helcim-integration.md` — 1,430 lines covering every Helcim endpoint we touch, what it does, what it returns, what can go wrong, and how we handle each case. Includes a "gaps" section that flags three things Helcim's public docs don't explain.
- `helcim-integration-plan.md` — 1,355 lines spelling out the step-by-step build in 7 phases, with file lists, class signatures, test checklists, and acceptance criteria.

Also updated:
- `conner/deferred-decisions.md` — added 17 new entries across 4 categories (edge cases, design decisions, TODOs, future ideas)
- `PROJECT_SCOPE.md` §14 — replaced the stale "research Helcim Recurring API" TODO with a pointer to the new docs

**Why this phase mattered:** Without the research, I would have built against guesses. The three open questions (MIT flag, ipAddress on cron charges, dispute webhooks) were all discovered during research and flagged as blockers before any code was written. Better to find those gaps on paper than in production.

### Phase 0.5 — Database drift fix (commit `7e9a49c`)

Mid-work, I discovered another parallel Claude chat (`client-profile-data-model`) had applied a migration to the shared Neon development database that my branch didn't know about. If I'd ignored it and run my own migration, Prisma would have refused.

**What I did:** Copied the missing migration file + one schema field (`Customer.diet_plan_id`) from the other branch onto mine, verified with `prisma migrate status`, and committed it as a clearly-labeled "chore" commit so the history shows exactly what was borrowed and why.

**Why this phase mattered:** Multi-chat workflows create this kind of drift. It will come up again. The commit message is written as a template for how to handle it next time.

### Phase 1 — Foundation (commit `a2a39d2`)

The biggest commit: 16 files, 1,690 lines added.

**What got built:**

1. **Environment variables** added to `backend/.env.example`:
   - `HELCIM_API_TOKEN` — the secret key from Helcim
   - `HELCIM_WEBHOOK_VERIFIER_TOKEN` — separate secret for verifying webhook signatures
   - `SERVER_PUBLIC_IP` — the backend's public IP address (needed for the fallback IP logic)

2. **Database migration** — edited `backend/prisma/commerce/schema.prisma` and generated + applied migration `20260410000000_helcim_integration_support`:
   - New field `Customer.last_login_ip`
   - 6 new fields on `PaymentMethod` (consent timestamp + version, saved-from IP, last warning date, disputed flag + timestamp)
   - 7 new fields on `CustomerOrder` (retry state machine + MIT audit trail)
   - `OrderStatus` enum gained `partially_refunded`
   - 4 new tables: `HelcimCheckoutSession`, `WebhookEvent`, `ReconciliationLog`, `OrderRefund`
   - New enum `RefundReason`
   - 4 new indexes for fast lookups

3. **The new NestJS module** `backend/src/modules/commerce-checkout/` with:
   - `commerce-checkout.module.ts` — the main module file, wired into `app.module.ts`
   - `helcim/helcim-api-client.ts` — the low-level HTTP wrapper. Knows how to talk to Helcim: adds the right headers, handles the `idempotency-key` on Payment API calls, parses JSON responses, throws typed errors on failure.
   - `helcim/helcim-api-error.ts` — the error class. Has helper methods like `isIdempotencyConflict()`, `isAuthError()`, `isRateLimit()`, `isTransient()` so callers can make smart retry decisions without pattern-matching on strings.
   - `helcim/helcim-checkout-session.repository.ts` — CRUD for the in-flight checkout sessions. Replaces the broken in-memory dict from betterday-app.
   - `helcim/decline-classifier.ts` — maps Helcim's free-text decline messages to categories (retryable_transient, retryable_funds, fatal_card, fatal_auth, fatal_fraud, unknown). **⚠️ Patterns are placeholders** — will be replaced once sandbox testing gives us real strings.
   - `helcim/hmac-verifier.ts` — verifies webhook signatures using HMAC-SHA256 with constant-time comparison (prevents timing attacks).
   - `helcim/helcim.service.ts` — the "business logic" layer. At this phase it contains the helper methods (idempotency key builder, IP fallback chain, error classifier) plus method stubs for the flows that get filled in during Phases 2-4.
   - `helcim/types/` — 5 files with TypeScript types for every Helcim request and response shape, so the IDE autocompletes correctly and typos get caught at compile time.

### Phase 2 — Checkout endpoints (commit `92c460a`)

The two customer-facing endpoints that handle saving a card:

1. **`POST /api/commerce/checkout/init`** — the browser calls this when a customer is about to enter their card. The server calls Helcim's `/helcim-pay/initialize` endpoint, gets back two tokens (a public `checkoutToken` for the browser and a secret `secretToken` that stays on our side), stores the session in the database, and returns just the public token.

2. **`POST /api/commerce/checkout/confirm`** — the browser calls this after HelcimPay.js reports that the card was saved successfully. The server looks up the session, validates it's not expired or already confirmed, parses the transaction ID the browser reported, and marks the session as confirmed.

**⚠️ One known gap** is documented loudly in the code: the confirm endpoint does NOT yet verify the transaction by calling Helcim directly to look up its status. Instead, it trusts what the browser reported. This is a security gap (a malicious browser could fake a transaction ID) that we're closing once we confirm Helcim's "get transaction by ID" endpoint path in the sandbox. Until then, every call logs a big WARN line so we don't forget. The daily reconciliation cron (Phase 5) is the backup mechanism that would catch any mismatch.

### Phase 3 — Weekly charge cron (commit `2166bc0`)

**Added dependency:** `@nestjs/schedule@^6.1.1` (the cron library).

**Filled in the real body of `HelcimService.chargeSavedCard()`:** this is the function that actually charges a saved card. Handles all four possible outcomes cleanly:
- HTTP 200 + status "APPROVED" → success
- HTTP 200 + status "DECLINED" → the bank said no (classify why, return a structured result)
- HelcimApiError thrown → categorize (auth error, rate limit, idempotency conflict, or normal decline)
- Unknown error (network, timeout) → treat as transient, schedule a retry

It **never throws** exceptions to the caller — every possible outcome maps to a `ChargeResult` object the cron can pattern-match on. No try/catch plumbing needed upstream.

**Built `WeeklyChargeCron` service** with three cron-decorated methods:
- `runCutoff()` — Thursday 8pm Mountain Time, iterates WeeklyCartRecord rows and charges each one
- `runRetrySweep()` — hourly, picks up orders whose retry time has arrived
- `processOne(recordId)` — public entry point used by both the cron loop and the manual admin trigger. Validates the record state, calls `chargeSavedCard`, returns the result.

**All crons are disabled in dev by design.** A guard in the constructor checks `NODE_ENV` — unless it's `production` or `ENABLE_CRONS_IN_DEV=true` is set, the scheduled methods early-return. This prevents multiple worktrees from double-charging during parallel development.

**Built an admin manual trigger** at `POST /api/admin/commerce/checkout/weekly-charge/run-once` — takes a cart record ID, calls `processOne`, returns the result. Protected by the existing staff JwtAuthGuard. This is the endpoint you'd use to test a single charge against the Helcim sandbox without waiting for Thursday.

**⚠️ Big limitation documented in two TODO blocks:** `processOne()` doesn't yet build a proper `CustomerOrder` row from the cart. The cart-to-order logic (tax calculation, coupon application, subscriber discount, points, delivery fee, order number generation) doesn't exist in any chat yet. The scaffold charges with a placeholder amount equal to the sum of cart line-item prices, no adjustments. Once the cart module is built, the TODO blocks spell out exactly what to fill in.

### Phase 4 — Refunds (commit `2c0c978`)

**Filled in `HelcimService.refundCharge()`** — same pattern as `chargeSavedCard()` but for refunds. Returns a discriminated result type (`approved` / `rejected` / `system_error`) so callers don't need try/catch.

**Built `OrderRefundRepository`** — the ledger for refund records. Supports:
- `createForOrder(...)` — persist a refund after a successful Helcim call
- `sumForOrder(orderId)` — sum all refunds for an order, used to validate partial refunds don't exceed the total
- `listForOrder(orderId)` — get refund history for the admin UI

**Built the admin refund endpoint** `POST /api/admin/commerce/orders/:orderId/refund`:
1. Validates the order exists and was charged via Helcim
2. Computes the maximum refundable amount (order total minus prior refunds)
3. Rejects if the requested refund exceeds that maximum
4. Builds a deterministic idempotency key based on prior refund amount (prevents accidental double-refunds from admin double-clicks)
5. Calls `refundCharge` with the admin's browser IP
6. Creates an `OrderRefund` ledger row on success
7. Updates the order status to `refunded` (full) or `partially_refunded` (partial)

**Deferred to a later phase:** the customer-facing `/me/payment-methods/*` endpoints for listing/deleting/set-default on saved cards. These need either a new `processor_card_id` schema field (because Helcim's delete/default API uses the numeric card ID, not the card token) or a double-lookup pattern. Neither is complicated — just out of Phase 4 scope. Tracked as a TODO in the plan doc.

### Phase 5 — Webhooks + reconciliation (commit `e788ded`)

**The thorny discovery** from research: Helcim's public docs only list TWO webhook event types, both for physical card terminals (`cardTransaction` and `terminalCancel`). There is **no publicly documented webhook for refund completion, dispute filed, or chargeback**. For e-commerce, Helcim's webhook system is basically useless.

**Our workaround:** a daily reconciliation cron that will eventually compare our records against Helcim's Transaction History API every morning and catch any discrepancies that way. It's not real-time like a webhook, but it's automated and dependable once it's wired.

**What got built:**

1. **`HelcimWebhookController`** — `POST /api/commerce/helcim/webhook`. Built defensively in case Helcim quietly adds more events later. The controller:
   - Reads the raw HTTP body (NestJS has `rawBody: true` set in `main.ts` already, used by Shopify — we reuse it)
   - Parses three headers: `webhook-id`, `webhook-timestamp`, `webhook-signature`
   - Verifies the HMAC signature using the verifier secret from env
   - Checks the timestamp is within 5 minutes (replay protection)
   - Creates a `WebhookEvent` row for dedup (if the same webhook arrives twice, the second call returns immediately without re-processing)
   - Dispatches to a `HelcimWebhookService` that logs unknown event types
   - Returns 204 on success, 400 on invalid signature (4xx stops Helcim's retry, which is what we want for bad signatures)

2. **`HelcimWebhookService`** — event dispatcher with a switch statement. Currently logs-and-skips everything (since we don't have any real events to handle). When Helcim adds new events, the new cases get added here.

3. **`WebhookEventRepository`** — idempotent upsert + mark-as-processed helpers.

4. **`DailyReconciliationCron`** — scheduled for 6:03 AM Mountain Time daily. **Runs in degraded mode** right now: it executes the skeleton, persists a `ReconciliationLog` row with counters, but doesn't actually fetch any transactions because we haven't confirmed the Transaction History API endpoint path. The TODO block in the code spells out exactly what to add once that's known.

5. **`ReconciliationLogRepository`** — records each cron run for audit. The `findLastRun()` method is designed for a future ops health check ("has the reconciliation cron run today?").

### Phase 6 — Card expiry warnings (commit `ed4537e`)

**Built `CardExpiryWarningCron`** — scheduled for 9:09 AM Mountain Time daily. Three warning tiers: 30 days out, 14 days out, 3 days out.

**Logic:**
1. Query all default Helcim PaymentMethods that aren't disputed
2. Filter in application code to those expiring in exactly the target number of days
3. For each: check the throttle (no re-warning within 7 days), log the warning, update `last_expiry_warning_sent_at`

**Why "log" instead of "email":** the existing backend has Resend (the email provider) used inline in one other module, but there's no shared `EmailService` to call. Rather than duplicate the Resend call here and make a future refactor harder, the cron logs a `WARN` line with all the template variables clearly listed. When a shared email service lands, swapping the log for a real send is a one-line change at the `TODO(phase-6-email-service)` marker.

Also same dev guard pattern as the other crons — disabled unless production or explicitly opted in.

---

## 🚧 What's NOT built yet — organized by why

### Blocked on Helcim sandbox credentials (the main blocker)

These are all "the code is written, we just need to verify it works against a real Helcim test account":

1. **First sandbox API call** — literally never happened. Until we get the test token, we don't know if my code actually works against the real service.
2. **Server-side transaction verification in confirmCheckout()** — needs the "get transaction by ID" endpoint path confirmed in sandbox. Big TODO block in the code with a WARN log on every call.
3. **Real decline classifier patterns** — the current patterns are guesses. Sandbox testing with deliberate decline cards (using CVV values >= 200 per Helcim's docs) will give us the exact error strings to match against.
4. **Transaction History API wiring** — the daily reconciliation cron needs this endpoint to actually do its job. Legacy Helcim docs timed out during research; shape needs to be verified in sandbox.
5. **Production cutover** — Phase 7 of the plan is the runbook for flipping from test to production credentials. Gated on sandbox testing passing.

### Blocked on code that doesn't exist yet

These are "the cart/order flow needs to be built before my cron can do anything real":

6. **The cart-to-order pipeline.** The weekly charge cron charges a placeholder amount (sum of cart line items with no tax/coupons/discounts). Turning a cart into a real order requires: apply subscriber discount based on savings tier, apply active coupons, compute tax (pending the tax strategy decision), compute delivery fee, generate a display_id, create the `CustomerOrder` row, award points, send confirmation email. None of that exists in any chat. TODO blocks in `weekly-charge.cron.ts` spell out the full list.
7. **Customer and PaymentMethod row creation on `confirmCheckout()`** — currently just marks the session confirmed. Doesn't yet create the Customer, PaymentMethod, or CustomerOrder rows that the cart flow would normally create. Another TODO.
8. **Full retry state machine wiring** in `runRetrySweep()` and `retryOne()` — same root cause.

### Blocked on shared infrastructure

9. **Real email delivery.** Three places log "I would send this email" instead of sending:
   - Charge failure email (first decline → retry email, final decline → pause email, fatal decline → update-card email)
   - Card expiring warnings (30/14/3 day templates)
   - Refund confirmation email
   Needs a shared `EmailService` abstraction that doesn't exist yet. When it lands, these are all one-line swaps at the clearly-marked TODOs.

### Blocked on the other parallel chat

10. **Customer-facing checkout HTML** — the actual webpage a customer sees when paying. The `client-profile-data-model` chat is working in `conner/client-website/` right now, so I stayed out to avoid conflicts. Can be built once they merge.
11. **Account Settings card management UI** — list/delete/default for saved cards. Same reason, also needs a small schema addition (`processor_card_id`) to work cleanly.
12. **Stored-credential consent copy in the UI** — the legally-required text the customer sees before saving a card. Draft copy exists in the research doc, needs legal review anyway.

### Blocked on external review

13. **Legal review** of the stored-credential consent language.
14. **Accountant review** of whether your prepared meals are taxable under Canadian CRA rules (affects whether we ship with a hardcoded 5% Alberta GST or something fancier).
15. **Marketing-voice review** of the three customer-facing failure email templates (placeholder copy exists).

---

## ❓ The three production blockers — Helcim support questions

These are the three things we literally cannot answer by reading Helcim's public documentation. Each one needs an email to Helcim support with our specific use case described. The draft email lives in the "implementation TODOs" section of `conner/deferred-decisions.md`.

### Question 1: How do we flag a merchant-initiated charge?

**The problem:** When you charge a card without the customer present (our Thursday cron), Visa and Mastercard require the transaction to be flagged as "merchant-initiated with stored credential consent" — otherwise you pay higher fees and more charges get declined as suspicious.

**Every other payment processor** (Stripe, Braintree, Adyen) has a specific parameter in their API for this. Examples: Stripe uses `off_session: true`, Braintree uses `externalVault`. Helcim's public docs for the `/payment/purchase` endpoint show NO such parameter.

**Three possibilities:**
1. Helcim auto-detects it from context (no customer session + saved card token = MIT)
2. Helcim handles compliance at the merchant-agreement level, not per-request
3. The parameter exists but isn't in the public docs

**Why this matters:** If we guess wrong, banks may decline more of your charges, and you may pay higher interchange fees on every transaction.

**How we'd find out:** Email Helcim support, describe the use case (weekly variable-amount MIT charges against saved cards for a Canadian subscription food business), ask them to confirm the correct request shape.

### Question 2: What IP address do we send on cron-initiated charges?

**The problem:** Helcim's Purchase API **requires** an `ipAddress` field — described as "the customer's IP for fraud detection." But our Thursday cron runs on a server when no customer is present. So what do we put there?

**My current fallback chain** (in the code, needs verification):
1. The customer's most recent login IP (from `Customer.last_login_ip`)
2. The IP the card was tokenized from (from `PaymentMethod.saved_from_ip`)
3. Our server's public IP (from the `SERVER_PUBLIC_IP` env var)
4. "0.0.0.0" as a last resort with a loud error log

**The risk:** Helcim's Fraud Defender might flag stale IPs or server IPs as suspicious and decline more charges than necessary. We don't know until we test.

**How we'd find out:** Ask Helcim support what value they recommend for merchant-initiated charges, AND test in sandbox with our current fallback chain to see if anything gets flagged.

### Question 3: How do we learn about disputes and chargebacks?

**The problem:** Helcim's publicly documented webhooks only cover physical card terminals (`cardTransaction` and `terminalCancel`). There are NO documented webhooks for:
- Refund completion
- Dispute filed
- Chargeback opened
- Dispute status changes
- Card updater events

**Why this matters:** When a customer disputes a charge weeks after the fact, we want to know immediately so we can pause their subscription, investigate, and respond to the dispute. Without notification, we'd only find out by someone manually checking the Helcim dashboard or noticing a bank debit in settlement reports.

**Our current workaround:** a daily reconciliation cron that fetches transactions from Helcim's Transaction History API and diffs them against our records. Not real-time, but automated. It works — we just need to confirm the Transaction History API endpoint path because the legacy docs URL timed out during research.

**How we'd find out:** Ask Helcim support (a) whether undocumented dispute webhooks exist, (b) what the Transaction History API endpoint is in the current v2 API, (c) whether the Transaction History response includes dispute status.

---

## 📝 What YOU (Conner) need to do

In order:

### Right now (5 minutes)

1. **Email `tier2support@helcim.com`**. Subject: "Developer test account request — BetterDay Food Co". Body template:

   > Hi Helcim team,
   >
   > I'm Conner Kadziolka, owner of BetterDay Food Co (merchant ID: [YOUR MERCHANT ID HERE]). We're building a new e-commerce integration using HelcimPay.js for customer-present card save and the Payment API for weekly merchant-initiated charges against saved cards. I'd like to request a developer test account so we can verify the integration before going live.
   >
   > For context, our use case is a weekly subscription food delivery business where customers save a card during signup, then get charged automatically every Thursday for whatever is in their cart that week. The amount varies week to week based on what they've selected.
   >
   > Please let me know what you need from me to get this set up.
   >
   > Thanks,
   > Conner

2. **Wait 1–2 business days.** They'll email you back with a test API token and a webhook verifier token.

### When the credentials arrive

3. **Open your backend folder** (`~/Downloads/culinary-ops-helcim-integration/backend/`) and add the two tokens to `.env`:
   ```
   HELCIM_API_TOKEN="the long string they sent you"
   HELCIM_WEBHOOK_VERIFIER_TOKEN="the other string they sent you"
   SERVER_PUBLIC_IP="127.0.0.1"
   ```
   *(The `.env` file is symlinked from the main worktree, so this change affects all your Claude worktrees at once.)*

4. **Start a new Claude chat** in this worktree. Paste:
   > Read `helcim-status.md` at the repo root and follow it. Helcim sandbox credentials are in `backend/.env`. I want to run through the Phase 1 sandbox test plan from `conner/data-model/helcim-integration-plan.md §14` to verify the Helcim API client works end-to-end.

5. **The chat will walk you through** the sandbox test checklist. It'll use curl or Postman to hit your local backend, which will hit Helcim's sandbox, and report back what happened.

### In parallel (while waiting for the test account)

6. **Draft the Helcim support email** for the three production-blocker questions. Another Claude chat can do this for you — ask it to draft an email to `tier2support@helcim.com` covering the three questions documented in this file.

7. **Schedule an accountant call** to confirm your prepared meals are taxable as prepared food under CRA rules (not basic groceries). The question is: "If BetterDay sells a pre-cooked frozen meal that the customer reheats at home, does that fall under GST-taxable prepared food, or under GST-exempt basic groceries?" Your answer determines whether we ship with a 5% Alberta GST placeholder or something else.

8. **(Optional) Schedule a light legal review** of the stored-credential consent copy in `helcim-integration.md §4`. This is "before first production charge" work, not "before sandbox test" work.

---

## 🤖 What the NEXT CHAT needs to do

If a new Claude chat is picking this up, here's the exact handoff sequence:

1. **Read these files in order:**
   1. `conner/README.md` — workflow rules
   2. `helcim-status.md` (at repo root) — this file (where we are)
   3. `conner/data-model/helcim-integration.md` — the research
   4. `conner/data-model/helcim-integration-plan.md` — the build plan
   5. `conner/deferred-decisions.md` — scan for any new Helcim-related items

2. **Confirm the git state:**
   ```bash
   git branch --show-current  # should be conner/2026-04-09-helcim-integration
   git log -10 --oneline       # should show 8 Helcim commits
   git status                  # should be clean
   ```

3. **Check if Helcim credentials exist:**
   ```bash
   grep HELCIM /Users/us/Downloads/culinary-ops/backend/.env | sed 's/=.*/=<redacted>/'
   ```
   If both `HELCIM_API_TOKEN` and `HELCIM_WEBHOOK_VERIFIER_TOKEN` have real values, proceed to sandbox testing (step 4). If not, you're still in the waiting period — work on unblocked items (step 5).

4. **If credentials are available** — start Phase 1 sandbox validation from `helcim-integration-plan.md §14`:
   - Start the backend: `cd backend && npm run start:dev`
   - Use curl to hit `POST /api/commerce/checkout/init` with `isSaveCardOnly: true, amount: 0` and a real `customerId`
   - Record the exact response
   - Verify a `HelcimCheckoutSession` row was created in the DB via `mcp__neon__run_sql`
   - Continue through the rest of the Phase 1-6 test checklist

5. **If credentials are NOT available** — do unblocked work instead:
   - Draft the Helcim support email (3 questions)
   - Refine the draft customer-facing email templates (first decline / final decline / card expiring)
   - Write the `backend/scripts/sandbox-webhook-sender.ts` dev tool (mentioned in deferred-decisions) for local webhook testing without waiting for real Helcim events
   - Research the Transaction History API via Helcim's support articles and any archived docs
   - Build the `/me/payment-methods/*` customer card management endpoints (requires a small schema addition for `processor_card_id`)

6. **Don't touch these things without explicit user approval:**
   - `conner/client-website/` files — another chat is working there
   - `frontend/` files — Gurleen's territory
   - Any commerce migration that would conflict with client-profile's in-progress work
   - `backend/package.json` dependencies other than what Phase 7+ requires

7. **If the backend is 8 commits behind universal-brand-folder when you start**, that's expected. Don't pull/merge without asking the user first — the merge conflicts are documented below and are trivial to resolve when the time comes.

---

## ⚠️ Gotchas — things that will trip people up

### The Neon database is shared across all worktrees
All your parallel Claude chats use the same Neon development database. When one chat runs a migration, every other chat can immediately see it — but only if they pull the migration file onto their own branch. If you run `prisma migrate dev` from a branch that's missing a migration another chat already applied to the database, Prisma will refuse or offer to reset the DB. **Always check `prisma migrate status` first.** If it shows drift, stop and report to the user — don't try to "fix" it by running more migrations.

### `prisma migrate dev` is interactive-only
The Prisma CLI refuses to run `migrate dev` in a non-interactive shell. Claude Code runs commands in non-interactive mode. So creating a new migration requires the workaround I used in Phase 1.2:
1. Run `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script > migration.sql` to generate the SQL
2. Manually create the migration folder and save the SQL there
3. Apply via `mcp__neon__run_sql` or `mcp__neon__run_sql_transaction` (split `ALTER TYPE ... ADD VALUE` out of the transaction — Postgres is picky about enum changes)
4. Insert a row into `_prisma_migrations` table to record it
5. Run `prisma generate` to regenerate the client
6. Verify with `prisma migrate status`

### `npm install` wipes the generated Prisma client
The commerce Prisma client is generated to `node_modules/@prisma/commerce-client` (custom output path). When you run `npm install` for any reason, it reinstalls all packages INCLUDING blowing away that directory. **Always run `npx prisma generate --schema=prisma/commerce/schema.prisma` after any `npm install`** or TypeScript will scream about missing types. This tripped me up in Phase 3 — the fix is quick once you know what's happening.

### The three crons are disabled in dev
`WeeklyChargeCron`, `DailyReconciliationCron`, and `CardExpiryWarningCron` all early-return if `NODE_ENV !== 'production'`. This is DELIBERATE — two worktrees running the backend simultaneously would both try to charge the same cards. To trigger a cron manually in dev, either:
- Set `ENABLE_CRONS_IN_DEV=true` in `.env` (enables the real schedule)
- Call `processOne()` or `run()` directly via the admin trigger endpoint or a test
- For the weekly charge cron specifically: `POST /api/admin/commerce/checkout/weekly-charge/run-once` with `{ weeklyCartRecordId: "<uuid>" }`

### The decline classifier patterns are GUESSES
The regex patterns in `decline-classifier.ts` are based on general payment processor experience, NOT on real Helcim error strings. Until sandbox testing gives us the actual messages Helcim returns for declines, the classifier will likely misclassify errors. Priority task in the first sandbox session: run declines with CVV values 200, 300, 500, 999 plus expired cards, stolen cards, etc., record the exact strings, and replace the patterns.

### The weekly charge cron doesn't build real orders yet
`processOne()` calls `chargeSavedCard` with a PLACEHOLDER amount equal to the sum of `cart_items` line-item prices. There's no tax, no discount, no coupons. This is a smoke-test entry point only. Do NOT enable the cron in production until the cart-to-order pipeline is built and the TODO blocks in `weekly-charge.cron.ts` are filled in.

### The admin refund idempotency key is based on prior refund count
Look at `buildRefundIdempotencyKey` in `admin-commerce-checkout.controller.ts`. The format uses "prior refunded cents" as the disambiguator, so clicking "refund $5" twice in a row on the same order will collide with Helcim's 5-minute idempotency cache and return the first result (preventing double-refunds). But it also means if you refund $5, then refund another $5, then try to refund the FIRST $5 again somehow, the keys would differ by prior amount and it could go through. The admin UI should prevent this, but worth knowing about.

### The webhook endpoint is built but Helcim probably won't call it
Helcim's public docs only cover physical terminal webhook events. Your webhook endpoint will receive those (if any ever fire) but probably nothing e-commerce-related. This is why the daily reconciliation cron exists — it's the actual dispute-detection mechanism, not the webhook controller.

### Three commits will conflict at merge time (trivially)
When the branch eventually merges back to `conner/universal-brand-folder`, three files will need manual conflict resolution:
- `backend/src/app.module.ts` — both sides add module imports + module registrations, accept both blocks
- `backend/package.json` — both sides add one dependency each (`@nestjs/schedule` on this branch, commerce-coupons deps on upstream), accept both
- `conner/deferred-decisions.md` — both sides append entries to the same sections, accept both

All three are "add-both" conflicts with zero real collision. ~30 seconds each.

---

## 📂 Reference — file locations, commands, key facts

### Git state
- **Branch:** `conner/2026-04-09-helcim-integration`
- **Worktree:** `/Users/us/Downloads/culinary-ops-helcim-integration/`
- **Pushed to:** `origin/conner/2026-04-09-helcim-integration`
- **Status:** 8 commits ahead of `conner/universal-brand-folder`, 8 commits behind (unrelated changes in other chats)

### Commit history on this branch
```
ed4537e  Phase 6 — card expiry warning cron
e788ded  Phase 5 — webhooks + reconciliation cron
2c0c978  Phase 4 — admin refund endpoint + OrderRefund ledger
2166bc0  Phase 3 — weekly charge cron + chargeSavedCard
92c460a  Phase 2 backend — checkout init + confirm endpoints
a2a39d2  Phase 1 scaffolding for Helcim integration
7e9a49c  sync diet_plan_id migration from client-profile branch
1f6b479  docs: add integration research + implementation plan
```

### Neon database
- **Project:** `betterday-commerce` (id `spring-fire-44871408`)
- **Dev branch:** `br-icy-river-akvz3mg6` — live with all 7 migrations applied
- **Main branch:** `br-wandering-paper-ak95715o` — untouched (still needs promotion for production)
- **Check status:** `cd backend && npx prisma migrate status --schema=prisma/commerce/schema.prisma` → should say "Database schema is up to date!"

### Environment variables
Real values live in `backend/.env` (gitignored, symlinked across worktrees from `/Users/us/Downloads/culinary-ops/backend/.env`). The `.env.example` file has the documentation.

New vars added by this project:
```bash
HELCIM_API_TOKEN=""                  # test: tier2support@helcim.com; prod: Helcim dashboard
HELCIM_WEBHOOK_VERIFIER_TOKEN=""     # from Helcim dashboard → Integrations → Webhooks
SERVER_PUBLIC_IP=""                  # e.g. "127.0.0.1" in dev, Render egress IP in prod
```

### Key file paths
```
# The big reference docs (read in order)
helcim-status.md                                           ← you are here (repo root)
conner/data-model/helcim-integration.md                    ← research (1,430 lines)
conner/data-model/helcim-integration-plan.md               ← plan (1,355 lines)
conner/deferred-decisions.md                               ← open questions + TODOs

# Backend code
backend/src/modules/commerce-checkout/
├── commerce-checkout.module.ts                            ← module glue, registered in app.module.ts
├── commerce-checkout.controller.ts                        ← POST /api/commerce/checkout/init + /confirm
├── dto/
│   ├── init-checkout.dto.ts
│   ├── confirm-checkout.dto.ts
│   └── refund-order.dto.ts
├── admin/
│   └── admin-commerce-checkout.controller.ts              ← admin endpoints (refund + manual trigger)
├── webhooks/
│   └── helcim-webhook.controller.ts                       ← POST /api/commerce/helcim/webhook
├── crons/
│   ├── weekly-charge.cron.ts                              ← Thursday 8pm MT
│   ├── daily-reconciliation.cron.ts                       ← Daily 6:03am MT
│   └── card-expiry-warning.cron.ts                        ← Daily 9:09am MT
└── helcim/
    ├── helcim-api-client.ts                               ← low-level HTTP wrapper
    ├── helcim-api-error.ts                                ← typed error class
    ├── helcim.service.ts                                  ← business logic orchestration
    ├── helcim-webhook.service.ts                          ← event dispatcher
    ├── helcim-checkout-session.repository.ts
    ├── order-refund.repository.ts
    ├── webhook-event.repository.ts
    ├── reconciliation-log.repository.ts
    ├── decline-classifier.ts                              ← ⚠️ placeholder patterns
    ├── hmac-verifier.ts                                   ← webhook signature verification
    └── types/                                             ← 5 TypeScript type files
        ├── helcim-shared.types.ts
        ├── helcim-pay-init.types.ts
        ├── helcim-purchase.types.ts
        ├── helcim-refund.types.ts
        └── helcim-customer.types.ts

# Database
backend/prisma/commerce/schema.prisma                      ← source of truth
backend/prisma/commerce/migrations/20260410000000_helcim_integration_support/
                                                           ← the migration file
```

### Useful commands
```bash
# Check TypeScript compiles clean
cd backend && npx tsc --noEmit; echo "EXIT: $?"           # should print EXIT: 0

# Check DB migration state
cd backend && npx prisma migrate status --schema=prisma/commerce/schema.prisma

# Regenerate commerce Prisma client (run after any npm install)
cd backend && npx prisma generate --schema=prisma/commerce/schema.prisma

# Start the backend in dev mode
cd backend && npm run start:dev

# Pre-push 5-check audit (from conner/README.md)
git branch --show-current
git log conner/universal-brand-folder..HEAD --oneline
git log conner/universal-brand-folder..HEAD --format="%h %an <%ae> | %s"
git status
```

### Endpoints this project adds
```
POST /api/commerce/checkout/init                           ← customer-facing, no auth
POST /api/commerce/checkout/confirm                        ← customer-facing, no auth
POST /api/commerce/helcim/webhook                          ← Helcim-facing, HMAC auth
POST /api/admin/commerce/checkout/weekly-charge/run-once   ← staff JWT auth
POST /api/admin/commerce/orders/:orderId/refund            ← staff JWT auth
```

### New database tables + fields (Phase 1.2 migration)
```
NEW TABLES:
- HelcimCheckoutSession  (in-flight card-save sessions with secretToken)
- WebhookEvent           (idempotent dedup for inbound webhooks)
- ReconciliationLog      (daily reconciliation cron audit trail)
- OrderRefund            (refund ledger — supports partial refunds)

NEW ENUM:
- RefundReason           (admin_goodwill / admin_quality_issue / admin_cancelled_delivery / dispute / system_error / other)

ENUM EXTENSION:
- OrderStatus += partially_refunded

NEW FIELDS on Customer:
- last_login_ip                      (for MIT ipAddress fallback)

NEW FIELDS on PaymentMethod:
- cof_agreement_at                   (stored-credential consent timestamp)
- cof_agreement_text_version         (exact copy version shown)
- saved_from_ip                      (second-choice MIT ipAddress fallback)
- last_expiry_warning_sent_at        (card expiry email throttling)
- is_disputed                        (frozen card flag, set by reconciliation cron)
- disputed_at                        (when the freeze happened)

NEW FIELDS on CustomerOrder:
- charge_attempts                    (retry state machine counter)
- last_charge_attempt_at             (timestamp of most recent attempt)
- last_charge_error                  (free-text error from Helcim)
- next_charge_retry_at               (null = no retry scheduled)
- mit_indicator                      (true = cron charge, false = customer-present)
- charge_initiated_by                ("customer" | "cutoff_cron" | "admin_manual")
- charge_ip_address                  (audit — what we sent Helcim as ipAddress)

NEW INDEXES:
- CustomerOrder(processor_charge_id) (fast reconciliation cron lookup)
- CustomerOrder(next_charge_retry_at) (fast retry sweep)
- PaymentMethod(is_disputed)         (fast "skip frozen cards" filter)
```

---

## 📝 Change log for this file

- **2026-04-09** — Initial version. Captures the state at the end of the 8-commit Phase 1-6 sprint. Branch pushed to origin. Waiting on Helcim test account.

*(Future chats: append entries here when you make material changes to the integration, so anyone reading this file can scan the log to see what's new since they last checked.)*
