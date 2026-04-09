/**
 * Types for POST https://api.helcim.com/v2/payment/purchase
 *
 * The Thursday cutoff cron's load-bearing call. Charges a saved card
 * token for a customer's current cart total. Requires the
 * `idempotency-key` header.
 *
 * Source: https://devdocs.helcim.com/reference/purchase
 * Research: conner/data-model/helcim-integration.md §2 + §5
 */

import type {
  HelcimAddress,
  HelcimCurrency,
  HelcimTransactionStatus,
  HelcimTransactionType,
} from './helcim-shared.types';

/**
 * CardData — one of two shapes:
 * - Raw card: we NEVER send this (PCI scope reduction — HelcimPay.js handles cards)
 * - Card token: the only form we use, references a previously-saved card
 */
export type HelcimCardData =
  | {
      cardNumber: string;
      cardExpiry: string; // "MMYY"
      cardCVV: string;
    }
  | {
      cardToken: string; // 22-char alphanumeric from Helcim's vault
    };

/**
 * Full request body for /v2/payment/purchase.
 *
 * Required fields: ipAddress, currency, amount, cardData.
 * Required header: idempotency-key (25-36 alphanumeric chars + - + _).
 *
 * ⚠️ See helcim-integration.md §2.1 gap #2: for cron-initiated charges
 * there is no customer session, so `ipAddress` must be populated from
 * the fallback chain (Customer.last_login_ip → PaymentMethod.saved_from_ip
 * → SERVER_PUBLIC_IP → "0.0.0.0").
 */
export interface HelcimPurchaseRequest {
  /** Customer IP for Fraud Defender (required by Helcim). */
  ipAddress: string;

  /** true triggers Helcim Fraud Defender — always true for us. */
  ecommerce: boolean;

  currency: HelcimCurrency;
  amount: number;

  cardData: HelcimCardData;

  /** Helcim customer vault code — optional per docs, we always send it. */
  customerCode?: string;

  /** Our CustomerOrder.display_id goes here. */
  invoiceNumber?: string;

  billingAddress?: HelcimAddress;

  /** Hardware terminal — unused. */
  terminalId?: number;

  /** Inline invoice creation — unused. */
  invoice?: unknown;
}

/**
 * Response from a successful /v2/payment/purchase call (HTTP 200).
 * Same shape is returned from /v2/payment/preauth, /v2/payment/verify,
 * and /v2/payment/refund — Helcim calls this SuccessfulPaymentResponse.
 */
export interface HelcimPurchaseResponse {
  transactionId: number;
  cardBatchId: number;
  /** ISO 8601 in Mountain Time. */
  dateCreated: string;
  status: HelcimTransactionStatus;
  /** Name of the user who initiated — defaults to "Helcim System" for API calls. */
  user: string;
  type: HelcimTransactionType;
  amount: number;
  currency: HelcimCurrency;
  avsResponse: string;
  cvvResponse: string;
  /** Two-letter code: VI | MC | AX | DI | etc. */
  cardType: string;
  approvalCode: string;
  cardToken: string;
  /** F6L4 format: "454545****5454" */
  cardNumber: string;
  cardHolderName: string;
  customerCode: string;
  invoiceNumber: string;
  /** Optional field Helcim surfaces when something non-fatal happened. */
  warning?: string;
}
