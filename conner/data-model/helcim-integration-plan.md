# Helcim Integration — Implementation Plan

> **Status:** Ready to implement (pending three support-blocked items)
> **Owner:** Conner
> **Drafted:** 2026-04-09
> **Worktree this lives in:** `culinary-ops-helcim-integration` / branch `conner/2026-04-09-helcim-integration`
> **Companion doc:** `conner/data-model/helcim-integration.md` (research notes — READ FIRST)

This is the implementation spec for wiring Helcim into the culinary-ops commerce backend. It translates the research in `helcim-integration.md` into a concrete build plan: module file list, class skeletons, method signatures, migration proposals, env var diffs, and a dependency-ordered build sequence.

**Read `helcim-integration.md` first.** This plan assumes you've read the research doc and refers back to it heavily. Every "why" is in the research doc; this doc is only "what."

**No code is written in this chat.** This plan is the deliverable for the *next* chat, which will be the one that actually writes NestJS code against it.

---

## 0. Build order at a glance

The dependency chain below is the order in which the next chat should build things. Later steps depend on earlier ones compiling + running.

```
  Phase 1: Foundation
  ├── 1.1 env vars + HelcimModule skeleton
  ├── 1.2 Prisma migration (schema additions from research §13)
  ├── 1.3 HelcimApiClient (raw HTTP wrapper, no business logic)
  └── 1.4 HelcimService (business logic wrapper around HelcimApiClient)
        │
        ▼
  Phase 2: Flow A (customer-present card save)
  ├── 2.1 HelcimCheckoutSessionRepository
  ├── 2.2 POST /commerce/checkout/init endpoint
  ├── 2.3 POST /commerce/checkout/confirm endpoint (with server-side verification)
  ├── 2.4 Client-side glue in conner/client-website/ (iframe wiring)
  └── 2.5 Sandbox end-to-end test: save card + first purchase
        │
        ▼
  Phase 3: Flow B (Thursday weekly charge)
  ├── 3.1 WeeklyChargeCron service
  ├── 3.2 DeclineClassifier (built from sandbox test data)
  ├── 3.3 Retry state machine on CustomerOrder
  ├── 3.4 Customer-facing failure emails
  └── 3.5 Sandbox end-to-end test: cron charges saved card
        │
        ▼
  Phase 4: Refunds + account management
  ├── 4.1 POST /admin/commerce/orders/:id/refund endpoint
  ├── 4.2 OrderRefundRepository
  ├── 4.3 Card management endpoints (list/delete/set-default)
  └── 4.4 Account Settings UI in conner/client-website/
        │
        ▼
  Phase 5: Webhooks + reconciliation
  ├── 5.1 Webhook controller with raw-body + HMAC verification
  ├── 5.2 WebhookEvent dedup table + handler
  ├── 5.3 Daily reconciliation cron
  └── 5.4 ReconciliationLog table + ops email on discrepancies
        │
        ▼
  Phase 6: Card expiry + compliance polish
  ├── 6.1 Card expiry warning cron
  ├── 6.2 Stored-credential consent UI copy
  ├── 6.3 MIT audit trail wiring
  └── 6.4 Compliance checklist walkthrough (research §12)
        │
        ▼
  Phase 7: Production cutover
  ├── 7.1 Generate production Helcim tokens
  ├── 7.2 Render env var update
  ├── 7.3 $1 live test charge + refund
  └── 7.4 Disable test account tokens
```

Each phase produces a commit + a branch push. Phases 2, 3, 4, 5 can ship independently to staging for intermediate validation.

---

## 1. Environment variables

### Additions to `backend/.env.example` (committed)

```bash
# ── Payments (Helcim) ────────────────────────────────────────────────────────
# Card processing for the BetterDay commerce backend. See
# conner/data-model/helcim-integration.md for the full integration design.
#
# Sandbox vs production: same base URL (api.helcim.com/v2), different tokens.
# Sandbox tokens are issued by emailing tier2support@helcim.com with your
# merchant ID. Production tokens come from your Helcim dashboard → All Tools
# → Integrations → API Access Configurations.
HELCIM_API_TOKEN=""
HELCIM_WEBHOOK_VERIFIER_TOKEN=""

# Server public IP — fallback for the ipAddress field on merchant-initiated
# /v2/payment/purchase calls when no customer IP is available. See §5 / §13
# of helcim-integration.md. On Render, this is the outbound egress IP of
# the service; find it in the Render dashboard under the service's Networking
# section, or curl https://api.ipify.org from within the running service.
SERVER_PUBLIC_IP=""
```

### Additions to `backend/.env` (gitignored, local only)

The real secrets for local development, populated from Helcim test account credentials once they're provisioned:

```bash
HELCIM_API_TOKEN="<test account api-token from tier2support@helcim.com>"
HELCIM_WEBHOOK_VERIFIER_TOKEN="<test account verifier token from dashboard>"
SERVER_PUBLIC_IP="127.0.0.1"
```

### Render production env vars (set via Render dashboard, not committed)

```
HELCIM_API_TOKEN             = <production api token>
HELCIM_WEBHOOK_VERIFIER_TOKEN = <production verifier token>
SERVER_PUBLIC_IP             = <the Render service's outbound IP>
```

---

## 2. Prisma migration

### Migration name

`20260410000000_helcim_integration_support` (timestamp adjusted to whatever `prisma migrate dev` generates on the day of the build)

### Target

- Location: `backend/prisma/commerce/migrations/`
- Schema file: `backend/prisma/commerce/schema.prisma`
- Applied to: `betterday-commerce` Neon project (`spring-fire-44871408`) → `dev` branch (`br-icy-river-akvz3mg6`) first, then `main` after sandbox testing passes

### Schema additions

Copy-paste target. The next chat should open `backend/prisma/commerce/schema.prisma` and apply these additions.

**Add to `Customer` model:**

```prisma
  // ── Payment — additions for Helcim integration ──
  last_login_ip     String?   // For MIT /payment/purchase ipAddress field
  last_login_at     DateTime? // Already exists — double-check before adding
```

(Note: `last_login_at` already exists in the current schema at line 181. Only `last_login_ip` is net-new.)

**Add to `PaymentMethod` model:**

```prisma
  // ── Stored-credential framework compliance ──
  cof_agreement_at            DateTime?   // When the customer agreed to save the card
  cof_agreement_text_version  String?     // Version of the consent text they saw
  saved_from_ip               String?     // IP at the moment of tokenization

  // ── Expiry handling ──
  last_expiry_warning_sent_at DateTime?

  // ── Dispute freeze ──
  is_disputed                 Boolean     @default(false)
  disputed_at                 DateTime?
```

**Add to `CustomerOrder` model:**

```prisma
  // ── Charge state machine (retry loop for failed MIT charges) ──
  charge_attempts             Int         @default(0)
  last_charge_attempt_at      DateTime?
  last_charge_error           String?
  next_charge_retry_at        DateTime?

  // ── MIT audit trail ──
  mit_indicator               Boolean     @default(false)
  charge_initiated_by         String?     // "customer" | "cutoff_cron" | "admin_manual"
  charge_ip_address           String?

  @@index([processor_charge_id])
```

