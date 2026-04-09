import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DeclineClassifier, type DeclineCategory } from './decline-classifier';
import { HelcimApiClient } from './helcim-api-client';
import { HelcimApiError } from './helcim-api-error';
import { HelcimCheckoutSessionRepository } from './helcim-checkout-session.repository';
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
    private readonly config: ConfigService,
  ) {}

  // ─── Flow A: customer-present card save ──────────────────────────────────

  /**
   * Initialize a HelcimPay.js checkout session. Called by the client-website
   * backend controller when a customer clicks "Checkout" or "Add card."
   *
   * Persists a HelcimCheckoutSession row (including the secretToken) so
   * the later `confirmCheckout` call can verify the browser's response.
   *
   * @returns the checkoutToken to send back to the browser. Never returns
   *          the secretToken — that stays server-side.
   *
   * 🚧 Phase 2.2 — body to be filled in alongside the checkout controller.
   */
  async initCheckout(_args: {
    customerId: string | null;
    helcimCustomerCode: string | null;
    paymentType: HelcimPayPaymentType;
    amount: number;
    currency?: HelcimCurrency;
  }): Promise<{ checkoutToken: string }> {
    throw new Error(
      'HelcimService.initCheckout is not yet implemented. Scheduled for Phase 2.2 of helcim-integration-plan.md.',
    );
  }

  /**
   * Confirm a HelcimPay.js checkout session after the browser reports
   * a SUCCESS event. Validates:
   *   1. The session exists and is not expired
   *   2. The session hasn't already been confirmed
   *   3. The transactionId the browser reports actually exists in Helcim
   *      (server-side lookup — does NOT trust the browser)
   *   4. The amount and customerCode match the session's initialization
   *
   * Only if all four checks pass do we persist the resulting order/card.
   *
   * 🚧 Phase 2.3 — body to be filled in alongside the confirm controller.
   */
  async confirmCheckout(_args: {
    checkoutToken: string;
    eventMessage: unknown;
  }): Promise<{ orderId: string | null; paymentMethodId: string | null; status: 'confirmed' }> {
    throw new Error(
      'HelcimService.confirmCheckout is not yet implemented. Scheduled for Phase 2.3 of helcim-integration-plan.md.',
    );
  }

  // ─── Flow B: merchant-initiated weekly charge ────────────────────────────

  /**
   * Charge a saved card on behalf of a customer. Called by the Thursday
   * cutoff cron for each active subscriber with a non-empty cart.
   *
   * Constructs the idempotency key deterministically so cron restarts
   * mid-run won't double-charge. Returns a discriminated result type
   * so callers can branch on approved / declined / system_error without
   * catching exceptions.
   *
   * 🚧 Phase 3.1 — body to be filled in alongside the weekly charge cron.
   */
  async chargeSavedCard(_args: {
    orderDisplayId: string;
    helcimCustomerCode: string;
    cardToken: string;
    amount: number;
    currency: HelcimCurrency;
    ipAddress: string;
    attemptNumber: number;
  }): Promise<ChargeResult> {
    throw new Error(
      'HelcimService.chargeSavedCard is not yet implemented. Scheduled for Phase 3.1 of helcim-integration-plan.md.',
    );
  }

  // ─── Refunds ──────────────────────────────────────────────────────────────

  /**
   * Refund a prior charge, full or partial. Called by the admin refund
   * endpoint and by the reconciliation cron (for dispute-driven refunds).
   *
   * 🚧 Phase 4.1 — body to be filled in alongside the admin refund endpoint.
   */
  async refundCharge(_args: {
    originalTransactionId: number;
    amount: number;
    adminIpAddress: string;
    idempotencyKey: string;
  }): Promise<RefundResult> {
    throw new Error(
      'HelcimService.refundCharge is not yet implemented. Scheduled for Phase 4.1 of helcim-integration-plan.md.',
    );
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
