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
import { SubRecipesService } from './sub-recipes.service';
import {
  CreateSubRecipeDto,
  UpdateSubRecipeDto,
  AddSubRecipeComponentDto,
  UpdateSubRecipeComponentDto,
} from './dto/sub-recipe.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
@Controller('sub-recipes')
export class SubRecipesController {
  constructor(private readonly service: SubRecipesService) {}

  @Get()
  findAll(@Query('station_tag') stationTag?: string) {
    return this.service.findAll(stationTag);
  }

  @Get('station-tags')
  getStationTags() {
    return this.service.getStationTags();
  }

  @Get('production-days')
  getProductionDays() {
    return this.service.getProductionDays();
  }

  @Get('prep-sheet')
  getPrepSheet(
    @Query('station') stationTag?: string,
    @Query('day') day?: string,
  ) {
    return this.service.getPrepSheet(stationTag, day);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSubRecipeDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubRecipeDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  // ── Individual component CRUD ─────────────────────────────────────────────

  @Post(':id/components')
  addComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSubRecipeComponentDto,
  ) {
    return this.service.addComponent(id, dto);
  }

  @Patch(':id/components/:componentId')
  updateComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('componentId') componentId: string,
    @Body() dto: UpdateSubRecipeComponentDto,
  ) {
    return this.service.updateComponent(id, componentId, dto);
  }

  @Delete(':id/components/:componentId')
  removeComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('componentId') componentId: string,
  ) {
    return this.service.removeComponent(id, componentId);
  }
}