**Add new enum value to `OrderStatus`:**

```prisma
enum OrderStatus {
  pending
  confirmed
  in_kitchen
  out_for_delivery
  delivered
  cancelled
  refunded
  partially_refunded  // ← NEW
}
```

**Add new model `HelcimCheckoutSession`:**

```prisma
model HelcimCheckoutSession {
  id                  String    @id                       // = the checkoutToken from Helcim
  secret_token        String                              // The secretToken, kept for future hash verification
  customer_id         String?                             // Null for guest checkouts
  payment_type        String                              // "purchase" | "verify" | "preauth"
  amount              Decimal   @db.Decimal(10, 2)
  currency            String    @default("CAD")

  created_at          DateTime  @default(now())
  expires_at          DateTime                            // = created_at + 60 minutes

  confirmed_at        DateTime?
  confirmed_order_id  String?   @unique

  @@index([customer_id])
  @@index([expires_at])
}
```

**Add new model `WebhookEvent`:**

```prisma
model WebhookEvent {
  id              String   @id                           // = webhook-id header value
  type            String
  received_at     DateTime @default(now())
  processed_at    DateTime?
  signature_valid Boolean
  raw_body        String   @db.Text
  result          String?                                // "processed" | "skipped_duplicate" | "ignored_event_type" | "error"
  error_detail    String?  @db.Text

  @@index([type, received_at])
  @@index([processed_at])
}
```

**Add new model `ReconciliationLog`:**

```prisma
model ReconciliationLog {
  id                    String   @id @default(uuid())
  run_at                DateTime @default(now())
  period_start          DateTime
  period_end            DateTime
  transactions_fetched  Int      @default(0)
  matched_ok            Int      @default(0)
  discrepancies_found   Int      @default(0)
  disputes_found        Int      @default(0)
  refunds_found         Int      @default(0)
  unknown_transactions  Int      @default(0)
  errors                String?  @db.Text
  duration_ms           Int?

  @@index([run_at])
}
```

**Add new enum `RefundReason`:**

```prisma
enum RefundReason {
  admin_goodwill
  admin_quality_issue
  admin_cancelled_delivery
  dispute
  system_error
  other
}
```

**Add new model `OrderRefund`:**

```prisma
model OrderRefund {
  id                  String       @id @default(uuid())
  order_id            String
  processor_refund_id String                             // Helcim's new transactionId for the refund
  amount              Decimal      @db.Decimal(10, 2)
  reason              RefundReason @default(other)
  reason_note         String?
  initiated_by        String                             // "admin:conner" | "reconciliation_cron" | "system"
  initiated_at        DateTime     @default(now())
  completed_at        DateTime?

  order               CustomerOrder @relation(fields: [order_id], references: [id])

  @@index([order_id])
  @@index([processor_refund_id])
}
```

**Add relation on `CustomerOrder`:**

```prisma
  refunds  OrderRefund[]
```

### Migration commands

```bash
cd backend

# Generate the migration against the dev Neon branch
npx prisma migrate dev \
  --schema=prisma/commerce/schema.prisma \
  --name helcim_integration_support

# Regenerate the commerce Prisma client
npx prisma generate --schema=prisma/commerce/schema.prisma

# Verify the migration SQL looks correct before committing
cat prisma/commerce/migrations/20260410*_helcim_integration_support/migration.sql
```

### Pre-migration safety checks

- [ ] Confirm the dev Neon branch (`br-icy-river-akvz3mg6`) is the one `backend/.env` is pointed at.
- [ ] Check no other chat is in the middle of a commerce migration (grep `backend/prisma/commerce/migrations/` for un-committed directories).
- [ ] Check `backend/prisma/commerce/schema.prisma` has no pending edits that would confuse the migration.

---

## 3. Module layout

New NestJS module: `backend/src/modules/commerce-checkout/`

```
backend/src/modules/commerce-checkout/
├── commerce-checkout.module.ts           # NestJS module glue
├── commerce-checkout.controller.ts       # HTTP endpoints for the customer-facing flow
├── commerce-checkout.service.ts          # Business logic orchestration
│
├── helcim/
│   ├── helcim-api-client.ts              # Low-level HTTP wrapper around api.helcim.com
│   ├── helcim.service.ts                 # High-level business operations (initCheckout, charge, refund)
│   ├── helcim-checkout-session.repository.ts  # CRUD on HelcimCheckoutSession
│   ├── decline-classifier.ts             # Maps error strings → action category (§6)
│   ├── hmac-verifier.ts                  # Webhook signature verification (§7)
│   └── types/
│       ├── helcim-purchase.types.ts      # Request/response DTOs for /v2/payment/purchase
│       ├── helcim-customer.types.ts      # Request/response DTOs for /v2/customers
│       ├── helcim-pay-init.types.ts      # Request/response DTOs for /v2/helcim-pay/initialize
│       └── helcim-refund.types.ts        # Request/response DTOs for /v2/payment/refund
│
├── dto/
│   ├── init-checkout.dto.ts              # POST /commerce/checkout/init body
│   ├── confirm-checkout.dto.ts           # POST /commerce/checkout/confirm body
│   └── refund-order.dto.ts               # POST /admin/commerce/orders/:id/refund body
│
├── crons/
│   ├── weekly-charge.cron.ts             # Thursday cutoff MIT charge loop (§5)
│   ├── daily-reconciliation.cron.ts      # Morning sweep against Transaction History (§7)
│   ├── card-expiry-warning.cron.ts       # 30/14/3-day email cron (§9)
│   └── checkout-session-cleanup.cron.ts  # Prune stale HelcimCheckoutSession rows (§4)
│
├── webhooks/
│   ├── helcim-webhook.controller.ts      # POST /api/commerce/helcim/webhook with raw body
│   └── helcim-webhook.service.ts         # Event type dispatcher
│
├── repositories/
│   ├── order-refund.repository.ts        # CRUD on OrderRefund
│   ├── webhook-event.repository.ts       # Idempotent upsert for WebhookEvent
│   └── reconciliation-log.repository.ts  # Append-only log
│
└── email/
    ├── charge-failure.email.ts           # First decline + final decline templates
    └── card-expiring.email.ts            # 30/14/3-day templates
```

### Why a separate `helcim/` subfolder

Keeps everything Helcim-specific in one place so that if we ever swap processors (Helcim is a Canadian processor — if we expand to the US we might end up on Stripe), the blast radius is contained to this subfolder. The `commerce-checkout` parent module depends on an abstract idea of "a payment processor service" but is free to cast around the swap later.

### Admin-side additions

```
backend/src/modules/commerce-checkout/admin/
├── admin-commerce-checkout.controller.ts  # POST /admin/commerce/orders/:id/refund
└── admin-commerce-checkout.module.ts      # Separate module for admin-only endpoints
```

This lives in a separate admin module so it can be protected by the existing admin JWT guard without the customer-facing endpoints needing that guard.

---

## 4. HelcimApiClient — raw HTTP wrapper

