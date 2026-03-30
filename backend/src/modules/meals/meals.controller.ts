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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { File as MulterFile } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
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
  findAll(@Query('category') category?: string, @Query('search') search?: string) {
    return this.service.findAll(search);
  }

  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }

  @Post('backfill-codes')
  backfillCodes() {
    return this.service.backfillMealCodes();
  }

  @Get('pricing')
  getPricing() {
    return this.service.getPricing();
  }

  @Get('cooking-sheet')
  getCookingSheet(@Query('category') category?: string) {
    return this.service.getCookingSheet(category);
  }

  @Get('export')
  async exportMeals(@Res() res: Response) {
    const meals = await this.service.exportMeals();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="betterday-meals-export.json"');
    res.send(JSON.stringify(meals, null, 2));
  }

  @Get(':id/suggested-variants')
  getSuggestedVariants(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getSuggestedVariants(id);
  }

  @Patch(':id/link-variant')
  linkOrUnlinkVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { linked_meal_id: string | null },
  ) {
    if (body.linked_meal_id === null) {
      return this.service.unlinkVariant(id);
    }
    return this.service.linkVariant(id, body.linked_meal_id);
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

  // ─── Photo Upload ──────────────────────────────────────────────────────────

  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'public', 'meal-photos');
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `meal-${req.params.id}${ext}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/^image\/(jpeg|jpg|png|webp|gif)$/)) {
        return cb(new BadRequestException('Only image files are allowed'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  async uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: MulterFile,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const imageUrl = `/meal-photos/${file.filename}`;
    return this.service.updateImageUrl(id, imageUrl);
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
