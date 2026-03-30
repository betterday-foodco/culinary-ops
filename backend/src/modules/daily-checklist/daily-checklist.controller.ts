import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DailyChecklistService } from './daily-checklist.service';

@UseGuards(JwtAuthGuard)
@Controller('daily-checklist')
export class DailyChecklistController {
  constructor(private readonly service: DailyChecklistService) {}

  @Get()
  findAll(@Query('day') day?: string) { return this.service.findAll(day); }

  @Post('seed')
  seed() { return this.service.seed(); }

  @Post()
  create(@Body() body: any) { return this.service.create(body); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) { return this.service.update(id, body); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }

  @Post(':id/toggle')
  toggle(
    @Param('id') id: string,
    @Body() body: { week_label: string; completed_by?: string },
  ) {
    return this.service.toggleComplete(id, body.week_label, body.completed_by);
  }
}
