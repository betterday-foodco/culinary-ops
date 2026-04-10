import { Module } from '@nestjs/common';
import { CouponValidationService } from './coupon-validation.service';
import { CouponApplyService } from './coupon-apply.service';
import { CouponAdminService } from './coupon-admin.service';
import { CommerceCouponsController } from './commerce-coupons.controller';
import { CouponAdminController } from './coupon-admin.controller';

/**
 * Commerce Coupons feature module.
 *
 * Phase 1 — complete:
 *   - CouponValidationService: pure 10-rule domain validator
 *   - CouponApplyService: apply/remove with stacking, TOCTOU, transactions
 *   - CommerceCouponsController: POST apply, remove, validate endpoints
 *   - Error messages catalog: customer-facing copy for all failure codes
 *
 * Phase 2 — complete:
 *   - CouponAdminService: list (paginated + filtered), create, update, archive
 *   - CouponAdminController: GET list, GET detail, POST create, PATCH update,
 *     POST archive — admin-only routes at /api/commerce/admin/coupons
 *
 * Phase 3+ will add:
 *   - Personal coupon grants (grantCoupon to specific customers)
 *   - DOTW scheduler endpoints — a thin wrapper over Coupon CRUD with
 *     purpose=deal_of_the_week and delivery_week_sunday locked
 *   - Auto-apply best-coupon engine — picks the highest-savings
 *     auto_apply coupon across all eligible ones
 *
 * CommercePrismaService is injected from the global PrismaModule, so this
 * module does not need to re-import or re-provide it.
 */
@Module({
  controllers: [CommerceCouponsController, CouponAdminController],
  providers: [CouponValidationService, CouponApplyService, CouponAdminService],
  exports: [CouponValidationService, CouponApplyService, CouponAdminService],
})
export class CommerceCouponsModule {}
