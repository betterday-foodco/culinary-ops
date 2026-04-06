import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CorporateMealCount {
  meal_id: string;          // e.g. "#509"
  meal_code: string;        // e.g. "BD-509"
  dish_name: string;
  diet: string;
  count: number;
  by_company: { company: string; count: number }[];
  internal_meal_id: string | null;
  internal_meal_name: string | null;
}

export interface CorporateOrderSummary {
  ok: boolean;
  week: string;
  fetched_at: string;
  total_orders: number;
  companies: string[];
  meals: CorporateMealCount[];
}

@Injectable()
export class CorporateSyncService {
  private readonly logger = new Logger(CorporateSyncService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Read corporate orders from our DB and return a summary grouped by meal.
   * Replaces the old Flask /api/internal/orders fetch.
   */
  async fetchOrders(week?: string): Promise<CorporateOrderSummary> {
    let dateFilter: { gte?: Date; lt?: Date } | undefined;
    if (week) {
      const base   = new Date(week);
      const day    = base.getDay();
      const monday = new Date(base);
      monday.setDate(base.getDate() - ((day + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 7);
      dateFilter = { gte: monday, lt: sunday };
    }

    const items = await this.prisma.corporateOrderItem.findMany({
      where: {
        order: {
          status: { notIn: ['cancelled', 'refunded'] },
          ...(dateFilter ? { delivery_date: dateFilter } : {}),
        },
      },
      include: {
        order:       { select: { company_id: true, delivery_date: true, order_code: true } },
        meal_recipe: { select: { id: true, meal_code: true, display_name: true, dietary_tags: true } },
      },
    });

    const companyIds  = [...new Set(items.map(i => i.order.company_id))];
    const companies   = await this.prisma.corporateCompany.findMany({
      where: { id: { in: companyIds } }, select: { id: true, name: true },
    });
    const companyNames = new Map(companies.map(c => [c.id, c.name]));

    const mealMap = new Map<string, {
      meal_id: string; meal_code: string; dish_name: string; diet: string;
      count: number; by_company: Map<string, number>;
      internal_meal_id: string | null; internal_meal_name: string | null;
    }>();

    for (const item of items) {
      const extId    = item.meal_external_id ?? `#${item.meal_recipe?.meal_code?.replace('BD-', '') ?? '?'}`;
      const mealCode = item.meal_recipe?.meal_code ?? extId.replace('#', 'BD-');

      if (!mealMap.has(extId)) {
        const tags = item.meal_recipe?.dietary_tags ?? [];
        const diet = tags.includes('Vegan') ? 'vegan'
          : tags.includes('Vegetarian') ? 'vegetarian' : 'meat';
        mealMap.set(extId, {
          meal_id: extId, meal_code: mealCode, dish_name: item.meal_name,
          diet, count: 0, by_company: new Map(),
          internal_meal_id:   item.meal_recipe?.id          ?? null,
          internal_meal_name: item.meal_recipe?.display_name ?? null,
        });
      }

      const entry    = mealMap.get(extId)!;
      entry.count   += item.quantity;
      const compName = companyNames.get(item.order.company_id) ?? item.order.company_id;
      entry.by_company.set(compName, (entry.by_company.get(compName) ?? 0) + item.quantity);
    }

    const meals: CorporateMealCount[] = [...mealMap.values()].map(m => ({
      ...m,
      by_company: [...m.by_company.entries()].map(([company, count]) => ({ company, count })),
    }));

    const weekLabel = week ?? (items[0]?.order.delivery_date
      ? new Date(items[0].order.delivery_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]);

    this.logger.log(`DB sync: ${items.length} order items → ${meals.length} unique meals`);

    return {
      ok: true, week: weekLabel, fetched_at: new Date().toISOString(),
      total_orders: new Set(items.map(i => i.order_id)).size,
      companies: companyIds, meals,
    };
  }

  /**
   * Apply corporate order counts from DB to a production plan as quantities.
   */
  async applyToPlan(planId: string, week?: string): Promise<{
    applied: number; skipped: number; unmatched: string[];
    summary: CorporateOrderSummary;
  }> {
    const plan = await this.prisma.productionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Production plan not found');

    const summary = await this.fetchOrders(week);
    let applied = 0, skipped = 0;
    const unmatched: string[] = [];

    for (const m of summary.meals) {
      if (!m.internal_meal_id) {
        unmatched.push(`${m.meal_code} (${m.dish_name})`);
        skipped++;
        continue;
      }
      await this.prisma.productionPlanItem.upsert({
        where:  { plan_id_meal_id: { plan_id: planId, meal_id: m.internal_meal_id } },
        update: { quantity: m.count },
        create: { plan_id: planId, meal_id: m.internal_meal_id, quantity: m.count },
      });
      applied++;
    }

    this.logger.log(`Applied ${applied} corporate order counts to plan ${planId}`);
    return { applied, skipped, unmatched, summary };
  }

  /**
   * Publish this plan's meals to the corporate portal.
   * Sets published_to_corporate = true so employees see these meals in /corporate/work.
   */
  async publishMenu(planId: string): Promise<{ ok: boolean; week: string; meals_published: number }> {
    const plan = await this.prisma.productionPlan.findUnique({
      where: { id: planId }, include: { items: true },
    });
    if (!plan) throw new NotFoundException('Production plan not found');

    await this.prisma.productionPlan.update({
      where: { id: planId },
      data:  { published_to_corporate: true },
    });

    this.logger.log(`Plan ${planId} (${plan.week_label}) published to corporate portal — ${plan.items.length} meals`);
    return { ok: true, week: plan.week_label, meals_published: plan.items.length };
  }
}
