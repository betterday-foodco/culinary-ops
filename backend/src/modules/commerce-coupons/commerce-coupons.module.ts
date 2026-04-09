import { Module } from '@nestjs/common';
import { CouponValidationService } from './coupon-validation.service';

/**
 * Commerce Coupons feature module.
 *
 * Phase 1 (this commit) — contains only CouponValidationService, the pure
 * domain validator that takes a cart + code and returns { valid, reason,
 * meta, savings }. No controller is wired up yet: apply/remove cart
 * endpoints land in Phase 1 leaves 3 and 4 on top of this same service.
 *
 * Phase 2+ will add:
 *   - CouponsController with POST /api/cart/apply-coupon and
 *     POST /api/cart/remove-coupon (Phase 1 leaves 3 + 4)
 *   - CouponAdminController + CRUD service (Phase 2)
 *   - DOTW scheduler endpoints — a thin wrapper over Coupon CRUD with
 *     purpose=deal_of_the_week and delivery_week_sunday locked (Phase 3)
 *   - Auto-apply best-coupon engine — picks the highest-savings
 *     auto_apply coupon across all eligible ones (deferred, see
 *     conner/deferred-decisions.md)
 *
 * CommercePrismaService is injected from the global PrismaModule, so this
 * module does not need to re-import or re-provide it.
 *
 * Related:
 *   - backend/prisma/commerce/schema.prisma (Coupon + CustomerCoupon models)
 *   - backend/prisma/commerce/migrations/20260409060452_coupon_power_up/
 *   - https://github.com/betterday-foodco/collab/blob/main/project-scope/NEXT_UP.md
 */
@Module({
  providers: [CouponValidationService],
  exports: [CouponValidationService],
})
export class CommerceCouponsModule {}
