/**
 * Types for POST https://api.helcim.com/v2/helcim-pay/initialize
 *
 * Creates a HelcimPay.js checkout session. The browser later uses the
 * returned checkoutToken to render the iframe via appendHelcimPayIframe().
 * The secretToken stays server-side and is persisted in HelcimCheckoutSession.
 *
 * Source: https://devdocs.helcim.com/reference/checkout-init
 * Research: conner/data-model/helcim-integration.md §2 + §4
 */

import type { HelcimCurrency, HelcimPayPaymentType } from './helcim-shared.types';

/**
 * Full request body for /v2/helcim-pay/initialize. Optional fields are
 * left as `?` per the Helcim docs — only paymentType, amount, and
 * currency are mandatory.
 */
export interface HelcimPayInitRequest {
  paymentType: HelcimPayPaymentType;
  amount: number;
  currency: HelcimCurrency;

  /** Attach the new card to an existing Helcim customer vault. */
  customerCode?: string;

  /** Create a new Helcim customer inline (alternative to customerCode). */
  customerRequest?: HelcimCustomerInlineRequest;

  /** Existing invoice to charge against (we use our display_id instead). */
  invoiceNumber?: string;

  /** Inline invoice creation (we don't use — our orders are the source of truth). */
  invoiceRequest?: unknown;

  /** Payment method(s) the modal offers: 'cc' | 'ach' | 'cc-ach'. Default 'cc'. */
  paymentMethod?: 'cc' | 'ach' | 'cc-ach';

  /** 1 = show partial-payment UI, 0 = don't. Default 0. */
  allowPartial?: 0 | 1;

  /** 1 = apply the merchant's convenience fee rate to credit card payments. */
  hasConvenienceFee?: 0 | 1;

  /** Dollar tax amount (2 decimals). We compute tax and pass the total. */
  taxAmount?: number;

  /** 1 = hide existing vault cards from the UI (force new-card entry). */
  hideExistingPaymentDetails?: 0 | 1;

  /** 1 = mark the new card as the customer's default. */
  setAsDefaultPaymentMethod?: 0 | 1;

  /** Hardware terminal ID (not used — we're e-commerce only). */
  terminalId?: number;

  /** true = show confirmation screen after success, false = close immediately. */
  confirmationScreen?: boolean;

  /** Enable digital wallets (Google Pay). 'google' | 'apple' | 'both'. */
  digitalWallet?: string;

  /** 0 = no contact fields in modal, 1 = show phone/email fields. */
  displayContactFields?: 0 | 1;

  /** Custom iframe styling. */
  customStyling?: Record<string, unknown>;
}

/**
 * Shape for the inline customer-creation object on the initialize request.
 * Minimal — just enough to create a Helcim customer from our data.
 */
export interface HelcimCustomerInlineRequest {
  contactName?: string;
  businessName?: string;
  cellPhone?: string;
  email?: string;
  billingAddress?: {
    name?: string;
    street1?: string;
    street2?: string;
    city?: string;
    province?: string;
    country?: string;
    postalCode?: string;
  };
}

/**
 * Response from /v2/helcim-pay/initialize.
 *
 * Both tokens are valid for ~60 minutes after issuance.
 * - checkoutToken: sent to the browser to render the iframe.
 * - secretToken: STAYS SERVER-SIDE. Used for future hash verification
 *   (not implemented yet — see helcim-integration.md §4 for the design
 *   choice to rely on server-side transaction lookup instead).
 */
export interface HelcimPayInitResponse {
  checkoutToken: string;
  secretToken: string;
}

/**
 * Shape of the `window.postMessage` event HelcimPay.js fires when the
 * customer completes (or aborts) the checkout in the iframe.
 *
 * Note: `eventMessage` is inconsistently typed — sometimes a JSON string,
 * sometimes a parsed object, sometimes undefined. The service layer must
 * defensively parse it. Betterday-app's pattern:
 *
 *   var txnData = typeof event.data.eventMessage === 'string'
 *     ? JSON.parse(event.data.eventMessage)
 *     : (event.data.eventMessage || {});
 */
export interface HelcimPayMessageEvent {
  /** Format: `helcim-pay-js-<checkoutToken>` */
  eventName: string;

  /**
   * Observed values:
   * - `SUCCESS` — customer completed payment successfully
   * - `ABORTED` — customer closed the modal without completing
   * - `HIDE` — internal signal for the SDK to hide the iframe
   */
  eventStatus: 'SUCCESS' | 'ABORTED' | 'HIDE' | string;

  /**
   * Payload for SUCCESS events. Stringified JSON or parsed object.
   * Contains transactionId, cardToken, customerCode, etc.
   */
  eventMessage?: string | HelcimPayMessageSuccessPayload;
}

/**
 * The parsed shape of a successful HelcimPay.js message. Not all fields
 * are guaranteed — `transactionId` is the only one we can rely on.
 */
export interface HelcimPayMessageSuccessPayload {
  transactionId?: number | string;
  id?: number | string;
  status?: string;
  type?: string;
  amount?: number;
  currency?: string;
  cardToken?: string;
  customerCode?: string;
  cardNumber?: string;
  cardHolderName?: string;
  cardType?: string;
  approvalCode?: string;
  avsResponse?: string;
  cvvResponse?: string;
  /** HMAC hash of the response for optional validateHash verification. */
  hash?: string;
}
