import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CorporateUser } from '../../auth/jwt.strategy';

@Injectable()
export class CorpPortalService {
  constructor(private prisma: PrismaService) {}

  // ── Menu ──────────────────────────────────────────────────────────────────

  /**
   * Returns the published weekly menu for a company.
   * Meals are pulled from MealRecipe; we annotate each with the employee's
   * tier pricing for the current benefit level.
   */
  async getWeeklyMenu(user: CorporateUser) {
    const company = await this.prisma.corporateCompany.findUnique({
      where: { id: user.company_id },
    });
    if (!company) throw new NotFoundException('Company not found');

    // Latest published production plan
    const plan = await this.prisma.productionPlan.findFirst({
      where: { published_to_corporate: true },
      orderBy: { week_start: 'desc' },
      include: {
        items: {
          include: {
            meal: {
              select: {
                id: true,
                meal_code: true,
                name: true,
                display_name: true,
                category: true,
                description: true,
                short_description: true,
                image_url: true,
                calories: true,
                protein_g: true,
                carbs_g: true,
                fat_g: true,
                allergen_tags: true,
                dietary_tags: true,
                protein_types: true,
                heating_instructions: true,
              },
            },
          },
        },
      },
    });

    if (!plan) return { ok: true, week: null, meals: [] };

    // Look up employee's benefit level tier config
    const tierConfig = await this.getEmployeeTierConfig(user);

    const meals = plan.items.map(item => ({
      ...item.meal,
      plan_quantity: item.quantity,
      pricing: tierConfig,
    }));

    return {
      ok: true,
      week: plan.week_label,
      week_start: plan.week_start,
      plan_id: plan.id,
      meals,
    };
  }

  private async getEmployeeTierConfig(user: CorporateUser) {
    if (user.role === 'corp_manager') {
      return this.getCompanyDefaultTierConfig(user.company_id);
    }

    const emp = await this.prisma.corporateEmployee.findUnique({
      where: { id: user.id },
    });
    if (!emp?.benefit_level) return this.getCompanyDefaultTierConfig(user.company_id);

    // Find benefit level by name
    const level = await this.prisma.corporateBenefitLevel.findFirst({
      where: { company_id: user.company_id, level_name: emp.benefit_level },
    });
    return (level?.tier_config as any) ?? (await this.getCompanyDefaultTierConfig(user.company_id));
  }

  private async getCompanyDefaultTierConfig(company_id: string) {
    const company = await this.prisma.corporateCompany.findUnique({ where: { id: company_id } });
    const extra = (company?.extra as any) ?? {};
    return {
      free: {
        meals: extra['FreeMealsPerWeek'] ?? 0,
        employeePrice: extra['FreeTier_EmployeePrice'] ?? 0,
        bdSubsidy: extra['FreeTier_BDSubsidy'] ?? 0,
        companySubsidy: extra['FreeTier_CompanySubsidy'] ?? 0,
      },
      tier1: {
        meals: extra['Tier1_Meals'] ?? 0,
        employeePrice: extra['Tier1_EmployeePrice'] ?? 0,
        bdSubsidy: extra['Tier1_BDSubsidy'] ?? 0,
        companySubsidy: extra['Tier1_CompanySubsidy'] ?? 0,
      },
      tier2: {
        meals: extra['Tier2_Meals'] ?? 0,
        employeePrice: extra['Tier2_EmployeePrice'] ?? 0,
        bdSubsidy: extra['Tier2_BDSubsidy'] ?? 0,
        companySubsidy: extra['Tier2_CompanySubsidy'] ?? 0,
      },
      tier3: {
        meals: extra['Tier3_Meals'] ?? 0,
        employeePrice: extra['Tier3_EmployeePrice'] ?? 0,
        bdSubsidy: extra['Tier3_BDSubsidy'] ?? 0,
        companySubsidy: extra['Tier3_CompanySubsidy'] ?? 0,
      },
    };
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async placeOrder(
    user: CorporateUser,
    body: { items: Array<{ meal_id: string; tier: string }>; delivery_date?: string },
  ) {
    if (!body.items?.length) throw new BadRequestException('No items provided');

    // Fetch the meals to get pricing snapshot
    const mealIds = body.items.map(i => i.meal_id);
    const meals = await this.prisma.mealRecipe.findMany({
      where: { id: { in: mealIds } },
    });
    const mealMap = new Map(meals.map(m => [m.id, m]));

    const tierConfig = await this.getEmployeeTierConfig(user);

    // Generate next order code
    const lastSetting = await this.prisma.corporateSetting.findUnique({
      where: { key: 'LastOrderID' },
    });
    const nextCode = String((parseInt(lastSetting?.value ?? '10022') + 1));

    let total_employee = 0, total_company = 0, total_bd = 0;
    const items: any[] = [];

    for (const item of body.items) {
      const meal = mealMap.get(item.meal_id);
      if (!meal) throw new NotFoundException(`Meal ${item.meal_id} not found`);

      const rawTier = (item.tier ?? 'free').toLowerCase();
      const validTier = ['free', 'tier1', 'tier2', 'tier3'].includes(rawTier) ? rawTier : 'free';
      const tc = (tierConfig as any)[validTier];

      const unitPrice    = tc?.employeePrice  ?? 0;
      const compSubsidy  = tc?.companySubsidy ?? 0;
      const bdSubsidy    = tc?.bdSubsidy      ?? 0;

      total_employee += unitPrice;
      total_company  += compSubsidy;
      total_bd       += bdSubsidy;

      items.push({
        meal_recipe_id:  meal.id,
        meal_external_id: meal.meal_code?.replace('BD-', '#') ?? null,
        meal_name:        meal.display_name ?? meal.name,
        quantity:         1,
        tier:             validTier,
        unit_price:       unitPrice,
        employee_subsidy: 0,
        company_subsidy:  compSubsidy,
        bd_subsidy:       bdSubsidy,
        line_total:       unitPrice,
      });
    }

    const deliveryDate = body.delivery_date ? new Date(body.delivery_date) : null;

    const order = await this.prisma.corporateOrder.create({
      data: {
        order_code:    nextCode,
        company:       { connect: { id: user.company_id } },
        ...(user.role === 'corp_employee'
          ? { employee: { connect: { id: user.id } } }
          : {}),
        delivery_date: deliveryDate,
        status:        'pending',
        total_amount:  total_employee + total_company + total_bd,
        employee_cost: total_employee,
        company_cost:  total_company,
        bd_cost:       total_bd,
        source:        'portal',
        items:         { create: items },
      },
      include: { items: true },
    });

    // Bump the LastOrderID setting
    await this.prisma.corporateSetting.upsert({
      where:  { key: 'LastOrderID' },
      update: { value: nextCode },
      create: { key: 'LastOrderID', value: nextCode },
    });

    return { ok: true, order_code: nextCode, order };
  }

  async getMyOrders(user: CorporateUser) {
    const where = user.role === 'corp_manager'
      ? { company_id: user.company_id }
      : { employee_id: user.id };

    const orders = await this.prisma.corporateOrder.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 50,
      include: { items: { include: { meal_recipe: { select: { display_name: true, image_url: true, category: true } } } } },
    });

