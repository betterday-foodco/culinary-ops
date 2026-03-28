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

  /** PATCH /api/kitchen-portal/station-assignment/:staffId/role — admin assigns station role */
  @Roles('admin')
  @Patch('station-assignment/:staffId/role')
  assignStationRole(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body() dto: { station_role: string | null },
  ) {
    return this.service.assignStationRole(staffId, dto.station_role ?? null);
  }

  // ── Admin messages (sees all) ──────────────────────────────────────────

  /** GET /api/kitchen-portal/messages/all — admin: full message history */
  @Roles('admin')
  @Get('messages/all')
  getAllMessages() {
    return this.service.getAllMessages();
  }

  // ── Bulk Cooking Approval ──────────────────────────────────────────────

  /** GET /api/kitchen-portal/bulk — admin: pending bulk cooking approvals */
  @Roles('admin')
  @Get('bulk')
  getPendingBulk() {
    return this.service.getPendingBulk();
  }

  /** PATCH /api/kitchen-portal/bulk/:logId/approve — admin approves bulk cooking */
  @Roles('admin')
  @Patch('bulk/:logId/approve')
  approveBulk(
    @Param('logId', ParseUUIDPipe) logId: string,
    @Request() req: any,
  ) {
    return this.service.approveBulk(logId, req.user.id);
  }

  // ── Station Lead: task assignment + lead approval ──────────────────────

  /** GET /api/kitchen-portal/station-prep-cooks?station=X — station lead: see prep cooks */
  @Get('station-prep-cooks')
  getStationPrepCooks(@Query('station') station: string) {
    return this.service.getStationPrepCooks(station);
  }

  /** PATCH /api/kitchen-portal/tasks/assign — station lead assigns task to prep cook */
  @Patch('tasks/assign')
  assignTask(
    @Body() dto: { plan_id: string; sub_recipe_id: string; assigned_to_id: string | null },
  ) {
    return this.service.assignTask(dto.plan_id, dto.sub_recipe_id, dto.assigned_to_id);
  }

  /** PATCH /api/kitchen-portal/tasks/lead-approve — station lead approves prep's completed task */
  @Patch('tasks/lead-approve')
  leadApproveTask(
    @Body() dto: { plan_id: string; sub_recipe_id: string },
    @Request() req: any,
  ) {
    return this.service.leadApproveTask(dto.plan_id, dto.sub_recipe_id, req.user.id);
  }

  /** PATCH /api/kitchen-portal/sub-recipes/:id/priority — update sub-recipe priority */
  @Patch('sub-recipes/:id/priority')
  updateSubRecipePriority(
    @Param('id') id: string,
    @Body() dto: { priority: number },
  ) {
    return this.service.updateSubRecipePriority(id, dto.priority);
  }
}
