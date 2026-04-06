import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseBoolPipe,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ProductionPlansService } from './production-plans.service';
import { CreateProductionPlanDto, UpdateProductionPlanDto } from './dto/production-plan.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
@Controller('production-plans')
export class ProductionPlansController {
  constructor(private readonly service: ProductionPlansService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  /** Must be declared before :id to avoid "current" being treated as a UUID */
  @Get('current')
  getCurrent() {
    return this.service.getCurrentPlan();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProductionPlanDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductionPlanDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Patch(':id/publish')
  publish(@Param('id') id: string, @Body('publish') publish: boolean) {
    return this.service.publishToKitchen(id, publish);
  }

  @Patch(':id/publish-corporate')
  publishCorporate(@Param('id') id: string, @Body('publish') publish: boolean) {
    return this.service.publishToCorporate(id, publish);
  }

  @Get(':id/sub-recipe-report')
  getSubRecipeReport(@Param('id') id: string) {
    return this.service.getSubRecipeReport(id);
  }

  @Get(':id/shopping-list')
  getShoppingList(@Param('id') id: string) {
    return this.service.getShoppingList(id);
  }
}
