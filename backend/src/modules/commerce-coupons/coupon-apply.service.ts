import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CommercePrismaService } from '../../prisma/commerce-prisma.service';
import {
  CouponValidationService,
  CouponValidationContext,
  CouponValidationCartItem,
  CouponValidationResult,
} from './coupon-validation.service';
import { getCouponErrorMessage } from './error-messages';

// Prisma import is used only for TransactionIsolationLevel. When the
// commerce client isn't generated (e.g. in CI or fresh clones), we
// fall back to a string literal. The runtime Prisma client accepts both.
let TransactionIsolationLevel: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PrismaImport = require('@prisma/commerce-client');
  TransactionIsolationLevel = PrismaImport.Prisma?.TransactionIsolationLevel;
} catch {
  TransactionIsolationLevel = { Serializable: 'Serializable' };
}

/**
 * CouponApplyService — mutating operations for applying and removing
 * coupons on customer orders.
 *
 * This is Phase 1 leaves 3 + 4 of the coupon module roadmap. It calls
 * the existing CouponValidationService for rule checks, then persists
 * the result inside a transaction to prevent race conditions.
 *
 * STACKING POLICY:
 *   - Subscription discounts live in a separate lane (CustomerOrder.subscriber_discount).
 *     Coupons ALWAYS stack on top of subscription discounts per business decision.
 *   - Coupon-on-coupon stacking is governed by the `stackable` flag on each Coupon.
 *   - If a customer applies a second non-stackable coupon, LAST ONE WINS:
 *     the previous coupon is removed and the new one takes its place.
 *   - Manual codes (customer typed it) always beat auto-applied codes.
 *     If an auto-applied coupon is blocking, it gets replaced silently.
 *
 * TOCTOU PROTECTION:
 *   The validator is re-run inside the same transaction that persists the
 *   CustomerCoupon row and increments the global uses_count. This prevents
 *   the gap where a coupon expires or hits its limit between validation
 *   and application.
 */
@Injectable()
export class CouponApplyService {
  private readonly logger = new Logger(CouponApplyService.name);

  // Commerce is typed as `any` to avoid compile errors when the
  // @prisma/commerce-client package hasn't been generated yet (fresh
  // clone, CI without prisma generate). At runtime it's always the real
  // CommercePrismaService extending PrismaClient with full model access.
  private readonly commerce: any;
  private readonly validator: CouponValidationService;

  constructor(
    commerce: CommercePrismaService,
    validator: CouponValidationService,
  ) {
    this.commerce = commerce;
    this.validator = validator;
  }

