import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CommercePrismaService } from '../../../prisma/commerce-prisma.service';
import { DeclineClassifier, type DeclineCategory } from './decline-classifier';
import { HelcimApiClient } from './helcim-api-client';
import { HelcimApiError } from './helcim-api-error';
import { HelcimCheckoutSessionRepository } from './helcim-checkout-session.repository';
import type { HelcimPayMessageSuccessPayload } from './types/helcim-pay-init.types';
import type { HelcimPayPaymentType, HelcimCurrency } from './types/helcim-shared.types';

/**
 * HelcimService — business-logic orchestration layer above HelcimApiClient.
 *
 * Responsibilities:
 *   - Flow A (customer-present card save): initCheckout + confirmCheckout
 *   - Flow B (merchant-initiated weekly charge): chargeSavedCard
 *   - Refunds: refundCharge
 *   - Helper: resolve the MIT ipAddress fallback chain
 *   - Helper: construct idempotency keys
 *   - Classify failures via DeclineClassifier for the retry cron
 *
 * What this service does NOT do:
 *   - HTTP or retry logic — that's HelcimApiClient + the caller
 *   - Database mutations beyond HelcimCheckoutSession — that's the
 *     controllers / cron services that call us
 *   - Email sending — that's the email service
 *   - State machine transitions on Subscription / CustomerOrder — that's
 *     the weekly charge cron
 *
 * This is Phase 1.4 — most methods are scaffolds that will be fleshed
 * out in Phase 2 (initCheckout + confirmCheckout) and Phase 3
 * (chargeSavedCard). The public shapes are stable; the bodies throw
 * NotImplementedError until then.
 *
 * Research: conner/data-model/helcim-integration.md §4 + §5 + §6
 * Implementation plan: conner/data-model/helcim-integration-plan.md §5
 */
@Injectable()
export class HelcimService {
  private readonly logger = new Logger(HelcimService.name);

  constructor(
    private readonly apiClient: HelcimApiClient,
    private readonly sessionRepo: HelcimCheckoutSessionRepository,
    private readonly declineClassifier: DeclineClassifier,
    private readonly commercePrisma: CommercePrismaService,
    private readonly config: ConfigService,
  ) {}

  // ─── Flow A: customer-present card save ──────────────────────────────────

  /**
   * Initialize a HelcimPay.js checkout session. Called by the checkout
   * controller when a customer clicks "Checkout" or "Add card."
   *
   * Steps:
   *   1. If customerId is set, look up the existing Customer row to get
   *      helcim_customer_id (the Helcim customerCode). Guest checkouts
   *      skip this step — the Helcim customer gets created on confirm.
   *   2. POST /v2/helcim-pay/initialize with the appropriate parameters
   *      (paymentType, amount, currency, customerCode if known).
   *   3. Persist a HelcimCheckoutSession row keyed by the returned
   *      checkoutToken. The secretToken lives ONLY in this row — never
   *      sent to the browser.
   *   4. Return the checkoutToken to the caller.
   *
   * Research: conner/data-model/helcim-integration.md §4
   */
  async initCheckout(args: {
    customerId: string | null;
    helcimCustomerCode: string | null;
    paymentType: HelcimPayPaymentType;
    amount: number;
    currency?: HelcimCurrency;
  }): Promise<{ checkoutToken: string }> {
    const currency = args.currency ?? 'CAD';

    // Resolve helcim_customer_id from the Customer row if we have a customerId
    // but the caller didn't explicitly provide a helcimCustomerCode.
    let helcimCustomerCode = args.helcimCustomerCode;
    if (args.customerId && !helcimCustomerCode) {
      const customer = await this.commercePrisma.customer.findUnique({
        where: { id: args.customerId },
        select: { helcim_customer_id: true },
      });
      if (!customer) {
        throw new NotFoundException(`Customer ${args.customerId} not found`);
      }
      helcimCustomerCode = customer.helcim_customer_id;
    }

    // Call Helcim to create the session. For verify mode, the new card
    // will attach to the existing Helcim customer vault (if customerCode
    // was passed) or create a new floating card (if not). For purchase
    // mode, the card is charged AND saved in the same step.
    const response = await this.apiClient.postHelcimPayInitialize({
      paymentType: args.paymentType,
      amount: args.amount,
      currency,
      customerCode: helcimCustomerCode ?? undefined,
      setAsDefaultPaymentMethod: 1,
      hideExistingPaymentDetails: 0,
      displayContactFields: args.customerId ? 0 : 1,
    });

    this.logger.log(
      `Helcim session initialized: paymentType=${args.paymentType} amount=${args.amount} customer=${args.customerId ?? 'guest'}`,
    );

    // Persist the session so /confirm can look it up later. The secretToken
    // stays in the database, never leaves the server.
    await this.sessionRepo.create({
      checkoutToken: response.checkoutToken,
      secretToken: response.secretToken,
      customerId: args.customerId,
      paymentType: args.paymentType,
      amount: args.amount,
      currency,
    });

    return { checkoutToken: response.checkoutToken };
  }

