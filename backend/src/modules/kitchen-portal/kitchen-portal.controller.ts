import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { KitchenPortalService } from './kitchen-portal.service';
import {
  UpsertProductionLogDto,
  SubmitFeedbackDto,
  CreateStationRequestDto,
  UpdateStationRequestDto,
} from './dto/kitchen-portal.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('kitchen', 'admin')
@Controller('kitchen-portal')
export class KitchenPortalController {
  constructor(private readonly service: KitchenPortalService) {}

  /** GET /api/kitchen-portal/board — current week's tasks for user's station */
  @Get('board')
  getBoard(@Request() req: any) {
    const station = req.user.station ?? '';
    return this.service.getBoard(req.user.id, station);
  }

  /** POST /api/kitchen-portal/logs — upsert production log */
  @Post('logs')
  upsertLog(@Request() req: any, @Body() dto: UpsertProductionLogDto) {
    return this.service.upsertLog(req.user.id, dto);
  }

  /** POST /api/kitchen-portal/feedback — submit recipe feedback */
  @Post('feedback')
  submitFeedback(@Request() req: any, @Body() dto: SubmitFeedbackDto) {
    return this.service.submitFeedback(req.user.id, dto);
  }

  /** GET /api/kitchen-portal/requests — incoming + sent requests */
  @Get('requests')
  getRequests(@Request() req: any) {
    const station = req.user.station ?? '';
    return this.service.getRequests(req.user.id, station);
  }

  /** POST /api/kitchen-portal/requests — create a station request */
  @Post('requests')
  createRequest(@Request() req: any, @Body() dto: CreateStationRequestDto) {
    return this.service.createRequest(req.user.id, dto);
  }

  /** PATCH /api/kitchen-portal/requests/:id — acknowledge or complete a request */
  @Patch('requests/:id')
  updateRequestStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: UpdateStationRequestDto,
  ) {
    const station = req.user.station ?? '';
    return this.service.updateRequestStatus(id, req.user.id, station, dto);
  }
}
