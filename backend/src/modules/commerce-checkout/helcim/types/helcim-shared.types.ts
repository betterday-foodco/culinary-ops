/**
 * Shared Helcim type primitives used across multiple endpoint types.
 *
 * Source: https://devdocs.helcim.com (as of 2026-04-09). See
 * conner/data-model/helcim-integration.md §2 for the full API surface map.
 */

/** Currencies Helcim accepts. CAD is what we use. */
export type HelcimCurrency = 'CAD' | 'USD';

/** Transaction types Helcim's API returns. */
export type HelcimTransactionType = 'purchase' | 'preauth' | 'verify' | 'refund';

/** Transaction lifecycle status. */
export type HelcimTransactionStatus = 'APPROVED' | 'DECLINED';

/**
 * Payment types accepted by /v2/helcim-pay/initialize.
 * - `purchase` — charge the card AND tokenize it in one step (checkout)
 * - `preauth`  — authorize the funds without capturing (future use)
 * - `verify`   — zero-dollar auth + tokenize (save card without charging)
 */
export type HelcimPayPaymentType = 'purchase' | 'preauth' | 'verify';

/**
 * Billing address object passed to Purchase/Refund endpoints.
 * All fields optional per docs but most merchants send the full address
 * so Fraud Defender can run AVS checks.
 */
export interface HelcimAddress {
  name?: string;
  street1?: string;
  street2?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
}

/**
 * Helcim error response shape. The `errors` field is inconsistent —
 * sometimes a string, sometimes a field-keyed object, sometimes an
 * array. Callers must handle all three shapes defensively.
 */
export interface HelcimErrorResponse {
  errors: string | string[] | Record<string, string>;
}
