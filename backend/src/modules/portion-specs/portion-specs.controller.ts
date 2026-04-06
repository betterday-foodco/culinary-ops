import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import type { File as MulterFile } from 'multer';
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

  @Post(':id/photo')
  @Roles('admin', 'staff')
  @UseInterceptors(FileInterceptor('photo', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), '..', 'frontend', 'public', 'spec-photos');
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `spec-${req.params.id}${ext}`);
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
    @Param('id') id: string,
    @UploadedFile() file: MulterFile,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const photoUrl = `/spec-photos/${file.filename}`;
    await this.portionSpecsService.update(id, { photo_url: photoUrl } as any);
    return { photo_url: photoUrl };
  }

  @Delete(':id')
  @Roles('admin', 'staff')
  remove(@Param('id') id: string) {
    return this.portionSpecsService.remove(id);
  }
}
