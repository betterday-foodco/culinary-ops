import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KitchenStationsService } from './kitchen-stations.service';

@UseGuards(JwtAuthGuard)
@Controller('kitchen-stations')
export class KitchenStationsController {
  constructor(private readonly service: KitchenStationsService) {}

  @Get()
  findAll() { return this.service.findAll(); }

  @Post('seed')
  seed() { return this.service.seed(); }

  @Post()
  create(@Body() body: { name: string; sort_order?: number }) { return this.service.create(body); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) { return this.service.update(id, body); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
