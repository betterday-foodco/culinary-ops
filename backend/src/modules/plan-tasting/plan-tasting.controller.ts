import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlanTastingService } from './plan-tasting.service';
import { UpsertTastingSessionDto, UpsertWeekNoteDto } from './dto/plan-tasting.dto';

@UseGuards(JwtAuthGuard)
@Controller('plan-tasting')
export class PlanTastingController {
  constructor(private readonly service: PlanTastingService) {}

  @Get(':planId/sessions')
  getSessions(@Param('planId') planId: string) {
    return this.service.getSessionsForPlan(planId);
  }

  @Post('sessions')
  upsertSession(@Body() dto: UpsertTastingSessionDto) {
    return this.service.upsertSession(dto);
  }

  @Get(':planId/week-note')
  getWeekNote(@Param('planId') planId: string) {
    return this.service.getWeekNote(planId);
  }

  @Post('week-note')
  upsertWeekNote(@Body() dto: UpsertWeekNoteDto) {
    return this.service.upsertWeekNote(dto);
  }
}