  /**
   * Confirm a HelcimPay.js checkout session after the browser reports
   * a SUCCESS event via postMessage.
   *
   * Validation chain:
   *   1. Session exists in our DB and was created by /init
   *   2. Session has not expired (60-minute TTL)
   *   3. Session has not already been confirmed (idempotent)
   *   4. eventMessage parses cleanly and contains a transactionId
   *   5. [TODO Phase 2.5 after sandbox testing] Server-side lookup of
   *      the transaction in Helcim to verify it exists, matches the
   *      session's amount, and has status=APPROVED. Until this lookup
   *      endpoint is confirmed in sandbox, this step is a documented
   *      gap — see helcim-integration.md §14 Q7.
   *
   * Idempotency: a second POST with the same checkoutToken after the
   * first confirm succeeded returns the original order without making
   * another Helcim call or re-persisting rows.
   *
   * Research: conner/data-model/helcim-integration.md §4 (Flow A, step 8)
   */
  async confirmCheckout(args: {
    checkoutToken: string;
    eventMessage: unknown;
  }): Promise<{ orderId: string | null; paymentMethodId: string | null; status: 'confirmed' }> {
    // 1-3. Load + validate the session
    const session = await this.sessionRepo.findByToken(args.checkoutToken);
    const invalidReason = this.sessionRepo.validateForConfirm(session);

    if (invalidReason === 'not_found') {
      throw new NotFoundException('Unknown checkout token');
    }
    if (invalidReason === 'expired') {
      throw new BadRequestException(
        'Checkout session has expired. Please restart the payment flow.',
      );
    }
    if (invalidReason === 'already_confirmed') {
      // Idempotent replay: return the original order without re-processing.
      // session is non-null here per the validateForConfirm contract.
      return {
        orderId: session!.confirmed_order_id,
        paymentMethodId: null,
        status: 'confirmed',
      };
    }

    // 4. Parse eventMessage defensively — HelcimPay.js sometimes sends
    //    a stringified JSON payload, sometimes a parsed object.
    const payload = this.parseHelcimPayMessage(args.eventMessage);
    if (!payload) {
      throw new BadRequestException('Unable to parse Helcim event message');
    }

    const transactionId = this.coerceTransactionId(payload);
    if (!transactionId) {
      throw new BadRequestException('Helcim event message did not contain a transactionId');
    }

    // 5. SERVER-SIDE VERIFICATION — intentionally gated behind a comment
    //    until the implementation chat confirms the correct Helcim endpoint
    //    for transaction lookup in the sandbox.
    //
    //    Until this is wired:
    //      - We trust the browser's reported transactionId for initial
    //        persistence
    //      - The daily reconciliation cron (Phase 5) will catch any
    //        mismatch between our records and Helcim's records
    //      - This gap is a KNOWN risk in the Phase 1-4 build and MUST be
    //        closed before production cutover (Phase 7 blocker)
    //
    //    See helcim-integration.md §14 Q7 and helcim-integration-plan.md §15.
    //
    // TODO(phase-2.5-sandbox): replace this comment block with:
    //   const txn = await this.apiClient.getTransactionById(transactionId);
    //   if (txn.status !== 'APPROVED') throw new BadRequestException(...);
    //   if (Number(txn.amount) !== Number(session!.amount)) throw ...;
    //   if (session!.customer_id && txn.customerCode !== expectedCustomerCode) throw ...;

    this.logger.warn(
      `confirmCheckout: server-side transaction verification is NOT YET ENABLED for txn=${transactionId}. ` +
        `This gap is a Phase 2.5 sandbox task. Trusting the browser-reported transactionId for now. ` +
        `See helcim-integration.md §14 Q7.`,
    );

    // 6. Mark the session as confirmed. Creating the Customer / PaymentMethod /
    //    CustomerOrder rows is deferred to the caller (the controller will
    //    accept a result indicating success and spawn those rows in its own
    //    transaction once the rest of the flow is wired in Phase 2.4+).
    //
    //    For now: we confirm the session WITHOUT an orderId. The orderId
    //    gets filled in when the cart/order flow is built.
    await this.sessionRepo.markConfirmed({
      checkoutToken: args.checkoutToken,
      orderId: null,
    });

    return {
      orderId: null,
      paymentMethodId: null,
      status: 'confirmed',
    };
  }