### File: `helcim/helcim-api-client.ts`

Thin wrapper around `fetch()` / Axios. Knows nothing about our business logic. Its only jobs:

- Add the three required headers (`api-token`, `accept`, `content-type`)
- Add `idempotency-key` when called on a Payment API method
- Parse the JSON response and throw a typed error on non-2xx
- Log every request/response for audit

### Class skeleton

```typescript
@Injectable()
export class HelcimApiClient {
  private readonly baseUrl = 'https://api.helcim.com/v2';
  private readonly logger = new Logger(HelcimApiClient.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  // ── Low-level methods, one per documented endpoint ──────────────────────

  async postHelcimPayInitialize(
    body: HelcimPayInitRequest
  ): Promise<HelcimPayInitResponse> {
    return this.post('/helcim-pay/initialize', body, { requireIdempotencyKey: false });
  }

  async postPurchase(
    body: HelcimPurchaseRequest,
    idempotencyKey: string
  ): Promise<HelcimPurchaseResponse> {
    return this.post('/payment/purchase', body, { requireIdempotencyKey: true, idempotencyKey });
  }

  async postRefund(
    body: HelcimRefundRequest,
    idempotencyKey: string
  ): Promise<HelcimRefundResponse> {
    return this.post('/payment/refund', body, { requireIdempotencyKey: true, idempotencyKey });
  }

  async createCustomer(
    body: HelcimCreateCustomerRequest
  ): Promise<HelcimCustomerResponse> {
    return this.post('/customers', body, { requireIdempotencyKey: false });
  }

  async getCustomer(customerCode: string): Promise<HelcimCustomerResponse> {
    return this.get(`/customers/${customerCode}`);
  }

  async listCustomerCards(customerCode: string): Promise<HelcimCardListResponse> {
    return this.get(`/customers/${customerCode}/cards`);
  }

  async deleteCustomerCard(customerCode: string, cardId: string): Promise<void> {
    return this.delete(`/customers/${customerCode}/cards/${cardId}`);
  }

  async setDefaultCard(customerCode: string, cardId: string): Promise<void> {
    return this.put(`/customers/${customerCode}/cards/${cardId}/default`, {});
  }

  // 🚧 Exact endpoint TBD from sandbox testing — one of:
  //    GET /v2/payment/transactions/{id}
  //    GET /v2/card-transactions/{id}
  //    Something via the legacy Transaction History API
  async getTransaction(transactionId: number): Promise<HelcimTransactionResponse> {
    return this.get(`/payment/transactions/${transactionId}`); // 🚧 verify in sandbox
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async post<TReq, TRes>(
    path: string,
    body: TReq,
    opts: { requireIdempotencyKey: boolean; idempotencyKey?: string }
  ): Promise<TRes> {
    const headers = this.buildHeaders();
    if (opts.requireIdempotencyKey) {
      if (!opts.idempotencyKey) throw new Error(`Idempotency key required for ${path}`);
      headers['idempotency-key'] = opts.idempotencyKey;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    return this.parseResponse<TRes>(res, path);
  }

  private async get<TRes>(path: string): Promise<TRes> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.buildHeaders(),
    });
    return this.parseResponse<TRes>(res, path);
  }

  private async put<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });
    return this.parseResponse<TRes>(res, path);
  }

  private async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.buildHeaders(),
    });
    if (!res.ok) throw await HelcimApiError.fromResponse(res, path);
  }

  private buildHeaders(): Record<string, string> {
    const token = this.config.getOrThrow<string>('HELCIM_API_TOKEN');
    return {
      'api-token': token,
      'accept': 'application/json',
      'content-type': 'application/json',
    };
  }

  private async parseResponse<T>(res: Response, path: string): Promise<T> {
    const text = await res.text();
    this.logger.debug({ path, status: res.status, bodyLength: text.length });
    if (!res.ok) {
      throw await HelcimApiError.fromResponseBody(res.status, text, path);
    }
    return JSON.parse(text) as T;
  }
}
```

### HelcimApiError class

```typescript
export class HelcimApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly rawBody: string,
    public readonly parsedErrors: string[] | Record<string, string> | null,
  ) {
    super(`Helcim API error ${status} on ${path}: ${rawBody.slice(0, 200)}`);
  }

  static async fromResponseBody(status: number, rawBody: string, path: string): Promise<HelcimApiError> {
    let parsedErrors: string[] | Record<string, string> | null = null;
    try {
      const parsed = JSON.parse(rawBody);
      parsedErrors = parsed.errors ?? null;
    } catch {
      // Not JSON, leave null
    }
    return new HelcimApiError(status, path, rawBody, parsedErrors);
  }

  isIdempotencyConflict(): boolean { return this.status === 409; }
  isAuthError(): boolean { return this.status === 401 || this.status === 403; }
  isRateLimit(): boolean { return this.status === 429; }
  isTransient(): boolean { return this.status >= 500 || this.status === 429; }
}
```

### Types file — `helcim/types/helcim-purchase.types.ts`

Every request/response shape from research §2 as TypeScript interfaces. This is the boring-but-important work of turning the research doc's JSON examples into typed contracts:

```typescript
// Request
export interface HelcimPurchaseRequest {
  ipAddress: string;
  ecommerce: boolean;
  currency: 'CAD' | 'USD';
  amount: number;
  customerCode?: string;
  invoiceNumber?: string;
  billingAddress?: HelcimAddress;
  cardData: HelcimCardData;
}

export type HelcimCardData =
  | { cardNumber: string; cardExpiry: string; cardCVV: string } // raw (we never use)
  | { cardToken: string };                                       // saved card (always)

// Response
export interface HelcimPurchaseResponse {
  transactionId: number;
  cardBatchId: number;
  dateCreated: string;
  status: 'APPROVED' | 'DECLINED';
  user: string;
  type: 'purchase' | 'preauth' | 'verify';
  amount: number;
  currency: 'CAD' | 'USD';
  avsResponse: string;
  cvvResponse: string;
  cardType: string;      // VI | MC | AX | DI
  approvalCode: string;
  cardToken: string;
  cardNumber: string;    // F6L4 format
  cardHolderName: string;
  customerCode: string;
  invoiceNumber: string;
  warning?: string;
}
```

Similarly for Customer, Card, Refund, HelcimPayInit — each in its own file.

---

## 5. HelcimService — business-logic wrapper

### File: `helcim/helcim.service.ts`

Sits one layer above `HelcimApiClient`. Knows about our domain (customers, orders, payment methods) and translates between our database shapes and Helcim's API shapes. Handles:

- Constructing idempotency keys
- Choosing the right `ipAddress` per research §5
- Persisting `HelcimCheckoutSession` rows on init
- Server-side transaction verification on confirm
- Wiring HelcimApiError → DeclineClassifier

### Class skeleton

