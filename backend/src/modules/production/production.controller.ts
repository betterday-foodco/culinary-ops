import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ProductionEngineService } from '../../services/production-engine.service';
import { CostEngineService } from '../../services/cost-engine.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
@Controller('production')
export class ProductionController {
  constructor(
    private readonly productionEngine: ProductionEngineService,
    private readonly costEngine: CostEngineService,
  ) {}

  /**
   * Full production report for a date range.
   * GET /api/production/report?start_date=2024-01-01&end_date=2024-01-07
   */
  @Get('report')
  getFullReport(
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    this.validateDates(startDate, endDate);
    return this.productionEngine.generateProductionReport(
      new Date(startDate),
      new Date(endDate),
    );
  }

  /**
   * Meals report - quantities of each meal ordered.
   */
  @Get('meals-report')
  getMealsReport(
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    this.validateDates(startDate, endDate);
    return this.productionEngine.getMealsReport(
      new Date(startDate),
      new Date(endDate),
    );
  }

  /**
   * Sub-recipes report - total quantities needed per sub-recipe.
   */
  @Get('sub-recipes-report')
  getSubRecipesReport(
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    this.validateDates(startDate, endDate);
    return this.productionEngine.getSubRecipesReport(
      new Date(startDate),
      new Date(endDate),
    );
  }

  /**
   * Inventory shopping list - all raw ingredients needed.
   */
  @Get('shopping-list')
  getShoppingList(
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    this.validateDates(startDate, endDate);
    return this.productionEngine.getShoppingList(
      new Date(startDate),
      new Date(endDate),
    );
  }

  /**
   * Trigger recalculation of all costs.
   */
  @Post('recalculate-costs')
  recalculateCosts() {
    return this.costEngine.recalculateAll();
  }

  private validateDates(startDate: string, endDate: string) {
    if (!startDate || !endDate) {
      throw new BadRequestException('start_date and end_date are required');
    }
    if (isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) {
      throw new BadRequestException('Invalid date format');
    }
  }
}
