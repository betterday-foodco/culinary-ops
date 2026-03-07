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
import { IngredientsService } from './ingredients.service';
import {
  CreateIngredientDto,
  UpdateIngredientDto,
  UpdateStockBulkDto,
} from './dto/ingredient.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly service: IngredientsService) {}

  @Get()
  findAll(@Query('category') category?: string) {
    return this.service.findAll(category);
  }

  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }

  // ── Inventory endpoints (must be before :id to avoid route conflicts) ────

  @Get('inventory')
  getInventoryReport(@Query('plan_id') planId: string) {
    return this.service.getInventoryReport(planId);
  }

  @Patch('stock-bulk')
  updateStockBulk(@Body() dto: UpdateStockBulkDto) {
    return this.service.updateStockBulk(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateIngredientDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