```typescript
@Injectable()
export class HelcimService {
  private readonly logger = new Logger(HelcimService.name);

  constructor(
    private readonly apiClient: HelcimApiClient,
    private readonly sessionRepo: HelcimCheckoutSessionRepository,
    private readonly declineClassifier: DeclineClassifier,
    private readonly commercePrisma: CommercePrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  // ── Flow A: customer-present card save + charge ───────────────────────────

  async initCheckout(args: {
    customerId: string | null;       // Null for guest
    customerCode: string | null;     // Existing Helcim customer, if any
    paymentType: 'purchase' | 'verify';
    amount: number;                  // 0 for verify
    currency: 'CAD' | 'USD';
    customerIpAddress: string;
  }): Promise<{ checkoutToken: string }> {
    // 1. Call POST /helcim-pay/initialize with the right payload
    // 2. Persist HelcimCheckoutSession row (id=checkoutToken, secretToken, customer_id, etc.)
    // 3. Return checkoutToken to controller (NEVER the secretToken)
  }

  async confirmCheckout(args: {
    checkoutToken: string;
    eventMessage: unknown;           // What the browser POSTed back
  }): Promise<ConfirmResult> {
    // 1. Load HelcimCheckoutSession by checkoutToken
    // 2. Reject if expired, already confirmed, or mismatched
    // 3. Parse transactionId out of eventMessage
    // 4. SERVER-SIDE verify: call apiClient.getTransaction(transactionId)
    // 5. Validate: amount matches, customerCode matches, status === 'APPROVED'
    // 6. Persist Customer.helcim_customer_id, PaymentMethod, CustomerOrder as appropriate
    // 7. Mark session as confirmed
    // 8. Return the resulting Customer/Order IDs
  }

  // ── Flow B: merchant-initiated weekly charge ─────────────────────────────

  async chargeSavedCard(args: {
    orderId: string;
    customerId: string;
    paymentMethodId: string;
    amount: number;
    attemptNumber: number;           // For idempotency key
  }): Promise<ChargeResult> {
    const customer = await this.commercePrisma.customer.findUniqueOrThrow({ where: { id: args.customerId } });
    const payment = await this.commercePrisma.paymentMethod.findUniqueOrThrow({ where: { id: args.paymentMethodId } });
    const order = await this.commercePrisma.customerOrder.findUniqueOrThrow({ where: { id: args.orderId } });

    if (!customer.helcim_customer_id) throw new NoHelcimCustomerError();
    if (!payment.processor_token) throw new NoCardTokenError();
    if (payment.is_disputed) throw new CardDisputedError();

    const ipAddress = this.resolveIpAddressForMit(customer, payment);
    const idempotencyKey = `${order.display_id}-${args.attemptNumber}`;

    try {
      const response = await this.apiClient.postPurchase({
        ipAddress,
        ecommerce: true,
        currency: 'CAD',
        amount: args.amount,
        customerCode: customer.helcim_customer_id,
        invoiceNumber: order.display_id,
        cardData: { cardToken: payment.processor_token },
      }, idempotencyKey);

      if (response.status !== 'APPROVED') {
        return this.classifyAndReturnFailure(response, idempotencyKey);
      }

      return {
        kind: 'approved',
        processorChargeId: String(response.transactionId),
        idempotencyKey,
        ipAddressUsed: ipAddress,
      };
    } catch (err) {
      if (err instanceof HelcimApiError) {
        return this.classifyAndReturnApiError(err, idempotencyKey);
      }
      throw err;
    }
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async refundOrder(args: {
    orderId: string;
    amount: number;                  // Partial or full; validated against order total
    reason: RefundReason;
    reasonNote?: string;
    initiatedBy: string;             // "admin:conner", "reconciliation_cron", etc.
    initiatedByIpAddress: string;    // Admin's IP for customer-present admin flow
  }): Promise<OrderRefund> {
    // 1. Load order, validate processor_charge_id exists
    // 2. Validate refund amount doesn't exceed (original - already_refunded)
    // 3. Build idempotency key: `refund-${order.display_id}-${Date.now()}`
    // 4. Call apiClient.postRefund(...)
    // 5. Create OrderRefund row
    // 6. Update CustomerOrder.status = 'refunded' or 'partially_refunded'
    // 7. If reason === 'dispute': freeze PaymentMethod.is_disputed, pause Subscription
    // 8. If reason !== 'dispute': email customer
    // 9. Return the OrderRefund
  }

  // ── Card management ─────────────────────────────────────────────────────

  async listCustomerCards(customerId: string): Promise<PaymentMethod[]> {
    // Read from our DB (NOT from Helcim) — source of truth is our PaymentMethod table
  }

  async removeCustomerCard(args: { customerId: string; paymentMethodId: string }): Promise<void> {
    // 1. Load payment method, verify ownership
    // 2. Call apiClient.deleteCustomerCard(customerCode, helcimCardId)
    // 3. Hard-delete the PaymentMethod row
    // 4. If it was the subscription default, pause subscription + email customer
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private resolveIpAddressForMit(
    customer: Customer,
    payment: PaymentMethod
  ): string {
    return customer.last_login_ip
        ?? payment.saved_from_ip
        ?? this.config.get<string>('SERVER_PUBLIC_IP')
        ?? '0.0.0.0';
  }

  private classifyAndReturnFailure(
    response: HelcimPurchaseResponse,
    idempotencyKey: string
  ): ChargeResult {
    const category = this.declineClassifier.classify(response.errors ?? 'UNKNOWN');
    return {
      kind: 'declined',
      category,
      rawError: JSON.stringify(response),
      idempotencyKey,
    };
  }

  private classifyAndReturnApiError(
    err: HelcimApiError,
    idempotencyKey: string
  ): ChargeResult {
    if (err.isIdempotencyConflict()) {
      // Should never happen if key construction is correct — log and page
      this.logger.error({ err, idempotencyKey }, 'Idempotency conflict');
      return { kind: 'system_error', rawError: err.message, idempotencyKey };
    }
    // ... rest of the mapping
  }
}
```

### Result types

```typescript
export type ChargeResult =
  | { kind: 'approved'; processorChargeId: string; idempotencyKey: string; ipAddressUsed: string }
  | { kind: 'declined'; category: DeclineCategory; rawError: string; idempotencyKey: string }
  | { kind: 'system_error'; rawError: string; idempotencyKey: string };

export type DeclineCategory =
  | 'retryable_transient'
  | 'retryable_funds'
  | 'fatal_card'
  | 'fatal_auth'
  | 'fatal_fraud'
  | 'unknown';
```

---

## 6. Decline classifier

### File: `helcim/decline-classifier.ts`

```typescript
@Injectable()
export class DeclineClassifier {
  // Patterns built from sandbox testing. See research §6.
  // The patterns below are GUESSES — the implementation chat will run
  // every decline variation in sandbox and replace these with real strings.
  private readonly patterns: Array<{ regex: RegExp; category: DeclineCategory }> = [
    // Retryable — transient
    { regex: /try again|temporary|timeout|network|unavailable/i, category: 'retryable_transient' },
    // Retryable — funds
    { regex: /insufficient funds|exceeds.+limit|do not honor/i, category: 'retryable_funds' },
    // Fatal — card issue
    { regex: /expired|invalid card|stolen|lost card|pick ?up card/i, category: 'fatal_card' },
    // Fatal — fraud
    { regex: /fraud|cvv|avs/i, category: 'fatal_fraud' },
    // Fatal — auth
    { regex: /declined|call issuer/i, category: 'fatal_auth' },
  ];

  classify(errorSource: string | string[] | Record<string, string>): DeclineCategory {
    const flattened = this.flattenError(errorSource);
    for (const { regex, category } of this.patterns) {
      if (regex.test(flattened)) return category;
    }
    return 'unknown';
  }

  private flattenError(src: unknown): string {
    if (typeof src === 'string') return src;
    if (Array.isArray(src)) return src.join(' | ');
    if (typeof src === 'object' && src !== null) return Object.values(src).join(' | ');
    return String(src);
  }
}
```

