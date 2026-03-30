import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DailyChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(day?: string) {
    return this.prisma.dailyChecklist.findMany({
      where: { is_active: true, ...(day ? { day } : {}) },
      include: { completions: { orderBy: { completed_at: 'desc' }, take: 1 } },
      orderBy: [{ day: 'asc' }, { sort_order: 'asc' }],
    });
  }

  create(data: { title: string; day: string; station?: string; sort_order?: number }) {
    return this.prisma.dailyChecklist.create({ data });
  }

  update(id: string, data: Partial<{ title: string; day: string; station: string; sort_order: number; is_active: boolean }>) {
    return this.prisma.dailyChecklist.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.dailyChecklist.update({ where: { id }, data: { is_active: false } });
  }

  async toggleComplete(checklistId: string, weekLabel: string, completedBy?: string) {
    const existing = await this.prisma.dailyChecklistCompletion.findUnique({
      where: { checklist_id_week_label: { checklist_id: checklistId, week_label: weekLabel } },
    });
    if (existing) {
      await this.prisma.dailyChecklistCompletion.delete({ where: { id: existing.id } });
      return { completed: false };
    }
    await this.prisma.dailyChecklistCompletion.create({
      data: { checklist_id: checklistId, week_label: weekLabel, completed_by: completedBy },
    });
    return { completed: true };
  }

  async seed() {
    const count = await this.prisma.dailyChecklist.count();
    if (count > 0) return { message: 'Already seeded' };
    const items = [
      { title: 'Check walk-in cooler temperature (must be 0–4°C)', day: 'wednesday', sort_order: 1 },
      { title: 'Review Wednesday production numbers', day: 'wednesday', sort_order: 2 },
      { title: 'Sanitize all prep surfaces', day: 'wednesday', sort_order: 3 },
      { title: 'Check all ingredient stock levels', day: 'wednesday', sort_order: 4 },
      { title: 'Verify protein thaw status', day: 'wednesday', sort_order: 5 },
      { title: 'Check walk-in cooler temperature (must be 0–4°C)', day: 'thursday', sort_order: 1 },
      { title: 'Review Thursday updated production numbers', day: 'thursday', sort_order: 2 },
      { title: 'Sanitize all prep surfaces', day: 'thursday', sort_order: 3 },
      { title: 'Check carry-over stock from Wednesday', day: 'thursday', sort_order: 4 },
      { title: 'Check walk-in cooler temperature (must be 0–4°C)', day: 'friday', sort_order: 1 },
      { title: 'Review Friday production numbers', day: 'friday', sort_order: 2 },
      { title: 'Sanitize all prep surfaces', day: 'friday', sort_order: 3 },
      { title: 'Final packaging check', day: 'friday', sort_order: 4 },
      { title: 'Label all containers with date', day: 'friday', sort_order: 5 },
    ];
    await this.prisma.dailyChecklist.createMany({ data: items });
    return { message: 'Seeded', count: items.length };
  }
}
