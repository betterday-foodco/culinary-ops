import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MenuQueueService } from './menu-queue.service';
import {
  AddToQueueDto,
  UpdateQueueItemDto,
  ReorderColumnDto,
  AdvanceQueueDto,
} from './dto/menu-queue.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
@Controller('menu-queues')
export class MenuQueueController {
  constructor(private readonly service: MenuQueueService) {}

  /** GET /api/menu-queues — full queue state grouped by column */
  @Get()
  getQueue() {
    return this.service.getQueue();
  }

  /** GET /api/menu-queues/last-advanced — last advance log entry */
  @Get('last-advanced')
  getLastAdvanced() {
    return this.service.getLastAdvanced();
  }

  /** POST /api/menu-queues/items — add meal to a column */
  @Post('items')
  addItem(@Body() dto: AddToQueueDto) {
    return this.service.addItem(dto);
  }

  /** PATCH /api/menu-queues/items/:id — update repeat_weeks or weeks_remaining */
  @Patch('items/:id')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQueueItemDto,
  ) {
    return this.service.updateItem(id, dto);
  }

  /** DELETE /api/menu-queues/items/:id — remove from queue */
  @Delete('items/:id')
  removeItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeItem(id);
  }

  /** POST /api/menu-queues/columns/:columnId/reorder — set new order for a column */
  @Post('columns/:columnId/reorder')
  reorderColumn(
    @Param('columnId') columnId: string,
    @Body() dto: ReorderColumnDto,
  ) {
    return this.service.reorderColumn(columnId, dto);
  }

  /** POST /api/menu-queues/advance — Sunday rotation */
  @Post('advance')
  advanceQueue(@Body() dto: AdvanceQueueDto) {
    return this.service.advanceQueue(dto);
  }
}