**Build-out task during sandbox testing:** replace the guessed patterns with real ones. Create `sandbox-decline-catalog.ts` that hits `/v2/payment/purchase` with CVV=200, 201, ..., 999 and dumps the exact error strings. Paste into the patterns array.

---

## 7. Weekly charge cron

### File: `crons/weekly-charge.cron.ts`

```typescript
@Injectable()
export class WeeklyChargeCron {
  private readonly logger = new Logger(WeeklyChargeCron.name);

  constructor(
    private readonly commercePrisma: CommercePrismaService,
    private readonly helcim: HelcimService,
    private readonly emailService: EmailService,
  ) {}

  // Runs every Thursday at 8:00 PM Mountain Time — tentative, tune in prod.
  // DO NOT enable in local dev (see deferred-decisions §Edge cases — two
  // worktrees would both try to charge).
  @Cron('0 20 * * 4', { timeZone: 'America/Denver' })
  async runCutoff(): Promise<void> {
    const deliveryWeek = this.computeDeliveryWeekFor(new Date());
    this.logger.log({ deliveryWeek }, 'Weekly charge cutoff starting');

    const records = await this.loadPendingCartRecords(deliveryWeek);

    for (const record of records) {
      try {
        await this.processOne(record);
      } catch (err) {
        this.logger.error({ err, recordId: record.id }, 'Charge failed unexpectedly');
      }
    }

    this.logger.log('Weekly charge cutoff complete');
  }

  private async processOne(record: WeeklyCartRecord): Promise<void> {
    // 1. Lock the record (FOR UPDATE SKIP LOCKED) so parallel runs don't duplicate
    // 2. Compute order total (line items + subscriber discount + coupons + tax + delivery)
    // 3. Build/update CustomerOrder row
    // 4. Call this.helcim.chargeSavedCard(...)
    // 5. On approved: persist transaction ID, mark order confirmed, etc.
    // 6. On declined: set next_charge_retry_at per §6 policy, send email
    // 7. On fatal decline: pause subscription, send pause email
  }

  // Retry sweep — runs every hour to pick up orders whose next_charge_retry_at has arrived
  @Cron('0 * * * *')
  async runRetrySweep(): Promise<void> {
    const toRetry = await this.loadOrdersReadyForRetry();
    for (const order of toRetry) {
      await this.retryOne(order);
    }
  }
}
```

### Cutoff schedule — timezone handling

Mountain Time because that's Alberta. NestJS's `@Cron` decorator takes a `timeZone` option that converts the cron expression to UTC internally. **Do not hand-convert times to UTC** — it breaks on DST transitions.

### Guard against running locally

The cron should be wired off in dev entirely. Proposed: a config check in the cron constructor that refuses to register the schedule if `NODE_ENV !== 'production'`. Dev runs the cron via a manual HTTP endpoint on an admin route instead, giving explicit per-invocation control during testing.

```typescript
constructor(...) {
  if (this.config.get('NODE_ENV') !== 'production' &&
      this.config.get('ENABLE_CRONS_IN_DEV') !== 'true') {
    this.logger.warn('Weekly charge cron DISABLED in dev. Use POST /admin/commerce/weekly-charge/run-once to trigger manually.');
    // Skip registration
    return;
  }
}
```

---

## 8. HelcimCheckoutController

### File: `commerce-checkout.controller.ts`

```typescript
@Controller('commerce/checkout')
export class CommerceCheckoutController {
  constructor(
    private readonly helcim: HelcimService,
    private readonly commercePrisma: CommercePrismaService,
  ) {}

  @Post('init')
  async initCheckout(
    @Body() dto: InitCheckoutDto,
    @Req() req: Request,
  ): Promise<InitCheckoutResponse> {
    const { checkoutToken } = await this.helcim.initCheckout({
      customerId: dto.customerId ?? null,
      customerCode: dto.customerCode ?? null,
      paymentType: dto.isSaveCardOnly ? 'verify' : 'purchase',
      amount: dto.amount,
      currency: 'CAD',
      customerIpAddress: req.ip,
    });
    return { checkoutToken };
  }

  @Post('confirm')
  async confirmCheckout(
    @Body() dto: ConfirmCheckoutDto,
  ): Promise<ConfirmCheckoutResponse> {
    const result = await this.helcim.confirmCheckout({
      checkoutToken: dto.checkoutToken,
      eventMessage: dto.eventMessage,
    });
    return {
      orderId: result.orderId,
      paymentMethodId: result.paymentMethodId,
      status: result.status,
    };
  }
}
```

### DTOs

```typescript
export class InitCheckoutDto {
  @IsString() @IsOptional() customerId?: string;
  @IsString() @IsOptional() customerCode?: string;
  @IsBoolean() isSaveCardOnly: boolean;       // true → verify, false → purchase
  @IsNumber() @Min(0) amount: number;
}

export class ConfirmCheckoutDto {
  @IsString() checkoutToken: string;
  eventMessage: unknown;                       // Raw from HelcimPay.js postMessage
}
```

Note: `eventMessage` is typed as `unknown` because HelcimPay.js can return it as either a JSON string or a parsed object (betterday-app handles both). The server parses it defensively inside `confirmCheckout`.

---

## 9. Webhook controller

### File: `webhooks/helcim-webhook.controller.ts`

```typescript
@Controller('commerce/helcim')
export class HelcimWebhookController {
  constructor(
    private readonly verifier: HmacVerifier,
    private readonly webhookService: HelcimWebhookService,
    private readonly webhookRepo: WebhookEventRepository,
  ) {}

  @Post('webhook')
  @HttpCode(204)
  async receiveWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('webhook-id') webhookId: string,
    @Headers('webhook-timestamp') webhookTimestamp: string,
    @Headers('webhook-signature') webhookSignature: string,
  ): Promise<void> {
    const rawBody = req.rawBody?.toString('utf-8') ?? '';

    // Dedup
    const existing = await this.webhookRepo.findById(webhookId);
    if (existing?.processed_at) return;

    // Verify signature
    const valid = this.verifier.verify({
      webhookId,
      webhookTimestamp,
      rawBody,
      expectedSignature: webhookSignature,
    });

    // Persist the event (valid or not — audit trail)
    await this.webhookRepo.upsert({
      id: webhookId,
      type: existing?.type ?? 'unknown',
      signature_valid: valid,
      raw_body: rawBody,
    });

    if (!valid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    // Replay protection — reject events > 5 min old
    const ts = new Date(webhookTimestamp);
    if (Date.now() - ts.getTime() > 5 * 60 * 1000) {
      await this.webhookRepo.markResult(webhookId, 'skipped_duplicate', 'timestamp too old');
      return;
    }

    // Dispatch to handler
    await this.webhookService.handle(JSON.parse(rawBody));

    await this.webhookRepo.markResult(webhookId, 'processed');
  }
}
```

