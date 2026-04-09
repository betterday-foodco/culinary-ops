/**
 * Types for POST https://api.helcim.com/v2/payment/refund
 *
 * Refunds a prior Purchase or Capture transaction. Supports full or
 * partial refunds — just pass an amount ≤ the original. Requires the
 * `idempotency-key` header (same format as Purchase).
 *
 * Source: https://devdocs.helcim.com/reference/refund
 * Research: conner/data-model/helcim-integration.md §8
 */

import type { HelcimPurchaseResponse } from './helcim-purchase.types';

export interface HelcimRefundRequest {
  /** Helcim transactionId from the original Purchase/Capture. */
  originalTransactionId: number;

  /** Refund amount — must be ≤ original amount. */
  amount: number;

  /** Admin's browser IP for customer-initiated-via-admin refunds. */
  ipAddress: string;

  /** true = route through Fraud Defender. */
  ecommerce?: boolean;
}

/**
 * Response is the same SuccessfulPaymentResponse shape as a Purchase —
 * you get a NEW transactionId for the refund, with `type: "refund"`.
 * The refund does NOT echo the originalTransactionId back, so callers
 * must track the link themselves on OrderRefund.
 */
export type HelcimRefundResponse = HelcimPurchaseResponse;
