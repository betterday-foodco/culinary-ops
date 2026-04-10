import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

/**
 * DTO for POST /api/commerce/coupons/apply
 *
 * The customer sends the coupon code and their current cart context.
 * Cart items come from the WeeklyCartRecord or the live checkout state
 * on the frontend — the backend does NOT re-derive the cart from the DB
 * because the cart may have unsaved edits (added items, removed items)
 * that haven't been persisted yet.
 */
export class ApplyCouponDto {
  /** The coupon code the customer typed (will be normalized to uppercase) */
  @IsString()
  @IsNotEmpty()
  code: string;

  /**
   * The order ID to apply the coupon to. For pre-checkout carts this is
   * the pending CustomerOrder.id. For WeeklyCartRecord flows, the order
   * is created at cutoff — pass the cart record's linked order_id.
   */
  @IsString()
  @IsNotEmpty()
  order_id: string;

  /**
   * Sunday of the delivery week (ISO date string). Required for DOTW
   * coupons (rule 10). Optional for all other coupon types — if missing,
   * DOTW coupons will be rejected and non-DOTW coupons will pass.
   */
  @IsOptional()
  @IsDateString()
  delivery_week_sunday?: string;
}

/**
 * DTO for POST /api/commerce/coupons/remove
 */
export class RemoveCouponDto {
  @IsString()
  @IsNotEmpty()
  order_id: string;

  /** The CustomerCoupon.id to remove (not the Coupon.id) */
  @IsString()
  @IsNotEmpty()
  customer_coupon_id: string;
}

/**
 * DTO for POST /api/commerce/coupons/validate (preview only, no mutation)
 */
export class ValidateCouponDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  order_id: string;

  @IsOptional()
  @IsDateString()
  delivery_week_sunday?: string;
}
