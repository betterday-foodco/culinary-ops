import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CouponAdminService } from './coupon-admin.service';
import {
  ListCouponsDto,
  CreateCouponDto,
  UpdateCouponDto,
} from './dto/admin-coupon.dto';

/**
 * Admin controller for coupon CRUD operations.
 *
 * Route prefix: /api/commerce/admin/coupons
 *
 * Separate from the customer-facing CommerceCouponsController because:
 *   - Different auth: admin session vs customer session
 *   - Different operations: CRUD vs apply/remove/validate
 *   - Different response shapes: full coupon objects vs savings summaries
 *
 * Auth: currently unprotected (dev mode). When real auth lands, add an
 * @AdminGuard() or role-based guard. The DOTW scheduler access control
 * question (see deferred-decisions.md) will determine whether this gets
 * a single admin role or granular permissions.
 *
 * Endpoints:
 *   GET    /                — paginated list with filters
 *   GET    /:id             — single coupon detail
 *   POST   /                — create a new coupon
 *   PATCH  /:id             — update an existing coupon
 *   POST   /:id/archive     — soft-delete (deactivate + revoke applied)
 */
@Controller('commerce/admin/coupons')
export class CouponAdminController {
  constructor(private readonly adminService: CouponAdminService) {}

  @Get()
  async list(@Query() dto: ListCouponsDto) {
    return this.adminService.list(dto);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.adminService.getById(id);
  }

  @Post()
  async create(@Body() dto: CreateCouponDto) {
    return this.adminService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.adminService.update(id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(@Param('id') id: string) {
    return this.adminService.archive(id);
  }
}