### main.ts changes

```typescript
// Before app.listen:
app.use('/api/commerce/helcim/webhook', bodyParser.raw({ type: 'application/json' }));
```

NestJS supports `rawBody: true` on the factory which is cleaner but interacts with existing middleware; the explicit raw parser on the specific route is safer.

### HMAC verifier

```typescript
@Injectable()
export class HmacVerifier {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  verify(args: {
    webhookId: string;
    webhookTimestamp: string;
    rawBody: string;
    expectedSignature: string;
  }): boolean {
    const secret = this.config.getOrThrow<string>('HELCIM_WEBHOOK_VERIFIER_TOKEN');
    const key = Buffer.from(secret, 'base64');
    const signedContent = `${args.webhookId}.${args.webhookTimestamp}.${args.rawBody}`;
    const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(args.expectedSignature));
  }
}
```

---

## 10. Daily reconciliation cron

### File: `crons/daily-reconciliation.cron.ts`

```typescript
@Injectable()
export class DailyReconciliationCron {
  constructor(
    private readonly helcim: HelcimService,
    private readonly commercePrisma: CommercePrismaService,
    private readonly reconRepo: ReconciliationLogRepository,
    private readonly emailService: EmailService,
  ) {}

  @Cron('0 6 * * *', { timeZone: 'America/Denver' })
  async run(): Promise<void> {
    const periodStart = dayjs().subtract(2, 'day').startOf('day').toDate();
    const periodEnd = dayjs().endOf('day').toDate();
    const startTime = Date.now();

    const log = { /* counters, see schema */ };

    try {
      // 🚧 Exact Transaction History API shape TBD from sandbox
      const transactions = await this.helcim.listTransactions({ periodStart, periodEnd });

      for (const txn of transactions) {
        log.transactions_fetched++;
        const ourOrder = await this.commercePrisma.customerOrder.findFirst({
          where: { processor_charge_id: String(txn.transactionId) },
        });

        if (!ourOrder) {
          log.unknown_transactions++;
          // Log + alert, don't auto-create
          continue;
        }

        // Diff statuses
        await this.reconcileOne(ourOrder, txn, log);
      }
    } catch (err) {
      log.errors = String(err);
    }

    log.duration_ms = Date.now() - startTime;
    await this.reconRepo.create({ ...log, period_start: periodStart, period_end: periodEnd });

    if (log.discrepancies_found > 0) {
      await this.emailService.sendOpsAlert({
        subject: `Reconciliation found ${log.discrepancies_found} discrepancies`,
        log,
      });
    }
  }

  private async reconcileOne(ourOrder: CustomerOrder, helcimTxn: HelcimTransaction, log: ReconciliationLog) {
    // Compare statuses; if different, act per §7/§8
    // Refunds → create OrderRefund row, update order
    // Disputes → freeze PaymentMethod, pause Subscription, alert admin
    // Mismatched amounts → log discrepancy, alert
  }
}
```

---

## 11. Account Settings UI

### Location: `conner/client-website/account/payment-methods.html` (new)

Minimal scope for v1:

- List the customer's saved payment methods (cards) with brand + last4 + expiry
- "Add new card" button → opens HelcimPay.js iframe in verify mode
- "Remove" button on each card → confirmation dialog → DELETE call
- "Set as default" radio/button
- Banner at the top if the default card is expiring within 30 days

Backend endpoints needed:

```
GET    /api/commerce/me/payment-methods
POST   /api/commerce/me/payment-methods              (init HelcimPay.js in verify mode)
DELETE /api/commerce/me/payment-methods/:id
PUT    /api/commerce/me/payment-methods/:id/default
```

These live in `commerce-customers` module (the `/me/*` namespace), not `commerce-checkout`, because they're customer-profile operations. The controller delegates to `HelcimService.listCustomerCards` / `removeCustomerCard` / etc.

---

## 12. Admin refund endpoint

### File: `admin/admin-commerce-checkout.controller.ts`

```typescript
@Controller('admin/commerce/orders')
@UseGuards(AdminAuthGuard)
export class AdminCommerceCheckoutController {
  constructor(private readonly helcim: HelcimService) {}

  @Post(':orderId/refund')
  async refundOrder(
    @Param('orderId') orderId: string,
    @Body() dto: RefundOrderDto,
    @Req() req: Request,
    @CurrentAdmin() admin: AdminUser,
  ): Promise<OrderRefund> {
    return this.helcim.refundOrder({
      orderId,
      amount: dto.amount,
      reason: dto.reason,
      reasonNote: dto.reasonNote,
      initiatedBy: `admin:${admin.username}`,
      initiatedByIpAddress: req.ip,
    });
  }
}

export class RefundOrderDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsEnum(RefundReason) reason: RefundReason;
  @IsString() @IsOptional() reasonNote?: string;
}
```

---

## 13. Email templates

Both live under `commerce-checkout/email/` and use the existing Resend integration (`backend/src/modules/auth/` already uses Resend for corporate magic links).

### File: `email/charge-failure.email.ts`

Three templates, one per scenario from §6:

1. **First decline (retryable)** — "We'll try again in 6 hours"
2. **Final decline (all retries exhausted)** — "Your subscription has been paused"
3. **Fatal decline (card expired/fraud)** — "Please update your card"

Copy needs marketing-voice review before shipping — placeholder text flagged as `// FIXME: marketing review` per the deferred-decisions entry.

### File: `email/card-expiring.email.ts`

Three templates for 30/14/3-day warnings. Single function, takes `daysUntilExpiry` and picks the right template.

---

## 14. Sandbox test plan

The implementation chat should run through this checklist in order before considering each phase complete.

### Phase 1 validation

- [ ] `HELCIM_API_TOKEN` env var loads correctly (log length on startup in dev)
- [ ] `HelcimApiClient.createCustomer({ contactName: 'Test User' })` returns a real `customerCode`
- [ ] That customer appears in the Helcim sandbox dashboard
- [ ] `HelcimApiClient.getCustomer(customerCode)` returns the same customer

### Phase 2 validation

- [ ] `POST /commerce/checkout/init` with `isSaveCardOnly=true` creates a `HelcimCheckoutSession` row and returns a valid `checkoutToken`
- [ ] Loading the session row shows the `secretToken` is persisted (not just in memory)
- [ ] Browser renders the HelcimPay.js iframe using the `checkoutToken`
- [ ] Entering Visa `4242 4242 4242 4242` succeeds
- [ ] postMessage fires with `eventStatus: 'SUCCESS'`
- [ ] `POST /commerce/checkout/confirm` verifies the transaction server-side and creates a `PaymentMethod` row
- [ ] `PaymentMethod.processor_token` is populated with a real Helcim card token
- [ ] `PaymentMethod.cof_agreement_at` is set
- [ ] Running `/commerce/checkout/confirm` a SECOND time with the same token returns the existing order, not a new one (idempotency)

