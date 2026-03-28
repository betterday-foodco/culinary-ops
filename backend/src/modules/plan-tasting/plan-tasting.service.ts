import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertTastingSessionDto, UpsertWeekNoteDto } from './dto/plan-tasting.dto';

@Injectable()
export class PlanTastingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSessionsForPlan(planId: string) {
    return this.prisma.planTastingSession.findMany({
      where: { plan_id: planId },
    });
  }

  async upsertSession(dto: UpsertTastingSessionDto) {
    return this.prisma.planTastingSession.upsert({
      where: { plan_id_meal_id: { plan_id: dto.plan_id, meal_id: dto.meal_id } },
      update: {
        taster_name: dto.taster_name,
        tasting_notes: dto.tasting_notes,
        checked_steps: dto.checked_steps ?? [],
      },
      create: {
        plan_id: dto.plan_id,
        meal_id: dto.meal_id,
        taster_name: dto.taster_name,
        tasting_notes: dto.tasting_notes,
        checked_steps: dto.checked_steps ?? [],
      },
    });
  }

  async getWeekNote(planId: string) {
    return this.prisma.planWeekNote.findUnique({ where: { plan_id: planId } });
  }

  async upsertWeekNote(dto: UpsertWeekNoteDto) {
    return this.prisma.planWeekNote.upsert({
      where: { plan_id: dto.plan_id },
      update: { heading: dto.heading, notes: dto.notes },
      create: { plan_id: dto.plan_id, heading: dto.heading, notes: dto.notes },
    });
  }
}
