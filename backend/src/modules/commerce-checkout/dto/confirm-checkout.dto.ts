import { IsNotEmpty, IsString } from 'class-validator';

/**
 * POST /api/commerce/checkout/confirm body shape.
 *
 * Posted by the browser after HelcimPay.js fires its SUCCESS postMessage.
 * The server looks up the session by `checkoutToken`, validates it,
 * parses the `eventMessage` to extract the transactionId, and (in the
 * secure path) looks up the transaction in Helcim to confirm it really
 * exists before persisting any of our own records.
 *
 * Research: conner/data-model/helcim-integration.md §4 (Flow A, step 8)
 */
export class ConfirmCheckoutDto {
  /**
   * The checkoutToken returned by /api/commerce/checkout/init. Acts as
   * both the session ID and the authentication token — possession is
   * proof the caller legitimately started this checkout (but NOT proof
   * that payment succeeded; that's verified separately server-side).
   */
  @IsString()
  @IsNotEmpty()
  checkoutToken!: string;

  /**
   * The raw `eventMessage` from HelcimPay.js's postMessage event.
   *
   * Typed as `unknown` because HelcimPay.js is inconsistent: sometimes
   * it sends a stringified JSON payload, sometimes a parsed object.
   * The service layer parses defensively — see HelcimService.confirmCheckout.
   *
   * Callers can pass the raw `event.data.eventMessage` value unchanged.
   */
  eventMessage!: unknown;
}