  /**
   * Defensively parse a HelcimPay.js postMessage payload. HelcimPay.js
   * is inconsistent about whether it sends the payload as a stringified
   * JSON or a parsed object — we accept both. Returns null if parsing
   * fails entirely.
   */
  private parseHelcimPayMessage(raw: unknown): HelcimPayMessageSuccessPayload | null {
    if (!raw) return null;
    if (typeof raw === 'object') return raw as HelcimPayMessageSuccessPayload;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as HelcimPayMessageSuccessPayload;
      } catch (err) {
        this.logger.warn(`Failed to parse HelcimPay message as JSON: ${err}`);
        return null;
      }
    }
    return null;
  }

  /**
   * Extract a transactionId from a HelcimPay message payload. Tries
   * both `transactionId` and `id` field names since HelcimPay's shape
   * varies. Returns null if neither is present or convertible to a number.
   */
  private coerceTransactionId(payload: HelcimPayMessageSuccessPayload): number | null {
    const raw = payload.transactionId ?? payload.id;
    if (raw === null || raw === undefined) return null;
    const asNumber = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : null;
  }

  // ─── Flow B: merchant-initiated weekly charge ────────────────────────────

  /**
   * Charge a saved card on behalf of a customer. Called by the Thursday
   * cutoff cron for each active subscriber with a non-empty cart, and
   * by the manual admin trigger endpoint for sandbox testing.
   *
   * Three outcomes:
   *   1. HTTP 200 + status="APPROVED" → `kind: 'approved'`
   *   2. HTTP 200 + status="DECLINED" → `kind: 'declined'` (bank said no)
   *   3. Any other HTTP response → `kind: 'declined'` or `'system_error'`
   *      via classifyApiError (HelcimApiError routed through the classifier)
   *
   * Never throws — every failure mode has a representation in ChargeResult
   * so the caller (cron) can pattern-match without try/catch wrappers.
   *
   * Idempotency: the key is constructed from `<orderDisplayId>-<attemptNumber>`,
   * which is deterministic from DB state. Cron restarts mid-run will
   * reconstruct the same key and either succeed (Helcim cached response)
   * or fail with 409 Conflict (different payload with the same key —
   * indicates a bug in key construction, not a legitimate retry).
   *
   * Research: conner/data-model/helcim-integration.md §5
   */
  async chargeSavedCard(args: {
    orderDisplayId: string;
    helcimCustomerCode: string;
    cardToken: string;
    amount: number;
    currency: HelcimCurrency;
    ipAddress: string;
    attemptNumber: number;
  }): Promise<ChargeResult> {
    const idempotencyKey = this.buildIdempotencyKey(args.orderDisplayId, args.attemptNumber);

    this.logger.log(
      `chargeSavedCard: ${args.orderDisplayId} attempt=${args.attemptNumber} ` +
        `amount=${args.amount} ${args.currency} customer=${args.helcimCustomerCode} ` +
        `key=${idempotencyKey}`,
    );

    try {
      const response = await this.apiClient.postPurchase(
        {
          ipAddress: args.ipAddress,
          ecommerce: true, // Always true for us — routes through Fraud Defender
          currency: args.currency,
          amount: args.amount,
          customerCode: args.helcimCustomerCode,
          invoiceNumber: args.orderDisplayId,
          cardData: { cardToken: args.cardToken },
        },
        idempotencyKey,
      );

      // HTTP 200 path — Helcim accepted the request. Check the response
      // status to determine whether the CHARGE itself was approved or
      // declined (as distinct from a 4xx/5xx error which would have
      // been thrown as HelcimApiError).
      if (response.status === 'APPROVED') {
        this.logger.log(
          `chargeSavedCard APPROVED: order=${args.orderDisplayId} ` +
            `txn=${response.transactionId} approval=${response.approvalCode}`,
        );
        return {
          kind: 'approved',
          processorChargeId: String(response.transactionId),
          idempotencyKey,
          ipAddressUsed: args.ipAddress,
          approvalCode: response.approvalCode,
          avsResponse: response.avsResponse,
          cvvResponse: response.cvvResponse,
        };
      }

      // HTTP 200 + status=DECLINED — the bank rejected the charge. Helcim
      // returns the bank's reason in the `warning` field (inconsistent
      // across deployments — may also surface in avsResponse/cvvResponse).
      // Classify from whatever signal we have.
      const declineSource = response.warning ?? `DECLINED avs=${response.avsResponse} cvv=${response.cvvResponse}`;
      const category = this.declineClassifier.classify(declineSource);
      this.logger.warn(
        `chargeSavedCard DECLINED: order=${args.orderDisplayId} ` +
          `category=${category} signal="${declineSource}"`,
      );
      return {
        kind: 'declined',
        category,
        rawError: declineSource,
        idempotencyKey,
      };
    } catch (err) {
      if (err instanceof HelcimApiError) {
        this.logger.warn(
          `chargeSavedCard API error: order=${args.orderDisplayId} ` +
            `status=${err.status} error="${err.toErrorString().slice(0, 200)}"`,
        );
        return this.classifyApiError(err, idempotencyKey);
      }
      // Unknown error (network, timeout, JSON parse) — treat as transient
      this.logger.error(
        `chargeSavedCard unknown error: order=${args.orderDisplayId} ` +
          `err=${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        kind: 'system_error',
        rawError: err instanceof Error ? err.message : String(err),
        idempotencyKey,
        reason: 'unexpected',
      };
    }
  }

  // ─── Refunds ──────────────────────────────────────────────────────────────

  /**
   * Refund a prior charge, full or partial. Called by the admin refund
   * endpoint and (in a future phase) by the reconciliation cron for
   * dispute-driven auto-refunds.
   *
   * Helcim's Refund API mirrors Purchase — same response shape,
   * same error format, same idempotency-key requirement, same
   * inconsistent errors-field behavior.
   *
   * Three outcomes:
   *   1. HTTP 200 + status="APPROVED" → `kind: 'approved'`
   *   2. HTTP 200 + status="DECLINED" → `kind: 'rejected'` (processor refused)
   *   3. HelcimApiError caught → `kind: 'rejected'` or `'system_error'`
   *
   * The `originalTransactionId` is numeric (Helcim's transactionId field).
   * The caller stringifies it into `CustomerOrder.processor_charge_id`,
   * so the admin controller parses it back with Number() before calling
   * this method.
   *
   * Research: conner/data-model/helcim-integration.md §8
   */
  async refundCharge(args: {
    originalTransactionId: number;
    amount: number;
    adminIpAddress: string;
    idempotencyKey: string;
  }): Promise<RefundResult> {
    this.logger.log(
      `refundCharge: originalTxn=${args.originalTransactionId} amount=${args.amount} ` +
        `key=${args.idempotencyKey}`,
    );

    try {
      const response = await this.apiClient.postRefund(
        {
          originalTransactionId: args.originalTransactionId,
          amount: args.amount,
          ipAddress: args.adminIpAddress,
          ecommerce: true,
        },
        args.idempotencyKey,
      );

      if (response.status === 'APPROVED') {
        this.logger.log(
          `refundCharge APPROVED: originalTxn=${args.originalTransactionId} ` +
            `refundTxn=${response.transactionId} approval=${response.approvalCode}`,
        );
        return {
          kind: 'approved',
          processorRefundId: String(response.transactionId),
          idempotencyKey: args.idempotencyKey,
        };
      }

      // HTTP 200 + DECLINED — the processor refused the refund. This is
      // unusual but can happen when the original transaction is already
      // fully refunded or isn't refundable (e.g. in-person debit).
      const reason = response.warning ?? 'Refund declined by processor';
      this.logger.warn(
        `refundCharge REJECTED: originalTxn=${args.originalTransactionId} ` +
          `reason="${reason}"`,
      );
      return {
        kind: 'rejected',
        rawError: reason,
        idempotencyKey: args.idempotencyKey,
      };
    } catch (err) {
      if (err instanceof HelcimApiError) {
        this.logger.warn(
          `refundCharge API error: originalTxn=${args.originalTransactionId} ` +
            `status=${err.status} error="${err.toErrorString().slice(0, 200)}"`,
        );
        if (err.isIdempotencyConflict()) {
          return {
            kind: 'system_error',
            rawError: err.toErrorString(),
            idempotencyKey: args.idempotencyKey,
            reason: 'idempotency_conflict',
          };
        }
        if (err.isAuthError()) {
          return {
            kind: 'system_error',
            rawError: err.toErrorString(),
            idempotencyKey: args.idempotencyKey,
            reason: 'auth_error',
          };
        }
        if (err.isRateLimit()) {
          return {
            kind: 'system_error',
            rawError: err.toErrorString(),
            idempotencyKey: args.idempotencyKey,
            reason: 'rate_limited',
          };
        }
        // 4xx validation errors → rejection (not system error)
        return {
          kind: 'rejected',
          rawError: err.toErrorString(),
          idempotencyKey: args.idempotencyKey,
        };
      }
      this.logger.error(
        `refundCharge unknown error: originalTxn=${args.originalTransactionId} ` +
          `err=${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        kind: 'system_error',
        rawError: err instanceof Error ? err.message : String(err),
        idempotencyKey: args.idempotencyKey,
        reason: 'unexpected',
      };
    }
  }

  // ─── Helpers exposed for cron + controllers ──────────────────────────────

  /**
   * Construct an idempotency key for a Payment API call. Format:
   *   `<order_display_id>-<attempt_number>`
   *
   * Example: `BD-2026-04-0012345-1` (first attempt), `...-2` (retry).
   *
   * Deterministic — the key for a given (order, attempt) is stable
   * across cron restarts, so Helcim's 5-minute idempotency cache
   * prevents double-charges during reprocessing.
   *
   * Must be 25-36 alphanumeric characters plus `-` and `_` per Helcim's
   * format requirement.
   */
  buildIdempotencyKey(orderDisplayId: string, attemptNumber: number): string {
    const key = `${orderDisplayId}-${attemptNumber}`;
    if (key.length < 25) {
      // Pad short keys so Helcim accepts them. Display IDs for real
      // orders will be long enough (~20 chars), but test fixtures and
      // dev scaffolding may not be.
      return key.padEnd(25, '0');
    }
    if (key.length > 36) {
      throw new Error(
        `Idempotency key exceeds Helcim's 36-char limit: "${key}" (${key.length} chars)`,
      );
    }
    return key;
  }

  /**
   * Resolve the `ipAddress` field for a merchant-initiated charge when
   * no customer is present. See helcim-integration.md §5.
   *
   * Fallback chain:
   *   1. Customer.last_login_ip       (most recent human IP)
   *   2. PaymentMethod.saved_from_ip  (IP at tokenization)
   *   3. SERVER_PUBLIC_IP env var     (Render egress IP)
   *   4. "0.0.0.0"                    (last resort — should page on-call)
   *
   * ⚠️ Open question: Helcim support hasn't confirmed that any of these
   * values will be accepted by Fraud Defender without flagging the charge
   * as suspicious. See helcim-integration.md §14 Q2.
   */
  resolveMitIpAddress(args: {
    customerLastLoginIp: string | null;
    paymentMethodSavedFromIp: string | null;
  }): string {
    if (args.customerLastLoginIp) return args.customerLastLoginIp;
    if (args.paymentMethodSavedFromIp) return args.paymentMethodSavedFromIp;

    const serverIp = this.config.get<string>('SERVER_PUBLIC_IP');
    if (serverIp) return serverIp;

    this.logger.error(
      'MIT charge has no ipAddress candidate — falling back to 0.0.0.0. This may trip Helcim Fraud Defender. Set SERVER_PUBLIC_IP in env.',
    );
    return '0.0.0.0';
  }

  /**
   * Helper for callers that want a single entry-point for classifying
   * an error + converting it to a discriminated ChargeResult.
   */
  classifyApiError(err: HelcimApiError, idempotencyKey: string): ChargeResult {
    if (err.isIdempotencyConflict()) {
      // Same key, different payload — should never happen if we're
      // disciplined about key construction. Hard fail.
      return {
        kind: 'system_error',
        rawError: err.toErrorString(),
        idempotencyKey,
        reason: 'idempotency_conflict',
      };
    }
    if (err.isAuthError()) {
      // Token revoked — halt the cron loop entirely, not just this row.
      return {
        kind: 'system_error',
        rawError: err.toErrorString(),
        idempotencyKey,
        reason: 'auth_error',
      };
    }
    if (err.isRateLimit()) {
      return {
        kind: 'system_error',
        rawError: err.toErrorString(),
        idempotencyKey,
        reason: 'rate_limited',
      };
    }
    if (err.isTransient()) {
      return {
        kind: 'declined',
        category: 'retryable_transient',
        rawError: err.toErrorString(),
        idempotencyKey,
      };
    }
    // Fall through to the declined classifier
    return {
      kind: 'declined',
      category: this.declineClassifier.classify(err.parsedErrors),
      rawError: err.toErrorString(),
      idempotencyKey,
    };
  }
}

