import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { StationTasksService } from './station-tasks.service';
import { CreateStationTaskDto } from './dto/station-tasks.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('station-tasks')
export class StationTasksController {
  constructor(private readonly service: StationTasksService) {}

  /** GET /api/station-tasks?plan_id=xxx */
  @Roles('admin', 'kitchen')
  @Get()
  list(@Query('plan_id') planId?: string) {
    return this.service.list(planId);
  }

  /** POST /api/station-tasks  (admin only) */
  @Roles('admin')
  @Post()
  create(@Request() req: any, @Body() dto: CreateStationTaskDto) {
    return this.service.create(req.user.id, dto);
  }

  /** PATCH /api/station-tasks/:id/complete */
  @Roles('admin', 'kitchen')
  @Patch(':id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.service.complete(id, req.user.id);
  }

  /** PATCH /api/station-tasks/:id/uncomplete */
  @Roles('admin', 'kitchen')
  @Patch(':id/uncomplete')
  uncomplete(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.uncomplete(id);
  }

  /** DELETE /api/station-tasks/:id  (admin only) */
  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
