import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProductionNumbersService } from './production-numbers.service';

@UseGuards(JwtAuthGuard)
@Controller('production-numbers')
export class ProductionNumbersController {
  constructor(private readonly service: ProductionNumbersService) {}

  @Get(':planId')
  getForPlan(@Param('planId') planId: string) {
    return this.service.getForPlan(planId);
  }

  @Get(':planId/shortages')
  getShortages(@Param('planId') planId: string) {
    return this.service.getShortages(planId);
  }

  @Post(':planId/wednesday')
  bulkUpsertWednesday(
    @Param('planId') planId: string,
    @Body() body: { entries: Array<{ sub_recipe_id: string; qty: number; unit?: string }> },
  ) {
    return this.service.bulkUpsertWednesday(planId, body.entries);
  }

  @Patch(':planId/:subRecipeId/thursday')
  updateThursday(
    @Param('planId') planId: string,
    @Param('subRecipeId') subRecipeId: string,
    @Body() body: { qty: number },
  ) {
    return this.service.updateThursday(planId, subRecipeId, body.qty);
  }
}