### Phase 3 validation

- [ ] `POST /admin/commerce/weekly-charge/run-once` (dev-only trigger) executes the cron handler
- [ ] For a customer with a saved card + active subscription + non-empty cart, the cron creates a `CustomerOrder` and calls `/v2/payment/purchase`
- [ ] The resulting `CustomerOrder.processor_charge_id` matches the `transactionId` in the Helcim dashboard
- [ ] The `idempotency-key` header in the outbound request matches the `{displayId}-1` format
- [ ] Re-running the same cron instance does NOT double-charge (idempotency works)
- [ ] Triggering a decline via CVV=200 in test mode records `last_charge_error` + schedules `next_charge_retry_at`
- [ ] After 4 failed attempts, subscription moves to `paused_indefinite` and the customer receives the pause email

### Phase 4 validation

- [ ] `POST /admin/commerce/orders/:id/refund` with a valid amount creates an `OrderRefund` row
- [ ] The original `CustomerOrder.status` transitions to `refunded` (full) or `partially_refunded` (partial)
- [ ] The refund appears in the Helcim sandbox dashboard
- [ ] Partial refund totaling more than the original is rejected
- [ ] Customer receives the refund confirmation email

### Phase 5 validation

- [ ] Webhook controller accepts a valid signed request (use a local test signer script)
- [ ] Webhook controller rejects a request with an invalid signature (400)
- [ ] Webhook controller rejects a request with a stale timestamp (> 5 min)
- [ ] Dedup: re-sending the same `webhook-id` returns 204 without re-processing
- [ ] Reconciliation cron, manually triggered, pulls recent transactions and matches them against our orders
- [ ] A deliberate discrepancy (create an order with a wrong `processor_charge_id` in the DB) is detected and logged

### Phase 6 validation

- [ ] Card expiry cron picks up a card expiring in 30 days
- [ ] Email fires with the right template
- [ ] `last_expiry_warning_sent_at` is updated so re-running the cron the next day does NOT re-send
- [ ] 14-day and 3-day templates fire on correct days

### Phase 7 — production cutover

See research §10 production cutover checklist.

---

## 15. Risks and open blockers

### Blockers (will need Helcim support to resolve before production ship)

1. **MIT flag parameter** — research §14 Q1. Possible outcomes:
   - **Best case:** Helcim auto-infers from `customerCode + cardToken` context, no code changes needed.
   - **Middle case:** Helcim adds a new field to the Purchase request body — we add it to `HelcimPurchaseRequest` and always set it in the weekly charge flow.
   - **Worst case:** Helcim has a separate endpoint for stored-credential charges — we add another method to `HelcimApiClient` and swap the weekly charge cron to use it.
   - The first two are easy. The third is a ~2-day refactor.

2. **`ipAddress` for MIT** — research §14 Q2. Possible outcomes:
   - **Best case:** the proposed fallback chain (last_login_ip → saved_from_ip → server IP) works fine, Fraud Defender is happy.
   - **Middle case:** Helcim recommends a specific placeholder like empty string or server IP, we hardcode it.
   - **Worst case:** Helcim says "must be a real customer IP" — we can't use MIT charges at all, and have to rethink the model (e.g., force customers to explicitly confirm each weekly charge via magic link).

3. **Dispute / chargeback notification** — research §14 Q3. Mitigations in order of preference:
   - **(a)** Helcim confirms a hidden webhook event exists — we add it to our handler.
   - **(b)** Helcim confirms the Transaction History API returns dispute data — our reconciliation cron picks them up (this is our current design assumption).
   - **(c)** Helcim confirms neither exists — we ship with daily reconciliation detecting only refund-level signals and accept that disputes will be lag-detected by ops watching the dashboard.

### Non-blockers (things to handle but don't stop the ship)

- **Test account provisioning lag** — email `tier2support@helcim.com` on day 1 of the implementation chat; the account may take 1-2 business days to arrive.
- **Stored-credential consent copy legal review** — draft copy in research §4 is usable for sandbox; legal review only needed before first production charge.
- **Marketing voice review on failure emails** — handled alongside coupon error copy review that's already deferred.
- **Accountant review of meal taxability** — gated on someone to contact an accountant. Ship with 5% placeholder and a FIXME.

---

## 16. Acceptance criteria — when is this done?

The integration ships to production when ALL of the following are true:

- [ ] All seven phases above are implemented and passing their sandbox test plans.
- [ ] The three blocking open questions in research §14 are resolved (Helcim support replies, or explicit documented assumption approved by Conner).
- [ ] Stored-credential consent copy has been legally reviewed.
- [ ] Failure-email copy has been marketing-reviewed.
- [ ] Accountant has confirmed meals are taxable (or provided the correct classification).
- [ ] A $1 live charge has succeeded against the production Helcim account and shown up in both our `CustomerOrder` table and the Helcim production dashboard.
- [ ] A $1 live refund has succeeded and reconciled back via the next morning's reconciliation cron.
- [ ] Render env vars are set to production Helcim tokens (not test).
- [ ] Test account tokens have been disabled.
- [ ] Production cutover date is logged in `conner/deferred-decisions.md` under "Resolved".

---

## 18. REVISED Phase 3 — Pre-auth → Capture two-phase architecture

> **Added 2026-04-10** after analyzing BetterDay's real payment volume ($130K/month, ~125 charges/week, 1.6-4% failure rate). The original Phase 3 was a just-in-time charge model (lock + charge in one pass Thursday night). This revision adds a 48-hour pre-auth buffer that gives customers time to fix card issues before delivery is affected. Estimated $35K/year in recovered revenue from dunning.

### Why the change from just-in-time to pre-auth

BetterDay's old system (SPRWT + Shopify) gave subscribers several days between order creation and payment processing. Failed payments had a buffer to be resolved. The original Phase 3 design had zero buffer — charge at cutoff, fail at cutoff, no time to recover. At $130K/month with a 3% failure rate, that's ~$1,000/week in revenue at risk with no recovery window.

### The revised weekly rhythm

