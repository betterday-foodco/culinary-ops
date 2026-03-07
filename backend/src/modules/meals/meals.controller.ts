import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MealsService } from './meals.service';
import { CreateMealDto, UpdateMealDto, AddMealComponentDto, UpdateMealComponentDto } from './dto/meal.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
@Controller('meals')
export class MealsController {
  constructor(private readonly service: MealsService) {}

  @Get()
  findAll(@Query('category') category?: string) {
    return this.service.findAll();
  }

  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }

  @Get('pricing')
  getPricing() {
    return this.service.getPricing();
  }

  @Get('cooking-sheet')
  getCookingSheet(@Query('category') category?: string) {
    return this.service.getCookingSheet(category);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateMealDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMealDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  // ─── Component CRUD ────────────────────────────────────────────────────────

  @Post(':id/components')
  addComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMealComponentDto,
  ) {
    return this.service.addComponent(id, dto);
  }

  @Patch(':id/components/:componentId')
  updateComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('componentId', ParseUUIDPipe) componentId: string,
    @Body() dto: UpdateMealComponentDto,
  ) {
    return this.service.updateComponent(id, componentId, dto);
  }

  @Delete(':id/components/:componentId')
  removeComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('componentId', ParseUUIDPipe) componentId: string,
  ) {
    return this.service.removeComponent(id, componentId);
  }
}