    return { ok: true, orders };
  }

  // ── Employee profile ───────────────────────────────────────────────────────

  async getMyProfile(user: CorporateUser) {
    if (user.role === 'corp_manager') {
      const company = await this.prisma.corporateCompany.findUnique({ where: { id: user.company_id } });
      return { ok: true, type: 'manager', company };
    }

    const emp = await this.prisma.corporateEmployee.findUnique({
      where: { id: user.id },
      include: { company: { select: { id: true, name: true, delivery_day: true } } },
    });
    return { ok: true, type: 'employee', employee: emp };
  }

  // ── Order counts (allowance enforcement) ───────────────────────────────────

  /**
   * Returns how many meals the current employee has already ordered this week
   * per tier — used by the frontend to enforce free / tier1 / tier2 / tier3 caps.
   *
   * `week` is an ISO date string for any day inside the target week (defaults to today).
   * Counts are scoped to orders created during that ISO-week (Mon → Sun).
   */
  async getOrderCounts(user: CorporateUser, week?: string) {
    if (user.role === 'corp_manager') {
      // Managers don't have personal allowances — return zeros
      return { ok: true, counts: { free: 0, tier1: 0, tier2: 0, tier3: 0 }, allowances: null };
    }

    // Compute start/end of the ISO week containing `week`
    const ref = week ? new Date(week) : new Date();
    const day = ref.getDay() || 7; // Sunday = 7 for ISO
    const start = new Date(ref);
    start.setHours(0, 0, 0, 0);
    start.setDate(ref.getDate() - day + 1); // Monday
    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    const items = await this.prisma.corporateOrderItem.findMany({
      where: {
        order: {
          employee_id: user.id,
          created_at:  { gte: start, lt: end },
        },
      },
      select: { tier: true, quantity: true },
    });

    const counts = { free: 0, tier1: 0, tier2: 0, tier3: 0 };
    for (const it of items) {
      const tier = String(it.tier ?? 'free').toLowerCase();
      if (tier in counts) (counts as any)[tier] += it.quantity ?? 1;
    }

    const allowances = await this.getEmployeeTierConfig(user);

    return {
      ok: true,
      week_start: start.toISOString(),
      week_end:   end.toISOString(),
      counts,
      allowances,
    };
  }

  // ── Swap a meal on an existing pending order ───────────────────────────────

  /**
   * Replaces the meal on a single line of an existing pending order.
   * Only the order's owner (or company manager) can swap, and only while
   * the order is still in 'pending' status.
   */
  async swapOrderItem(
    user: CorporateUser,
    order_id: string,
    item_id: string,
    new_meal_id: string,
  ) {
    const order = await this.prisma.corporateOrder.findUnique({
      where:   { id: order_id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Authorization
    if (order.company_id !== user.company_id) {
      throw new ForbiddenException('Order belongs to a different company');
    }
    if (user.role === 'corp_employee' && order.employee_id !== user.id) {
      throw new ForbiddenException('You can only edit your own orders');
    }
    if (order.status !== 'pending') {
      throw new BadRequestException('Order is no longer editable');
    }

    const item = order.items.find(i => i.id === item_id);
    if (!item) throw new NotFoundException('Order item not found');

    const newMeal = await this.prisma.mealRecipe.findUnique({ where: { id: new_meal_id } });
    if (!newMeal) throw new NotFoundException('New meal not found');

    const updated = await this.prisma.corporateOrderItem.update({
      where: { id: item_id },
      data: {
        meal_recipe_id:   newMeal.id,
        meal_external_id: newMeal.meal_code?.replace('BD-', '#') ?? null,
        meal_name:        newMeal.display_name ?? newMeal.name,
      },
    });

    return { ok: true, item: updated };
  }
}
