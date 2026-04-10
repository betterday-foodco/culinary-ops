import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentCustomer } from '../commerce-customers/decorators/current-customer.decorator';
import { CouponApplyService } from './coupon-apply.service';
import {
  ApplyCouponDto,
  RemoveCouponDto,
  ValidateCouponDto,
} from './dto/apply-coupon.dto';

/**
 * Commerce Coupons controller — customer-facing coupon operations.
 *
 * Route prefix: /api/commerce/coupons
 * (The global /api prefix is set in main.ts via setGlobalPrefix.)
 *
 * Auth: all routes require @CurrentCustomer() — currently the dev stub
 * header `x-dev-customer-id`. When real auth lands, this becomes the
 * authenticated customer from the session token.
 *
 * Three endpoints:
 *   POST /apply    — apply a coupon code to an order (mutating)
 *   POST /remove   — remove an applied coupon from an order (mutating)
 *   POST /validate — preview-only validation (no mutation, no side effects)
 *
 * All three return structured JSON with customer-facing error messages
 * from the error-messages catalog. The frontend renders `title` + `detail`
 * directly — no client-side error message logic needed.
 *
 * Admin coupon CRUD (list, create, update, archive) lives in a separate
 * controller (Phase 2, not built yet).
 */
@Controller('commerce/coupons')
export class CommerceCouponsController {
  constructor(private readonly applyService: CouponApplyService) {}

  /**
   * Apply a coupon code to an order.
   *
   * On success: returns the coupon details, savings, new order total,
   * and how many existing coupons were displaced (last-one-wins).
   *
   * On failure: returns the structured error with title + detail for
   * the frontend to render. HTTP 200 in both cases — the `success`
   * boolean discriminates. This avoids the frontend having to parse
   * HTTP error bodies differently from success bodies.
   */
  @Post('apply')
  @HttpCode(HttpStatus.OK)
  async applyCoupon(
    @CurrentCustomer() customerId: string,
    @Body() dto: ApplyCouponDto,
  ) {
    return this.applyService.applyCoupon(
      customerId,
      dto.order_id,
      dto.code,
      dto.delivery_week_sunday,
    );
  }

  /**
   * Remove an applied coupon from an order.
   *
   * Reverts the CustomerCoupon to 'available' status, decrements the
   * global uses_count, and recalculates the order total.
   */
  @Post('remove')
  @HttpCode(HttpStatus.OK)
  async removeCoupon(
    @CurrentCustomer() customerId: string,
    @Body() dto: RemoveCouponDto,
  ) {
    return this.applyService.removeCoupon(
      customerId,
      dto.order_id,
      dto.customer_coupon_id,
      // No delivery_week_sunday needed for remove — it's only used for
      // DOTW validation during apply. The recalculation of remaining
      // coupons' savings doesn't need it because those coupons already
      // passed DOTW validation when they were applied.
    );
  }

  /**
   * Preview-only validation — does NOT apply the coupon.
   *
   * Used by the checkout UI to show "You'd save $X" in real time as
   * the customer types a code, before they click "Apply." Also used
   * by the admin test tool in the coupon create form.
   *
   * Safe to call repeatedly — no mutations, no side effects.
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validatePreview(
    @CurrentCustomer() customerId: string,
    @Body() dto: ValidateCouponDto,
  ) {
    return this.applyService.validatePreview(
      customerId,
      dto.order_id,
      dto.code,
      dto.delivery_week_sunday,
    );
  }
}