```
SUNDAY NIGHT
  Cart generation cron creates WeeklyCartRecord for active subscribers
  (cadence-aware: weekly subscribers every week, monthly every 4th week)
  Customers can edit their cart Sun-Tue

TUESDAY 8:00 PM MT — LOCK + PRE-AUTH PHASE (~2 seconds lock, 5-15 min pre-auth)
  Step 1 (bulk, fast): For ALL carts for this delivery week:
    - Snapshot cart_items into a new CustomerOrder (status = 'pending')
    - Set WeeklyCartRecord.delivery_status = 'confirmed', is_locked = true
    - Cart is now frozen — customer can no longer edit
  Step 2 (sequential, slow): For each new 'pending' order:
    - POST /v2/payment/preauth with cardToken for the full order amount
    - APPROVED → order.status = 'authorized', order.preauth_id = txnId
      Customer sees "pending $XX.XX" on their bank statement
    - DECLINED → order.status = 'payment_failed'
      Immediately send dunning email #1:
      "Your card was declined. Update by Thursday 8 PM to keep your delivery."

WEDNESDAY 8:00 AM MT — RETRY #1
  For each 'payment_failed' order: re-run preauth
  If success → flip to 'authorized'
  If still failed → send dunning email #2

WEDNESDAY 8:00 PM MT — RETRY #2
  Same as above. Send dunning email #3 if still failing:
  "Last chance — update your card by tomorrow 8 PM"

THURSDAY 8:00 PM MT — CAPTURE PHASE
  For each 'authorized' order:
    RE-CHECK before capturing:
      - Is subscription still active? (not paused/cancelled since Tuesday)
      - Is delivery_status still 'confirmed'? (not skipped since Tuesday)
      - Is payment method still valid? (not disputed/removed since Tuesday)
    If any check fails → VOID the pre-auth (POST /v2/payment/reverse)
      → order.status = 'skipped' or 'cancelled' as appropriate
      → customer sees pending charge drop off their statement
    If all checks pass → CAPTURE (POST /v2/payment/capture)
      → order.status = 'confirmed', processor_charge_id = capture txnId
      → send order confirmation email
  For each still 'payment_failed' order:
    One final preauth attempt
    If success → immediate capture → 'confirmed'
    If still failed → order.status = 'skipped'
    → send "your delivery was skipped this week" email
    → DON'T pause the subscription yet (skip != pause)
    → Pause after 2-3 consecutive skipped weeks

FRIDAY 6:00 AM MT — KITCHEN PRODUCTION REPORT
  Pulls only status = 'confirmed' orders
  100% of these are funded (pre-auth captured)
```

### Skip / pause / cancel between pre-auth and capture

The capture cron must re-check order + subscription + payment method status before calling Helcim. If the customer took any action between Tuesday and Thursday that should prevent the charge, the pre-auth must be VOIDED (not captured).

| Customer action between Tue-Thu | Capture cron action | Helcim call | Order status | Money |
|---|---|---|---|---|
| Nothing (happy path) | Capture the pre-auth | `POST /v2/payment/capture` | `confirmed` | Held → charged |
| Skipped this week | VOID the pre-auth | `POST /v2/payment/reverse` | `skipped` | Hold drops, $0 charged |
| Paused subscription | VOID the pre-auth | `POST /v2/payment/reverse` | `paused` | Hold drops, $0 charged |
| Cancelled subscription | VOID the pre-auth | `POST /v2/payment/reverse` | `cancelled` | Hold drops, $0 charged |
| Removed payment method | VOID the pre-auth | `POST /v2/payment/reverse` | `payment_method_removed` | Hold drops |
| Card got disputed (reconciliation flagged) | VOID the pre-auth | `POST /v2/payment/reverse` | `payment_failed` | Hold drops |

**Critical rule:** the skip/pause/cancel API handlers must ALSO check for existing 'authorized' orders and void them immediately at the time of the action — don't wait for Thursday's capture cron. This means the customer's pending charge drops off their statement within 1-2 business days of their action, and the Thursday cron's re-check is just a safety net.

### Post-void customer messaging

When a hold is voided for any reason, the customer should see:

> *"You may see a pending charge of $XX.XX from BetterDay on your card statement. This is just a hold that's being released — you will not be charged. It typically drops off within 1-2 business days."*

Where to display this is a UX design decision tracked in `conner/deferred-decisions.md`.

### Schema additions needed for pre-auth (on top of Phase 1.2)

```prisma
// On CustomerOrder — add these fields in a follow-up migration
preauth_id          String?    // Helcim transactionId from the /v2/payment/preauth response
preauth_at          DateTime?  // When the pre-auth was placed
preauth_voided_at   DateTime?  // When we voided (if skipped/cancelled between Tue-Thu)
preauth_void_reason String?    // "customer_skip" | "customer_pause" | "customer_cancel" |
                               // "payment_method_removed" | "card_disputed" | "admin_override"
```

### Cron changes vs Phase 3

The current Phase 3 `WeeklyChargeCron` needs to be split into:
- `TuesdayPreauthCron` — lock phase + pre-auth loop + decline email
- `DunningRetryCron` — Wed morning + Wed evening retry sweeps
- `ThursdayCaptureOrVoidCron` — capture authorized orders, void changed ones, final retry on failures

These replace the single `WeeklyChargeCron.runCutoff()` that exists today. The existing `processOne()` logic (validate record, resolve IP, call Helcim, handle result) is reusable — it just needs to call `postPreauth` instead of `postPurchase` on Tuesday and `postCapture` on Thursday.

### What this means for the HelcimApiClient

Two methods need real bodies added (they're already in the types but not wired):
- `postPreauth(body, idempotencyKey)` — same shape as `postPurchase`, different endpoint
- `postCapture(body, idempotencyKey)` — takes the preauth `transactionId` + amount

Plus `postReverse(originalTransactionId, idempotencyKey)` for voiding pre-auths on skip/pause/cancel.

### Cadence simplification (locked decision 2026-04-10)

All billing cadences follow the same Tuesday pre-auth → Thursday capture rhythm. "Monthly" subscribers are just weekly subscribers whose `WeeklyCartRecord` is generated every 4th week instead of every week by the cart generation cron. The payment pipeline is completely cadence-agnostic — if a cart record exists for the delivery week, it gets pre-auth'd and captured. If no record exists, nothing happens. `Subscription.cadence` is only read by the cart generation cron, never by the payment flow.

---

## 19. What's NOT in this plan (explicit exclusions)

So the next chat doesn't get confused about scope (renumbered from §17 after §18 was inserted):

- **HelcimPay.js redesign.** We use it as-is via the CDN script. We are not embedding, forking, or customizing the iframe.
- **Apple Pay / Google Pay Express checkout.** These are in the schema (`CustomerSource.apple_pay_express`, `google_pay_express`) but their integration is a separate workstream.
- **ACH / bank debit payments.** PAD agreements are in the Helcim Customer API but out of scope for v1.
- **Physical card terminals.** `cardTransaction` + `terminalCancel` webhooks are handled defensively (we build the receiver) but we don't have or plan to have a terminal.
- **Helcim Recurring API.** Rejected in research §1 — we use MIT charges via Payment API instead.
- **Multi-currency.** CAD only for v1. USD is mentioned in the API but we don't use it.
- **Hand-built dispute evidence submission.** Manual via Helcim dashboard for v1. A future feature.
- **Automated card updater via network tokenization.** Not supported by Helcim per research §9. Handled via the "card expiring" email cron.
- **The culinary database.** This integration lives entirely in the commerce database. No `CulinaryPrismaService` calls.
- **Frontend admin UI for refunds.** Backend endpoint lives at `POST /admin/commerce/orders/:id/refund`, but the admin UI to call it is a Gurleen-side change (since the dashboard admin UI is in `frontend/`, which Conner doesn't modify). Coordinate with Gurleen in a separate chat.
