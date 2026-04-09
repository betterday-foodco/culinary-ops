import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * POST /api/commerce/checkout/init body shape.
 *
 * Two modes:
 *
 *   1. **Save card only** (`isSaveCardOnly: true`, `amount: 0`)
 *      Customer is adding a payment method from Account Settings.
 *      HelcimPay.js runs in `verify` mode — zero-dollar auth + tokenize
 *      without charging. Requires a logged-in customer (`customerId`).
 *
 *   2. **Purchase** (`isSaveCardOnly: false`, `amount > 0`)
 *      Customer is completing a checkout with a cart. HelcimPay.js runs
 *      in `purchase` mode — charges the card AND tokenizes it in one call.
 *      `customerId` is optional — guest checkouts create a Helcim customer
 *      inline via the initialize request's `customerRequest` field, and
 *      our Customer row gets created during the confirm step.
 *
 * Research: conner/data-model/helcim-integration.md §4 (Flow A)
 */
export class InitCheckoutDto {
  /**
   * If true, the customer is only saving a card — no charge.
   * Maps to HelcimPay.js `paymentType: 'verify'` with `amount: 0`.
   */
  @IsBoolean()
  isSaveCardOnly!: boolean;

  /**
   * Charge amount in dollars. MUST be 0 when `isSaveCardOnly` is true.
   * When isSaveCardOnly is false, must be > 0.
   * Service-level validation enforces this cross-field rule.
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  /**
   * Currency code. Currently locked to CAD.
   */
  @IsIn(['CAD'])
  currency!: 'CAD';

  /**
   * Our Customer.id — null/undefined for guest checkouts.
   * When present, the service passes `customerCode: Customer.helcim_customer_id`
   * to Helcim so the new card attaches to the existing vault.
   */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /**
   * Our CustomerOrder.display_id to associate with the charge, for
   * reconciliation via invoiceNumber. Optional — when null, Helcim
   * generates its own invoice number.
   */
  @IsOptional()
  @IsString()
  invoiceNumber?: string;
}
