import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
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
  SendMessageDto,
} from './dto/kitchen-portal.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('kitchen', 'admin')
@Controller('kitchen-portal')
export class KitchenPortalController {
  constructor(private readonly service: KitchenPortalService) {}

  /** GET /api/kitchen-portal/board */
  @Get('board')
  getBoard(@Request() req: any, @Query('station') stationOverride?: string) {
    const station = stationOverride ?? '';
    return this.service.getBoard(req.user.id, station);
  }

  /** POST /api/kitchen-portal/logs */
  @Post('logs')
  upsertLog(@Request() req: any, @Body() dto: UpsertProductionLogDto) {
    return this.service.upsertLog(req.user.id, dto);
  }

  /** POST /api/kitchen-portal/feedback */
  @Post('feedback')
  submitFeedback(@Request() req: any, @Body() dto: SubmitFeedbackDto) {
    return this.service.submitFeedback(req.user.id, dto);
  }

  /** GET /api/kitchen-portal/staff */
  @Get('staff')
  getStaff() {
    return this.service.getKitchenStaff();
  }

  /** GET /api/kitchen-portal/requests */
  @Get('requests')
  getRequests(@Request() req: any) {
    const station = req.user.station ?? '';
    return this.service.getRequests(req.user.id, station);
  }

  /** POST /api/kitchen-portal/requests */
  @Post('requests')
  createRequest(@Request() req: any, @Body() dto: CreateStationRequestDto) {
    return this.service.createRequest(req.user.id, dto);
  }

  /** PATCH /api/kitchen-portal/requests/:id */
  @Patch('requests/:id')
  updateRequestStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: UpdateStationRequestDto,
  ) {
    return this.service.updateRequestStatus(id, req.user.id, dto);
  }

  // ── Admin-only feedback endpoints ──────────────────────────────────────

  @Roles('admin')
  @Get('feedback/all')
  getAllFeedback() {
    return this.service.getAllFeedback();
  }

  @Roles('admin')
  @Patch('feedback/:id')
  updateFeedback(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { admin_notes?: string; is_fixed?: boolean },
  ) {
    return this.service.updateFeedback(id, dto);
  }

  // ── Messaging ──────────────────────────────────────────────────────────

  /** GET /api/kitchen-portal/messages */
  @Get('messages')
  getMessages(@Request() req: any) {
    const station = req.user.station ?? '';
    return this.service.getMessages(req.user.id, station);
  }

  /** POST /api/kitchen-portal/messages */
  @Post('messages')
  sendMessage(@Request() req: any, @Body() dto: SendMessageDto) {
    return this.service.sendMessage(req.user.id, dto);
  }

  /** POST /api/kitchen-portal/messages/read — mark all visible messages as read */
  @Post('messages/read')
  markRead(@Request() req: any) {
    const station = req.user.station ?? '';
    return this.service.markMessagesRead(req.user.id, station);
  }

  /** GET /api/kitchen-portal/messages/unread — unread count badge */
  @Get('messages/unread')
  getUnreadCount(@Request() req: any) {
    const station = req.user.station ?? '';
    return this.service.getUnreadCount(req.user.id, station);
  }

  // ── Shortage Approval ──────────────────────────────────────────────────

  /** GET /api/kitchen-portal/shortages — admin: all pending shortage approvals */
  @Roles('admin')
  @Get('shortages')
  getPendingShortages() {
    return this.service.getPendingShortages();
  }

  /** PATCH /api/kitchen-portal/shortages/:logId/approve — admin approves a shortage */
  @Roles('admin')
  @Patch('shortages/:logId/approve')
  approveShortage(
    @Param('logId', ParseUUIDPipe) logId: string,
    @Request() req: any,
  ) {
    return this.service.approveShortage(logId, req.user.id);
  }

  // ── Station Assignment ─────────────────────────────────────────────────

  /** GET /api/kitchen-portal/station-assignment — admin: all kitchen staff with current station */
  @Roles('admin')
  @Get('station-assignment')
  getStationAssignment() {
    return this.service.getAllKitchenStaffWithStation();
  }

  /** PATCH /api/kitchen-portal/station-assignment/:staffId — admin assigns a station */
  @Roles('admin')
  @Patch('station-assignment/:staffId')
  assignStation(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body() dto: { station: string | null },
  ) {
    return this.service.assignStation(staffId, dto.station ?? null);
  }
}
