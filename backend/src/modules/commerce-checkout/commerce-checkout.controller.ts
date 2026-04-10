import {
  BadRequestException,
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto';
import { InitCheckoutDto } from './dto/init-checkout.dto';
import { HelcimService } from './helcim/helcim.service';

/**
 * Customer-facing checkout endpoints.
 *
 * Route prefix: `/api/commerce/checkout`
 * (Global `/api` prefix set in main.ts via setGlobalPrefix.)
 *
 * Two endpoints, both unauthenticated at the route level:
 *
 *   POST /init     — create a HelcimPay.js checkout session
 *   POST /confirm  — verify the session result after the browser reports success
 *
 * No auth guard on either route because:
 *   - Guest checkouts (no customer row yet) need to work
 *   - The checkoutToken itself acts as a capability token for /confirm
 *     (if you don't have it, you can't confirm a session that isn't yours)
 *   - Init endpoint doesn't expose anything sensitive — it just creates
 *     a Helcim session tied to an amount + currency
 *
 * Real rate limiting is a Phase 6 concern (helcim-integration-plan.md §15).
 *
 * Research: conner/data-model/helcim-integration.md §4
 * Plan: conner/data-model/helcim-integration-plan.md §8
 */
@Controller('commerce/checkout')
export class CommerceCheckoutController {
  constructor(private readonly helcim: HelcimService) {}

  /**
   * Initialize a HelcimPay.js checkout session.
   *
   * Returns the `checkoutToken` the browser will pass to
   * `appendHelcimPayIframe(checkoutToken)` from the HelcimPay.js SDK.
   *
   * NEVER returns the `secretToken` — that stays server-side, persisted
   * in the HelcimCheckoutSession row.
   */
  @Post('init')
  @HttpCode(HttpStatus.OK)
  async initCheckout(@Body() dto: InitCheckoutDto): Promise<{ checkoutToken: string }> {
    // Cross-field validation: isSaveCardOnly ↔ amount
    if (dto.isSaveCardOnly && dto.amount !== 0) {
      throw new BadRequestException(
        'When isSaveCardOnly is true, amount must be 0. Use paymentType=verify semantics.',
      );
    }
    if (!dto.isSaveCardOnly && dto.amount <= 0) {
      throw new BadRequestException(
        'When isSaveCardOnly is false, amount must be greater than 0.',
      );
    }

    const result = await this.helcim.initCheckout({
      customerId: dto.customerId ?? null,
      helcimCustomerCode: null, // Service resolves from Customer row if customerId is set
      paymentType: dto.isSaveCardOnly ? 'verify' : 'purchase',
      amount: dto.amount,
      currency: dto.currency,
    });

    return { checkoutToken: result.checkoutToken };
  }

  /**
   * Confirm a checkout session after the browser reports success.
   *
   * The browser posts back `{ checkoutToken, eventMessage }`. The server:
   *   1. Looks up the HelcimCheckoutSession by checkoutToken
   *   2. Validates expiration + not-already-confirmed
   *   3. Parses the transactionId from eventMessage (defensively — the
   *      shape varies between JSON string and parsed object)
   *   4. [TODO Phase 2.5 sandbox] Verifies the transaction exists in
   *      Helcim via a server-side GET
   *   5. Persists the resulting Customer / PaymentMethod / CustomerOrder
   *   6. Marks the session confirmed
   *
   * Returns the resulting identifiers. Idempotent — a second POST with
   * the same checkoutToken returns the original result.
   */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirmCheckout(@Body() dto: ConfirmCheckoutDto): Promise<{
    orderId: string | null;
    paymentMethodId: string | null;
    status: 'confirmed';
  }> {
    return this.helcim.confirmCheckout({
      checkoutToken: dto.checkoutToken,
      eventMessage: dto.eventMessage,
    });
  }
}
