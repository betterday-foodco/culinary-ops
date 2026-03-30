import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';

@Injectable()
export class MealPrepSyncService {
  private readonly logger = new Logger(MealPrepSyncService.name);

  constructor(
    private prisma: PrismaService,
    private config: SystemConfigService,
  ) {}

  /**
   * Push the weekly menu (meals in the production plan) to the MealPrep platform.
   * Uses their "replace" API once they share the endpoint.
   */
  async publishWeeklyMenu(planId: string): Promise<object> {
    const token = await this.config.get('mealprep_api_token');
    const endpoint = await this.config.get('mealprep_api_endpoint');

    if (!token) throw new BadRequestException('MealPrep API token not configured. Set it in Settings → Integration.');
    if (!endpoint) throw new BadRequestException('MealPrep API endpoint not configured. Set it in Settings → Integration.');

    // Load plan with meals
    const plan = await this.prisma.productionPlan.findUnique({
      where: { id: planId },
      include: {
        items: {
          include: {
            meal: {
              select: {
                id: true,
                meal_code: true,
                display_name: true,
                category: true,
                calories: true,
                protein_g: true,
                carbs_g: true,
                fat_g: true,
                pricing_override: true,
                allergen_tags: true,
                dietary_tags: true,
                image_url: true,
                short_description: true,
              },
            },
          },
        },
      },
    });

    if (!plan) throw new BadRequestException('Plan not found');

    // Build payload — structure will be confirmed once they share docs
    // This follows a common "replace weekly menu" pattern
    const menuPayload = {
      week_start: plan.week_start.toISOString().slice(0, 10),
      week_label: plan.week_label,
      meals: plan.items.map((item) => ({
        sku: item.meal.meal_code ?? item.meal.id,
        name: item.meal.display_name,
        category: item.meal.category,
        quantity: item.quantity,
        price: item.meal.pricing_override,
        calories: item.meal.calories,
        protein_g: item.meal.protein_g,
        carbs_g: item.meal.carbs_g,
        fat_g: item.meal.fat_g,
        allergens: item.meal.allergen_tags,
        dietary_tags: item.meal.dietary_tags,
        image_url: item.meal.image_url,
        description: item.meal.short_description,
      })),
    };

    this.logger.log(`Publishing week ${plan.week_label} to MealPrep: ${plan.items.length} meals`);

    // Call their API
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(menuPayload),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`MealPrep API error ${res.status}: ${body}`);
      throw new BadRequestException(`MealPrep API returned ${res.status}: ${body}`);
    }

    const responseBody = await res.json().catch(() => ({}));

    // Mark plan as published
    await this.prisma.productionPlan.update({
      where: { id: planId },
      data: { published_to_kitchen: true },
    });

    return {
      status: 'ok',
      meals_sent: plan.items.length,
      week_label: plan.week_label,
      api_response: responseBody,
    };
  }

  /** Returns the current config (token masked, endpoint visible) */
  async getIntegrationConfig() {
    const all = await this.config.getAll();
    return {
      mealprep_api_endpoint: all['mealprep_api_endpoint'] ?? '',
      mealprep_api_token_set: !!(all['mealprep_api_token']),
      mealprep_webhook_secret_set: !!(all['mealprep_webhook_secret']),
      mealprep_webhook_url_hint: 'POST /api/webhooks/mealprep-order',
    };
  }
}
