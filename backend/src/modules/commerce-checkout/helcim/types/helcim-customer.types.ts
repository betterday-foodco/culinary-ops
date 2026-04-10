/**
 * Types for the Helcim Customer API + Card management endpoints.
 *
 *   POST   /v2/customers
 *   GET    /v2/customers/{id}
 *   PUT    /v2/customers/{id}
 *   GET    /v2/customers/{id}/cards
 *   GET    /v2/customers/{id}/cards/{cardId}
 *   DELETE /v2/customers/{id}/cards/{cardId}
 *   PUT    /v2/customers/{id}/cards/{cardId}/default
 *
 * Source: https://devdocs.helcim.com/docs/customer-api
 * Research: conner/data-model/helcim-integration.md §2
 */

export interface HelcimCreateCustomerRequest {
  /** Required if businessName absent. */
  contactName?: string;
  /** Required if contactName absent. */
  businessName?: string;
  cellPhone?: string;
  email?: string;
  billingAddress?: HelcimCustomerAddress;
  shippingAddress?: HelcimCustomerAddress;
}

export interface HelcimCustomerAddress {
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
 * Helcim customer object. The `customerCode` field is the stable
 * identifier we persist as Customer.helcim_customer_id.
 *
 * Open question (see helcim-integration.md §14 Q5): whether customerCode
 * is Helcim-generated on POST /customers or merchant-supplied. Our code
 * treats it as read-only and populated by Helcim's response.
 */
export interface HelcimCustomerResponse {
  customerCode: string;
  contactName?: string;
  businessName?: string;
  cellPhone?: string;
  email?: string;
  billingAddress?: HelcimCustomerAddress;
  shippingAddress?: HelcimCustomerAddress;
  dateCreated?: string;
  dateUpdated?: string;
}

/**
 * Card object attached to a Helcim customer. One customer can have many.
 * The `cardToken` is the reference we use on /v2/payment/purchase calls.
 */
export interface HelcimCardResponse {
  id: number;
  cardHolderName: string;
  /** First 6 + last 4 format: "454545****5454" */
  cardF6L4: string;
  cardToken: string;
  /** "MMYY" format, e.g. "0125". */
  cardExpiry: string;
  dateCreated: string;
  dateUpdated: string;
}

/** List response for /v2/customers/{id}/cards. */
export type HelcimCardListResponse = HelcimCardResponse[];
