import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CorpPortalService } from './corp-portal.service';
import { CorporateUser } from '../../auth/jwt.strategy';

@Controller('api/corp-portal')
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
   * Body: { items: [{ meal_id, tier }], delivery_date? }
   * Place a new order.
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
   * GET /api/corp-portal/profile
   * Returns employee or manager profile + company info.
   */
  @Get('profile')
  @Roles('corp_employee', 'corp_manager')
  getProfile(@Request() req: { user: CorporateUser }) {
    return this.svc.getMyProfile(req.user);
  }
}
