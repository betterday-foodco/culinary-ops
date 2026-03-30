import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProductionNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  async getForPlan(planId: string) {
    return this.prisma.productionNumberUpdate.findMany({
      where: { plan_id: planId },
      include: { sub_recipe: { select: { id: true, name: true, station_tag: true, priority: true } } },
      orderBy: [{ shortage: 'desc' }, { created_at: 'asc' }],
    });
  }

  async upsert(planId: string, subRecipeId: string, wednesdayQty: number, thursdayQty?: number, unit?: string) {
    const shortage = thursdayQty != null && thursdayQty > wednesdayQty;
    const shortageNote = shortage
      ? `Increased from ${wednesdayQty} to ${thursdayQty} ${unit ?? ''} — check stock`
      : null;

    return this.prisma.productionNumberUpdate.upsert({
      where: { plan_id_sub_recipe_id: { plan_id: planId, sub_recipe_id: subRecipeId } },
      update: { thursday_qty: thursdayQty, unit, shortage, shortage_note: shortageNote, wednesday_qty: wednesdayQty },
      create: { plan_id: planId, sub_recipe_id: subRecipeId, wednesday_qty: wednesdayQty, thursday_qty: thursdayQty, unit, shortage, shortage_note: shortageNote },
    });
  }

  async bulkUpsertWednesday(planId: string, entries: Array<{ sub_recipe_id: string; qty: number; unit?: string }>) {
    await Promise.all(entries.map(e => this.upsert(planId, e.sub_recipe_id, e.qty, undefined, e.unit)));
    return { updated: entries.length };
  }

  async updateThursday(planId: string, subRecipeId: string, thursdayQty: number) {
    const existing = await this.prisma.productionNumberUpdate.findUnique({
      where: { plan_id_sub_recipe_id: { plan_id: planId, sub_recipe_id: subRecipeId } },
    });
    const wedQty = existing?.wednesday_qty ?? 0;
    return this.upsert(planId, subRecipeId, wedQty, thursdayQty, existing?.unit ?? undefined);
  }

  async getShortages(planId: string) {
    return this.prisma.productionNumberUpdate.findMany({
      where: { plan_id: planId, shortage: true },
      include: { sub_recipe: { select: { id: true, name: true, station_tag: true } } },
    });
  }
}
