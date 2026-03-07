import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { KitchenStaffService } from './kitchen-staff.service';
import { CreateKitchenStaffDto, UpdateKitchenStaffDto } from './dto/kitchen-staff.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('kitchen-staff')
export class KitchenStaffController {
  constructor(private readonly service: KitchenStaffService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateKitchenStaffDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKitchenStaffDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