  /**
   * Apply a coupon code to an order. The full flow:
   *
   * 1. Load the order + existing applied coupons
   * 2. Build the validation context from the order's line items
   * 3. Run the 10-rule validator
   * 4. Resolve stacking conflicts (last-one-wins for non-stackable)
   * 5. Persist inside a transaction:
   *    a. Re-validate (TOCTOU check)
   *    b. Remove displaced coupons if any
   *    c. Create/update CustomerCoupon row with status=applied
   *    d. Increment Coupon.uses_count
   *    e. Recalculate order totals
   */
  async applyCoupon(
    customerId: string,
    orderId: string,
    code: string,
    deliveryWeekSunday?: string,
  ): Promise<ApplyCouponResult> {
    // ─── 1. Load the order ────────────────────────────────────────────────
    const order = await this.commerce.customerOrder.findUnique({
      where: { id: orderId },
      include: {
        coupon_redemptions: {
          where: { status: 'applied' },
          include: { coupon: true },
        },
        subscription: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (order.customer_id !== customerId) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (order.is_locked) {
      throw new BadRequestException(
        'This order is locked and cannot be modified.',
      );
    }

    // ─── 2. Build validation context from order line items ────────────────
    const context = this.buildValidationContext(
      customerId,
      order,
      code,
      deliveryWeekSunday,
    );

    // ─── 3. Validate (first pass — outside transaction for fast rejection)
    const firstPass: CouponValidationResult =
      await this.validator.validate(context);
    if (!(firstPass as any).valid) {
      const fp = firstPass as any;
      const errorMsg = getCouponErrorMessage(fp.reason, fp.meta);
      return {
        success: false,
        reason: fp.reason,
        title: errorMsg.title,
        detail: errorMsg.detail,
        meta: fp.meta,
      };
    }

    const successPass = firstPass as any;
    const newCoupon = successPass.coupon;
    const newSavings = successPass.savings;

    // ─── 4. Resolve stacking conflicts ────────────────────────────────────
    const existingApplied = order.coupon_redemptions;
    const couponsToRemove: string[] = []; // CustomerCoupon IDs to displace

    for (const existing of existingApplied) {
      const bothStackable = newCoupon.stackable && existing.coupon.stackable;

      if (!bothStackable) {
        // Non-stackable conflict — last one wins.
        // If the existing coupon is auto-applied and the new one is manual,
        // the manual one wins regardless. If both are manual, last one wins.
        couponsToRemove.push(existing.id);
        this.logger.log(
          `Displacing coupon ${existing.coupon.code} (CustomerCoupon ${existing.id}) — ` +
            `replaced by ${code} (last-one-wins)`,
        );
      }
      // If both are stackable, they coexist — no conflict.
    }

    // ─── 5. Persist inside a transaction ──────────────────────────────────
    const result = await this.commerce.$transaction(
      async (tx) => {
        // 5a. TOCTOU re-validation: re-check the global usage limit inside
        // the transaction. This is the critical race-condition fix — two
        // customers can't both sneak past the limit because the transaction
        // serializes the read + increment.
        const couponNow = await tx.coupon.findUnique({
          where: { id: newCoupon.id },
        });
        if (!couponNow) {
          throw new ConflictException('Coupon was deleted during application.');
        }
        if (!couponNow.is_active) {
          throw new ConflictException('Coupon was deactivated during application.');
        }
        if (couponNow.expires_at && couponNow.expires_at < new Date()) {
          throw new ConflictException('Coupon expired during application.');
        }
        if (
          couponNow.max_uses !== null &&
          couponNow.uses_count >= couponNow.max_uses
        ) {
          throw new ConflictException(
            'Coupon reached its usage limit. Please try another code.',
          );
        }

        // 5b. Remove displaced coupons
        for (const customerCouponId of couponsToRemove) {
          await tx.customerCoupon.update({
            where: { id: customerCouponId },
            data: {
              status: 'available',
              applied_at: null,
              redeemed_order_id: null,
            },
          });
        }

        // 5c. Create or update CustomerCoupon row
        // Use upsert: if the customer previously applied this coupon and
        // it was reverted to 'available', we update the existing row
        // rather than creating a duplicate (unique constraint on
        // [customer_id, coupon_id]).
        const customerCoupon = await tx.customerCoupon.upsert({
          where: {
            customer_id_coupon_id: {
              customer_id: customerId,
              coupon_id: newCoupon.id,
            },
          },
          create: {
            customer_id: customerId,
            coupon_id: newCoupon.id,
            status: 'applied',
            applied_at: new Date(),
            redeemed_order_id: orderId,
          },
          update: {
            status: 'applied',
            applied_at: new Date(),
            redeemed_order_id: orderId,
          },
        });

        // 5d. Increment global uses_count atomically
        await tx.coupon.update({
          where: { id: newCoupon.id },
          data: { uses_count: { increment: 1 } },
        });

        // 5e. Recalculate order discount totals
        // Sum all currently-applied coupons' savings on this order.
        // The new coupon's savings + any remaining stackable coupons.
        const allApplied = await tx.customerCoupon.findMany({
          where: {
            redeemed_order_id: orderId,
            status: 'applied',
          },
          include: { coupon: { include: { tiers: true } } },
        });

        let totalCodeDiscount = 0;
        for (const cc of allApplied) {
          // Re-compute each coupon's savings against the current order.
          // This handles the edge case where removing a coupon changes
          // the subtotal bracket for a tiered coupon.
          const savingsCtx = this.buildValidationContext(
            customerId,
            order,
            cc.coupon.code,
            deliveryWeekSunday,
          );
          const savingsResult = await this.validator.validate(savingsCtx);
          if (savingsResult.valid) {
            totalCodeDiscount += savingsResult.savings;
          }
        }

        const codeDiscount = Math.round(totalCodeDiscount * 100) / 100;
        const subtotal = Number(order.subtotal);
        const subscriberDiscount = Number(order.subscriber_discount);
        const tax = Number(order.tax);
        const deliveryFee = Number(order.delivery_fee);
        const giftCardAmount = Number(order.gift_card_amount);
        const pointsRedeemed = Number(order.points_redeemed);

        const newTotal = Math.max(
          0,
          subtotal -
            subscriberDiscount -
            codeDiscount -
            giftCardAmount -
            pointsRedeemed +
            tax +
            deliveryFee,
        );

        await tx.customerOrder.update({
          where: { id: orderId },
          data: {
            code_discount: codeDiscount,
            total: Math.round(newTotal * 100) / 100,
          },
        });

        return {
          customerCouponId: customerCoupon.id,
          codeDiscount,
          newTotal: Math.round(newTotal * 100) / 100,
          displacedCoupons: couponsToRemove.length,
        };
      },
      {
        // Serializable isolation prevents two concurrent apply calls from
        // both passing the global limit check.
        isolationLevel: TransactionIsolationLevel?.Serializable ?? 'Serializable',
        timeout: 10000,
      },
    );

    return {
      success: true,
      coupon_code: newCoupon.code,
      coupon_name: newCoupon.name,
      savings: newSavings,
      code_discount: result.codeDiscount,
      new_total: result.newTotal,
      displaced_coupons: result.displacedCoupons,
      customer_coupon_id: result.customerCouponId,
    };
  }

  /**
   * Remove a coupon from an order. Reverts the CustomerCoupon to
   * 'available' status and recalculates the order total.
   */
  async removeCoupon(
    customerId: string,
    orderId: string,
    customerCouponId: string,
    deliveryWeekSunday?: string,
  ): Promise<RemoveCouponResult> {
    const order = await this.commerce.customerOrder.findUnique({
      where: { id: orderId },
      include: {
        coupon_redemptions: {
          where: { status: 'applied' },
          include: { coupon: { include: { tiers: true } } },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (order.customer_id !== customerId) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (order.is_locked) {
      throw new BadRequestException(
        'This order is locked and cannot be modified.',
      );
    }

    const target = order.coupon_redemptions.find(
      (cc) => cc.id === customerCouponId,
    );
    if (!target) {
      throw new NotFoundException(
        `Coupon ${customerCouponId} is not applied to this order.`,
      );
    }

    await this.commerce.$transaction(async (tx) => {
      // Revert the CustomerCoupon
      await tx.customerCoupon.update({
        where: { id: customerCouponId },
        data: {
          status: 'available',
          applied_at: null,
          redeemed_order_id: null,
        },
      });

      // Decrement global uses_count (it was incremented at apply time)
      await tx.coupon.update({
        where: { id: target.coupon_id },
        data: { uses_count: { decrement: 1 } },
      });

      // Recalculate remaining coupons' savings
      const remaining = order.coupon_redemptions.filter(
        (cc) => cc.id !== customerCouponId,
      );

      let totalCodeDiscount = 0;
      for (const cc of remaining) {
        const savingsCtx = this.buildValidationContext(
          customerId,
          order,
          cc.coupon.code,
          deliveryWeekSunday,
        );
        const savingsResult = await this.validator.validate(savingsCtx);
        if (savingsResult.valid) {
          totalCodeDiscount += savingsResult.savings;
        }
      }

      const codeDiscount = Math.round(totalCodeDiscount * 100) / 100;
      const subtotal = Number(order.subtotal);
      const subscriberDiscount = Number(order.subscriber_discount);
      const tax = Number(order.tax);
      const deliveryFee = Number(order.delivery_fee);
      const giftCardAmount = Number(order.gift_card_amount);
      const pointsRedeemed = Number(order.points_redeemed);

      const newTotal = Math.max(
        0,
        subtotal -
          subscriberDiscount -
          codeDiscount -
          giftCardAmount -
          pointsRedeemed +
          tax +
          deliveryFee,
      );

      await tx.customerOrder.update({
        where: { id: orderId },
        data: {
          code_discount: codeDiscount,
          total: Math.round(newTotal * 100) / 100,
        },
      });
    });

    return {
      success: true,
      removed_code: target.coupon.code,
    };
  }

  /**
   * Preview-only validation. Runs the 10-rule validator without mutating
   * anything. Used by the checkout UI to show "You'd save $X" before the
   * customer commits, and by the admin test tool.
   */
  async validatePreview(
    customerId: string,
    orderId: string,
    code: string,
    deliveryWeekSunday?: string,
  ): Promise<ValidatePreviewResult> {
    const order = await this.commerce.customerOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (order.customer_id !== customerId) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const context = this.buildValidationContext(
      customerId,
      order,
      code,
      deliveryWeekSunday,
    );

    const result: CouponValidationResult =
      await this.validator.validate(context);

    if (!(result as any).valid) {
      const r = result as any;
      const errorMsg = getCouponErrorMessage(r.reason, r.meta);
      return {
        valid: false,
        reason: r.reason,
        title: errorMsg.title,
        detail: errorMsg.detail,
      };
    }

    const s = result as any;
    return {
      valid: true,
      coupon_code: s.coupon.code,
      coupon_name: s.coupon.name,
      savings: s.savings,
      discount_type: s.coupon.type,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Build a CouponValidationContext from a CustomerOrder's line_items JSON.
   * The order stores line items as a JSON snapshot: [{meal_id, name, qty,
   * price_snapshot, meal_code?, category?, is_on_sale?}].
   */
  private buildValidationContext(
    customerId: string,
    order: { line_items: any; subtotal: any },
    code: string,
    deliveryWeekSunday?: string,
  ): CouponValidationContext {
    // Parse line_items JSON into validation cart items
    const rawItems: any[] = Array.isArray(order.line_items)
      ? order.line_items
      : [];

    const cartItems: CouponValidationCartItem[] = rawItems.map((item) => ({
      meal_code: item.meal_code ?? item.meal_id ?? '',
      meal_name: item.name ?? item.meal_name,
      category: item.category,
      quantity: item.qty ?? item.quantity ?? 1,
      price: item.price_snapshot ?? item.price ?? 0,
      is_on_sale: item.is_on_sale ?? false,
    }));

    const cartSubtotal = Number(order.subtotal);

    return {
      code,
      customer_id: customerId,
      cart_items: cartItems,
      cart_subtotal: cartSubtotal,
      delivery_week_sunday: deliveryWeekSunday
        ? new Date(deliveryWeekSunday)
        : undefined,
    };
  }
}

// ─── Result types ───────────────────────────────────────────────────────────

export type ApplyCouponResult =
  | {
      success: true;
      coupon_code: string;
      coupon_name: string;
      savings: number;
      code_discount: number;
      new_total: number;
      displaced_coupons: number;
      customer_coupon_id: string;
    }
  | {
      success: false;
      reason: string;
      title: string;
      detail: string;
      meta?: any;
    };

export type RemoveCouponResult = {
  success: true;
  removed_code: string;
};

export type ValidatePreviewResult =
  | {
      valid: true;
      coupon_code: string;
      coupon_name: string;
      savings: number;
      discount_type: string;
    }
  | {
      valid: false;
      reason: string;
      title: string;
      detail: string;
    };
