import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface CorporateMealCount {
  meal_id: string;     // e.g. "#509"
  meal_code: string;   // e.g. "BD-509"
  dish_name: string;
  diet: string;
  count: number;
  by_company: { company: string; count: number }[];
  // matched to our DB
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

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  private get apiBase(): string {
    return this.config.get<string>('CORPORATE_APP_URL') ?? 'https://betterday-app.onrender.com';
  }

  private get apiKey(): string {
    return this.config.get<string>('CORPORATE_SYNC_KEY') ?? 'bd-culinary-sync-2026';
  }

  /** Fetch corporate orders from betterday-app and match them to our meals */
  async fetchOrders(week?: string): Promise<CorporateOrderSummary> {
    const url = `${this.apiBase}/api/internal/orders${week ? `?week=${week}` : ''}`;
    this.logger.log(`Fetching corporate orders from ${url}`);

    const res = await fetch(url, {
      headers: { 'X-Sync-Key': this.apiKey },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Corporate app returned ${res.status}: ${body}`);
    }

    const data: Omit<CorporateOrderSummary, 'fetched_at'> = await res.json();

    // Load all our meals to match by meal_code (BD-509 etc.)
    const dbMeals = await this.prisma.mealRecipe.findMany({
      select: { id: true, meal_code: true, display_name: true },
    });
    const byCode = new Map(dbMeals.map((m) => [m.meal_code?.toUpperCase().trim(), m]));

    // Enrich each corporate meal with our internal meal id
    const enriched: CorporateMealCount[] = data.meals.map((m) => {
      // Corporate app uses "#509", our code is "BD-509"
      const derivedCode = `BD-${m.meal_id.replace('#', '')}`.toUpperCase();
      const matched = byCode.get(derivedCode) ?? byCode.get(m.meal_id.toUpperCase());
      return {
        ...m,
        meal_code: derivedCode,
        internal_meal_id: matched?.id ?? null,
        internal_meal_name: matched?.display_name ?? null,
      };
    });

    return {
      ...data,
      meals: enriched,
      fetched_at: new Date().toISOString(),
    };
  }

  /**
   * Apply corporate order counts to a production plan as quantities.
   * Only updates meals that have a matching internal_meal_id.
   * Returns counts of updated vs skipped.
   */
  async applyToPlan(planId: string, week?: string): Promise<{
    applied: number;
    skipped: number;
    unmatched: string[];
    summary: CorporateOrderSummary;
  }> {
    const summary = await this.fetchOrders(week);

    // Ensure plan exists
    const plan = await this.prisma.productionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error('Production plan not found');

    let applied = 0;
    let skipped = 0;
    const unmatched: string[] = [];

    for (const m of summary.meals) {
      if (!m.internal_meal_id) {
        unmatched.push(`${m.meal_code} (${m.dish_name})`);
        skipped++;
        continue;
      }

      // Upsert plan item with corporate order count as quantity
      await this.prisma.productionPlanItem.upsert({
        where: { plan_id_meal_id: { plan_id: planId, meal_id: m.internal_meal_id } },
        update: { quantity: m.count },
        create: { plan_id: planId, meal_id: m.internal_meal_id, quantity: m.count },
      });
      applied++;
    }

    this.logger.log(`Applied ${applied} corporate order counts to plan ${planId}`);
    return { applied, skipped, unmatched, summary };
  }

  /** Push this week's production plan meals to betterday-app so employees can only order those meals */
  async publishMenu(planId: string): Promise<{ ok: boolean; week: string; meals_published: number }> {
    const plan = await this.prisma.productionPlan.findUnique({
      where: { id: planId },
      include: {
        items: { include: { meal: { select: { meal_code: true } } } },
      },
    });
    if (!plan) throw new Error('Production plan not found');

    // Convert BD-509 → #509
    const mealIds = plan.items
      .map((i) => (i as any).meal?.meal_code ?? '')
      .filter(Boolean)
      .map((code: string) => '#' + code.replace(/^BD-/i, ''));

    // Derive sunday anchor from week_start (Monday − 1 day)
    const weekStart = (plan as any).week_start as Date | string | null;
    let anchor = '';
    if (weekStart) {
      const monday = new Date(weekStart);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() - 1);
      anchor = sunday.toISOString().split('T')[0];
    }

    const url = `${this.apiBase}/api/internal/menu`;
    this.logger.log(`Publishing menu to corporate app: ${mealIds.length} meals for week ${anchor}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-Sync-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ week: anchor, meal_ids: mealIds }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`Corporate app returned ${res.status}: ${await res.text()}`);
    return res.json();
  }
}
