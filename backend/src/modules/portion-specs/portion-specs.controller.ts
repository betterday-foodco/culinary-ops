import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { PortionSpecsService } from './portion-specs.service';
import { CreatePortionSpecDto, UpdatePortionSpecDto } from './dto/portion-spec.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('portion-specs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PortionSpecsController {
  constructor(private readonly portionSpecsService: PortionSpecsService) {}

  @Get()
  @Roles('admin', 'staff')
  findAll() {
    return this.portionSpecsService.findAll();
  }

  @Get('by-plan/:planId')
  @Roles('admin', 'staff', 'kitchen')
  findByPlan(@Param('planId') planId: string) {
    return this.portionSpecsService.findByPlan(planId);
  }

  @Get(':mealId')
  @Roles('admin', 'staff', 'kitchen')
  findByMeal(@Param('mealId') mealId: string) {
    return this.portionSpecsService.findByMeal(mealId);
  }

  @Post()
  @Roles('admin', 'staff')
  upsert(@Body() dto: CreatePortionSpecDto) {
    return this.portionSpecsService.upsert(dto);
  }

  @Patch(':id')
  @Roles('admin', 'staff')
  update(@Param('id') id: string, @Body() dto: UpdatePortionSpecDto) {
    return this.portionSpecsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin', 'staff')
  remove(@Param('id') id: string) {
    return this.portionSpecsService.remove(id);
  }
}
