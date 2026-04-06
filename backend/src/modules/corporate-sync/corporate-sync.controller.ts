import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CorporateSyncService } from './corporate-sync.service';

@UseGuards(JwtAuthGuard)
@Controller('corporate-sync')
export class CorporateSyncController {
  constructor(private readonly service: CorporateSyncService) {}

  /** Preview corporate orders without touching any plan */
  @Get('orders')
  fetchOrders(@Query('week') week?: string) {
    return this.service.fetchOrders(week);
  }

  /** Fetch orders and apply quantities directly to a production plan */
  @Post('apply/:planId')
  applyToPlan(@Param('planId') planId: string, @Query('week') week?: string) {
    return this.service.applyToPlan(planId, week);
  }

  /** Push this week's meals from a production plan to betterday-app */
  @Post('publish-menu/:planId')
  publishMenu(@Param('planId') planId: string) {
    return this.service.publishMenu(planId);
  }
}
