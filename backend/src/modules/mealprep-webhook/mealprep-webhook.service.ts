import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';

export interface MealPrepOrderPayload {
  // Common fields we expect — actual shape confirmed once they share docs
  week_start?: string;          // ISO date string e.g. "2026-04-07"
  week_label?: string;          // e.g. "Week 14" or "Apr 7–13"
  meals?: MealPrepOrderItem[];  // array of meal orders
  orders?: MealPrepOrderItem[]; // alternate key some platforms use
  event?: string;               // event type if they wrap it
  [key: string]: any;           // accept any extra fields
}

export interface MealPrepOrderItem {
  name?: string;          // meal display name
  meal_name?: string;     // alternate
  sku?: string;           // their SKU / our meal_code
  meal_code?: string;     // alternate
  quantity?: number;
  qty?: number;           // alternate
  [key: string]: any;
}

interface MatchResult {
  meal_id: string;
  meal_name: string;
  matched_by: string;
  quantity: number;
}

@Injectable()
export class MealPrepWebhookService {
  private readonly logger = new Logger(MealPrepWebhookService.name);

  constructor(
    private prisma: PrismaService,
    private config: SystemConfigService,
  ) {}

  async handleOrderWebhook(payload: MealPrepOrderPayload): Promise<object> {
    // --- 1. Extract meal items from payload (handle different key names) ---
    const rawItems: MealPrepOrderItem[] = payload.meals ?? payload.orders ?? [];

    if (!rawItems.length) {
      return { status: 'ignored', reason: 'No meal items found in payload' };
    }

    // --- 2. Determine week_start ---
    let weekStart: Date;
    if (payload.week_start) {
      weekStart = new Date(payload.week_start);
    } else {
      // Default to next Monday
      const now = new Date();
      const day = now.getDay();
      const daysUntilMonday = day === 0 ? 1 : 8 - day;
      weekStart = new Date(now);
      weekStart.setDate(now.getDate() + daysUntilMonday);
      weekStart.setHours(0, 0, 0, 0);
    }

    const weekLabel = payload.week_label ?? this.formatWeekLabel(weekStart);

    // --- 3. Load all active meals for matching ---
    const allMeals = await this.prisma.mealRecipe.findMany({
      where: { is_active: true },
      select: { id: true, name: true, display_name: true, meal_code: true },
    });

    // --- 4. Match each order item to a meal ---
    const matched: MatchResult[] = [];
    const unmatched: string[] = [];

    for (const item of rawItems) {
      const qty = item.quantity ?? item.qty ?? 1;
      const nameKey = (item.name ?? item.meal_name ?? '').toLowerCase().trim();
      const skuKey = (item.sku ?? item.meal_code ?? '').toLowerCase().trim();

      let meal: { id: string; name: string; display_name: string; meal_code: string | null } | null = null;
      let matchedBy = '';

      // Priority 1: exact SKU / meal_code match
      if (skuKey) {
        meal = allMeals.find((m) => m.meal_code?.toLowerCase() === skuKey) ?? null;
        if (meal) matchedBy = 'sku';
      }

      // Priority 2: exact display_name match (case-insensitive)
      if (!meal && nameKey) {
        meal = allMeals.find((m) => m.display_name.toLowerCase() === nameKey) ?? null;
        if (meal) matchedBy = 'exact_name';
      }

      // Priority 3: exact internal name match
      if (!meal && nameKey) {
        meal = allMeals.find((m) => m.name.toLowerCase() === nameKey) ?? null;
        if (meal) matchedBy = 'internal_name';
      }

      // Priority 4: fuzzy — display_name contains all words from their name
      if (!meal && nameKey) {
        const words = nameKey.split(/\s+/).filter((w) => w.length > 2);
        meal = allMeals.find((m) => {
          const dn = m.display_name.toLowerCase();
          return words.length >= 2 && words.every((w) => dn.includes(w));
        }) ?? null;
        if (meal) matchedBy = 'fuzzy_name';
      }

      if (meal) {
        matched.push({ meal_id: meal.id, meal_name: meal.display_name, matched_by: matchedBy, quantity: qty });
      } else {
        unmatched.push(nameKey || skuKey || JSON.stringify(item));
        this.logger.warn(`No match for meal: "${nameKey || skuKey}"`);
      }
    }

    if (!matched.length) {
      return {
        status: 'error',
        reason: 'Could not match any meals to our database',
        unmatched,
      };
    }

    // --- 5. Find or create production plan for this week ---
    const nextMonday = new Date(weekStart);
    nextMonday.setDate(weekStart.getDate() + 7);

    let plan = await this.prisma.productionPlan.findFirst({
      where: { week_start: { gte: weekStart, lt: nextMonday } },
    });

    let action: 'created' | 'updated';

    if (!plan) {
      plan = await this.prisma.productionPlan.create({
        data: {
          week_label: weekLabel,
          week_start: weekStart,
          status: 'draft',
          notes: 'Auto-created from MealPrep webhook',
        },
      });
      action = 'created';
    } else {
      action = 'updated';
    }

    // --- 6. Upsert plan items ---
    for (const m of matched) {
      await this.prisma.productionPlanItem.upsert({
        where: { plan_id_meal_id: { plan_id: plan.id, meal_id: m.meal_id } },
        update: { quantity: m.quantity },
        create: { plan_id: plan.id, meal_id: m.meal_id, quantity: m.quantity },
      });
    }

    return {
      status: 'ok',
      action,
      plan_id: plan.id,
      week_label: weekLabel,
      matched: matched.map((m) => ({ meal: m.meal_name, qty: m.quantity, matched_by: m.matched_by })),
      unmatched,
    };
  }

  private formatWeekLabel(date: Date): string {
    const end = new Date(date);
    end.setDate(date.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${date.toLocaleDateString('en-CA', opts)} – ${end.toLocaleDateString('en-CA', opts)}`;
  }
}
