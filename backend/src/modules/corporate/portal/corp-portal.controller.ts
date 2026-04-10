import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CorpPortalService } from './corp-portal.service';
import { CorporateUser } from '../../auth/jwt.strategy';

@Controller('corp-portal')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CorpPortalController {
  constructor(private readonly svc: CorpPortalService) {}

  /**
   * GET /api/corp-portal/menu
   * Returns the current published weekly menu with tier pricing for this employee.
   */
  @Get('menu')
  @Roles('corp_employee', 'corp_manager')
  getMenu(@Request() req: { user: CorporateUser }) {
    return this.svc.getWeeklyMenu(req.user);
  }

  /**
   * POST /api/corp-portal/orders
   * Body: { items: [{ meal_id }], delivery_date? }
   * Tier is calculated server-side based on weekly order count — not trusted from client.
   */
  @Post('orders')
  @HttpCode(201)
  @Roles('corp_employee', 'corp_manager')
  placeOrder(@Request() req: { user: CorporateUser }, @Body() body: any) {
    return this.svc.placeOrder(req.user, body);
  }

  /**
   * GET /api/corp-portal/orders
   * Returns this employee's order history (managers see all company orders).
   */
  @Get('orders')
  @Roles('corp_employee', 'corp_manager')
  getMyOrders(@Request() req: { user: CorporateUser }) {
    return this.svc.getMyOrders(req.user);
  }

  /**
   * GET /api/corp-portal/week-order-count?delivery_date=YYYY-MM-DD
   * Returns how many meals this employee has already ordered for the given week.
   * Used by the frontend to calculate which tier the NEXT meal will be in.
   */
  @Get('week-order-count')
  @Roles('corp_employee', 'corp_manager')
  getWeekOrderCount(
    @Request() req: { user: CorporateUser },
    @Query('delivery_date') deliveryDate?: string,
  ) {
    return this.svc.getWeekOrderCount(req.user, deliveryDate);
  }

  /**
   * GET /api/corp-portal/profile
   * Returns employee or manager profile + company info.
   */
  @Get('profile')
  @Roles('corp_employee', 'corp_manager')
  getProfile(@Request() req: { user: CorporateUser }) {
    return this.svc.getMyProfile(req.user);
  }

  /**
   * PATCH /api/corp-portal/profile/email
   * Body: { email: string }
   * Employee updates their own email address.
   */
  @Patch('profile/email')
  @Roles('corp_employee')
  updateMyEmail(
    @Request() req: { user: CorporateUser },
    @Body() body: { email: string },
  ) {
    return this.svc.updateMyEmail(req.user, body.email);
  }

  /**
   * PATCH /api/corp-portal/orders/:orderId/items/:itemId
   * Body: { meal_id: string }
   * Swap a pending order's line item for a different meal.
   */
  @Patch('orders/:orderId/items/:itemId')
  @Roles('corp_employee', 'corp_manager')
  swapOrderItem(
    @Request() req: { user: CorporateUser },
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @Body() body: { meal_id: string },
  ) {
    return this.svc.swapOrderItem(req.user, orderId, itemId, body.meal_id);
  }
}
