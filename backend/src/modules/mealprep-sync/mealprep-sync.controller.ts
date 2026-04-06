import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MealPrepSyncService } from './mealprep-sync.service';

@UseGuards(JwtAuthGuard)
@Controller('mealprep-sync')
export class MealPrepSyncController {
  constructor(private svc: MealPrepSyncService) {}

  /** GET /mealprep-sync/config */
  @Get('config')
  getConfig() {
    return this.svc.getIntegrationConfig();
  }

  /** POST /mealprep-sync/publish/:planId — push weekly menu to MealPrep platform */
  @Post('publish/:planId')
  publishMenu(@Param('planId') planId: string) {
    return this.svc.publishWeeklyMenu(planId);
  }
}