// ─── Result types ──────────────────────────────────────────────────────────

/**
 * Discriminated union returned by chargeSavedCard. Callers pattern-match
 * on `kind` to decide what to do. No exceptions bubble out — every failure
 * mode has a representation in the result shape.
 */
export type ChargeResult =
  | {
      kind: 'approved';
      processorChargeId: string; // Stringified transactionId from Helcim
      idempotencyKey: string;
      ipAddressUsed: string;
      approvalCode: string;
      avsResponse: string;
      cvvResponse: string;
    }
  | {
      kind: 'declined';
      category: DeclineCategory;
      rawError: string;
      idempotencyKey: string;
    }
  | {
      kind: 'system_error';
      rawError: string;
      idempotencyKey: string;
      reason: 'idempotency_conflict' | 'auth_error' | 'rate_limited' | 'unexpected';
    };

/**
 * Result of a refund call. Same discriminated shape as ChargeResult but
 * with fewer failure modes (refunds don't have "decline" in the same sense).
 */
export type RefundResult =
  | {
      kind: 'approved';
      processorRefundId: string;
      idempotencyKey: string;
    }
  | {
      kind: 'rejected';
      rawError: string;
      idempotencyKey: string;
    }
  | {
      kind: 'system_error';
      rawError: string;
      idempotencyKey: string;
      reason: 'idempotency_conflict' | 'auth_error' | 'rate_limited' | 'unexpected';
    };
