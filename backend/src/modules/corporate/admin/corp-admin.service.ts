import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { Resend } from 'resend';

@Injectable()
export class CorpAdminService {
  private readonly logger = new Logger(CorpAdminService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // ── Manager dashboard ──────────────────────────────────────────────────────

  /** Company summary: employees, orders this week, cost breakdown */
  async getCompanyDashboard(company_id: string) {
    const company = await this.prisma.corporateCompany.findUnique({
      where: { id: company_id },
      include: {
        employees:  { where: { is_active: true } },
        par_levels: true,
      },
    });
    if (!company) throw new NotFoundException('Company not found');

    // Orders in last 30 days
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentOrders = await this.prisma.corporateOrder.findMany({
      where:   { company_id, created_at: { gte: since } },
      orderBy: { created_at: 'desc' },
      include: { items: true },
    });

    // Aggregate costs
    const totals = recentOrders.reduce(
      (acc, o) => {
        acc.employee += o.employee_cost;
        acc.company  += o.company_cost;
        acc.bd       += o.bd_cost;
        acc.meals    += o.items.length;
        return acc;
      },
      { employee: 0, company: 0, bd: 0, meals: 0 },
    );

    return {
      ok: true,
      company: {
        id: company.id,
        name: company.name,
        delivery_day: company.delivery_day,
        employee_count: company.employees.length,
        par_levels: company.par_levels,
        extra: company.extra,
      },
      recent_orders: recentOrders.length,
      totals,
    };
  }

  /** List all employees for a company */
  async getEmployees(company_id: string) {
    const employees = await this.prisma.corporateEmployee.findMany({
      where:   { company_id },
      orderBy: { name: 'asc' },
    });
    return { ok: true, employees };
  }

  /** List all orders with line items for a company */
  async getOrders(company_id: string, limit = 100) {
    const orders = await this.prisma.corporateOrder.findMany({
      where:   { company_id },
      orderBy: { created_at: 'desc' },
      take:    limit,
      include: {
        employee: { select: { name: true, email: true, employee_code: true } },
        items:    { include: { meal_recipe: { select: { display_name: true, category: true } } } },
      },
    });
    return { ok: true, orders };
  }

  /** List invoices for a company */
  async getInvoices(company_id: string) {
    const invoices = await this.prisma.companyInvoice.findMany({
      where:   { company_id },
      orderBy: { created_at: 'desc' },
    });
    return { ok: true, invoices };
  }

  // ── BD Admin (ADMIN role only) ─────────────────────────────────────────────

  /** All companies */
  async getAllCompanies() {
    const companies = await this.prisma.corporateCompany.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { employees: true, orders: true } } },
    });
    return { ok: true, companies };
  }

  /** Upsert a company */
  async upsertCompany(data: any) {
    const { id, ...rest } = data;
    if (id) {
      const company = await this.prisma.corporateCompany.update({ where: { id }, data: rest });
      return { ok: true, company };
    }
    const company = await this.prisma.corporateCompany.create({ data: { ...data } });
    return { ok: true, company };
  }

  /** Upsert an employee */
  async upsertEmployee(data: any) {
    const { id, employee_code, ...rest } = data;
    if (id) {
      const emp = await this.prisma.corporateEmployee.update({ where: { id }, data: rest });
      return { ok: true, employee: emp };
    }
    const emp = await this.prisma.corporateEmployee.create({
      data: {
        employee_code: employee_code ?? `EMP${Date.now()}`,
        ...rest,
        company: { connect: { id: rest.company_id } },
      },
    });
    return { ok: true, employee: emp };
  }

  /** Update company PIN */
  async updateCompanyPin(company_id: string, plain_pin: string) {
    const bcrypt = require('bcrypt');
    const pin_hash = await bcrypt.hash(plain_pin, 12);
    await this.prisma.corporateCompanyPIN.upsert({
      where:  { company_id },
      update: { pin_hash },
      create: { pin_hash, company: { connect: { id: company_id } } },
    });
    return { ok: true };
  }

  /** Publish or unpublish the current production plan to corporate portal */
  async setPublishedToCorporate(plan_id: string, published: boolean) {
    const plan = await this.prisma.productionPlan.update({
      where: { id: plan_id },
      data:  { published_to_corporate: published },
    });
    return { ok: true, plan_id: plan.id, published_to_corporate: plan.published_to_corporate };
  }

  // ── Manager: Employee CRUD ─────────────────────────────────────────────────

  /** Manager creates a new employee in their own company */
  async createEmployeeAsManager(
    company_id: string,
    data: { email: string; name: string; benefit_level?: string; employee_code?: string; notes?: string },
  ) {
    if (!data.email || !data.name) {
      throw new BadRequestException('email and name are required');
    }
    const email = data.email.trim().toLowerCase();

    // Enforce uniqueness within company (matches Prisma @@unique)
    const existing = await this.prisma.corporateEmployee.findFirst({
      where: { company_id, email },
    });
    if (existing) throw new BadRequestException('Employee with that email already exists');

    const employee = await this.prisma.corporateEmployee.create({
      data: {
        employee_code: data.employee_code ?? `EMP${Date.now()}`,
        email,
        name:          data.name.trim(),
        benefit_level: data.benefit_level ?? null,
        notes:         data.notes ?? null,
        company:       { connect: { id: company_id } },
      },
    });
    return { ok: true, employee };
  }

  /** Manager updates email, name, level, or notes on an employee in their company */
  async updateEmployeeAsManager(
    company_id: string,
    employee_id: string,
    data: { email?: string; name?: string; benefit_level?: string; notes?: string; is_active?: boolean },
  ) {
    const emp = await this.prisma.corporateEmployee.findUnique({ where: { id: employee_id } });
    if (!emp) throw new NotFoundException('Employee not found');
    if (emp.company_id !== company_id) {
      throw new ForbiddenException('Employee belongs to a different company');
    }

    const updates: any = {};
    if (data.email !== undefined)         updates.email         = data.email.trim().toLowerCase();
    if (data.name !== undefined)          updates.name          = data.name.trim();
    if (data.benefit_level !== undefined) updates.benefit_level = data.benefit_level;
    if (data.notes !== undefined)         updates.notes         = data.notes;
    if (data.is_active !== undefined)     updates.is_active     = data.is_active;

    const employee = await this.prisma.corporateEmployee.update({
      where: { id: employee_id },
      data:  updates,
    });
    return { ok: true, employee };
  }

  /** Soft-delete: set is_active=false. Manager-scoped to their own company. */
  async deactivateEmployee(company_id: string, employee_id: string) {
    const emp = await this.prisma.corporateEmployee.findUnique({ where: { id: employee_id } });
    if (!emp) throw new NotFoundException('Employee not found');
    if (emp.company_id !== company_id) {
      throw new ForbiddenException('Employee belongs to a different company');
    }
    const employee = await this.prisma.corporateEmployee.update({
      where: { id: employee_id },
      data:  { is_active: false },
    });
    return { ok: true, employee };
  }

  // ── Manager: Benefit Levels ────────────────────────────────────────────────

  /** Returns benefit levels for company with employee count per level */
  async getBenefitLevels(company_id: string) {
    const levels = await this.prisma.corporateBenefitLevel.findMany({
      where:   { company_id },
      orderBy: { level_order: 'asc' },
    });

    // Annotate each level with employee count (matched by level_name)
    const employees = await this.prisma.corporateEmployee.findMany({
      where:  { company_id, is_active: true },
      select: { benefit_level: true },
    });
    const counts: Record<string, number> = {};
    for (const e of employees) {
      const key = e.benefit_level ?? '';
      counts[key] = (counts[key] ?? 0) + 1;
    }

    const annotated = levels.map(l => ({
      ...l,
      employee_count: counts[l.level_name ?? ''] ?? 0,
    }));
    return { ok: true, benefit_levels: annotated };
  }

  /** Bulk replace benefit levels for a company. Existing levels not in payload are removed. */
  async saveBenefitLevels(
    company_id: string,
    levels: Array<{
      id?: string;
      level_id: string;
      level_name?: string;
      level_order?: number;
      free_meals_week?: number;
      max_meals_week?: number;
      full_price?: number;
      tier_config?: any;
    }>,
  ) {
    if (!Array.isArray(levels)) throw new BadRequestException('levels must be an array');

    const result = await this.prisma.$transaction(async tx => {
      const existing = await tx.corporateBenefitLevel.findMany({ where: { company_id } });
      const incomingIds = new Set(levels.map(l => l.id).filter(Boolean) as string[]);

      // Delete levels that aren't in the payload
      const toDelete = existing.filter(e => !incomingIds.has(e.id));
      for (const del of toDelete) {
        await tx.corporateBenefitLevel.delete({ where: { id: del.id } });
      }

      // Upsert each level in payload
      const saved: any[] = [];
      for (const lvl of levels) {
        if (lvl.id) {
          const updated = await tx.corporateBenefitLevel.update({
            where: { id: lvl.id },
            data: {
              level_id:        lvl.level_id,
              level_name:      lvl.level_name,
              level_order:     lvl.level_order ?? 0,
              free_meals_week: lvl.free_meals_week ?? 0,
              max_meals_week:  lvl.max_meals_week ?? 0,
              full_price:      lvl.full_price ?? 0,
              tier_config:     lvl.tier_config ?? undefined,
            },
          });
          saved.push(updated);
        } else {
          const created = await tx.corporateBenefitLevel.create({
            data: {
              company_id,
              level_id:        lvl.level_id,
              level_name:      lvl.level_name,
              level_order:     lvl.level_order ?? 0,
              free_meals_week: lvl.free_meals_week ?? 0,
              max_meals_week:  lvl.max_meals_week ?? 0,
              full_price:      lvl.full_price ?? 0,
              tier_config:     lvl.tier_config ?? undefined,
            },
          });
          saved.push(created);
        }
      }
      return saved;
    });

    return { ok: true, benefit_levels: result };
  }

  /** Delete a benefit level. Optionally reassign its employees to another level first. */
  async deleteBenefitLevel(
    company_id: string,
    level_id: string,
    reassign_to_level_name?: string,
  ) {
    const level = await this.prisma.corporateBenefitLevel.findUnique({ where: { id: level_id } });
    if (!level) throw new NotFoundException('Benefit level not found');
    if (level.company_id !== company_id) {
      throw new ForbiddenException('Benefit level belongs to a different company');
    }

    // Reassign or null out employees referencing this level (matched by name)
    if (level.level_name) {
      await this.prisma.corporateEmployee.updateMany({
        where: { company_id, benefit_level: level.level_name },
        data:  { benefit_level: reassign_to_level_name ?? null },
      });
    }

    await this.prisma.corporateBenefitLevel.delete({ where: { id: level_id } });
    return { ok: true };
  }

  /** Update only the tier_config (meal allowances) for a single benefit level.
   *  Diffs old vs new and writes one CorporateMealAllowanceLog row per changed
   *  field — replaces the GAS "MealEditLog" sheet so the manager dashboard's
   *  Change History tab keeps working.
   */
  async updateBenefitLevelAllowances(
    company_id: string,
    level_id: string,
    tier_config: any,
    changed_by?: string,
  ) {
    const level = await this.prisma.corporateBenefitLevel.findUnique({ where: { id: level_id } });
    if (!level) throw new NotFoundException('Benefit level not found');
    if (level.company_id !== company_id) {
      throw new ForbiddenException('Benefit level belongs to a different company');
    }

    // Build the per-field diff in the same shape the GAS handler emitted
    // (Tier1_Meals, Tier2_Meals, Tier3_Meals, FreeMealsPerWeek, MaxMealsPerWeek).
    const oldCfg: any = level.tier_config ?? {};
    const newCfg: any = tier_config ?? {};
    const levelName = level.level_name || 'General';
    const author = (changed_by || 'manager').trim();

    type Diff = { field: string; oldValue: string; newValue: string };
    const diffs: Diff[] = [];

    // 1) Per-tier "meals" counts inside tier_config (free/tier1/tier2/tier3 → Tier{N}_Meals)
    const tierKeys: Array<{ key: string; field: string }> = [
      { key: 'free',  field: 'FreeMealsPerWeek' },
      { key: 'tier1', field: 'Tier1_Meals' },
      { key: 'tier2', field: 'Tier2_Meals' },
      { key: 'tier3', field: 'Tier3_Meals' },
    ];
    for (const { key, field } of tierKeys) {
      const o = oldCfg?.[key]?.meals;
      const n = newCfg?.[key]?.meals;
      if (n === undefined) continue; // caller didn't touch this tier
      const oldStr = String(o ?? 0);
      const newStr = String(n ?? 0);
      if (oldStr !== newStr) diffs.push({ field, oldValue: oldStr, newValue: newStr });
    }

    // 2) Top-level allowance fields the manager dashboard sometimes posts directly
    //    (free_meals_week / max_meals_week mirrored on the column itself)
    const topLevel: Array<{ key: string; field: string }> = [
      { key: 'free_meals_week', field: 'FreeMealsPerWeek' },
      { key: 'max_meals_week',  field: 'MaxMealsPerWeek' },
    ];
    for (const { key, field } of topLevel) {
      if (newCfg?.[key] === undefined) continue;
      const oldStr = String((oldCfg as any)?.[key] ?? (level as any)?.[key] ?? 0);
      const newStr = String(newCfg[key] ?? 0);
      if (oldStr !== newStr && !diffs.find(d => d.field === field)) {
        diffs.push({ field, oldValue: oldStr, newValue: newStr });
      }
    }

    // Single transaction: persist tier_config + insert all log rows atomically
    const [updated] = await this.prisma.$transaction([
      this.prisma.corporateBenefitLevel.update({
        where: { id: level_id },
        data:  { tier_config },
      }),
      ...diffs.map(d =>
        this.prisma.corporateMealAllowanceLog.create({
          data: {
            company_id,
            level_id,
            level_name:  levelName,
            changed_by:  author,
            field:       d.field,
            old_value:   d.oldValue,
            new_value:   d.newValue,
            description: `${levelName} ${d.field}: ${d.oldValue} → ${d.newValue}`,
          },
        }),
      ),
    ]);

    return { ok: true, benefit_level: updated, changes_logged: diffs.length };
  }

  /** Manager-facing meal-allowance change log. Most-recent first, capped at 50 rows.
   *  Replaces the GAS "MealEditLog" sheet read in get_meal_change_log.
   */
  async getMealChangeLog(company_id: string, limit = 50) {
    const rows = await this.prisma.corporateMealAllowanceLog.findMany({
      where:   { company_id },
      orderBy: { created_at: 'desc' },
      take:    Math.min(Math.max(limit, 1), 200),
    });
    return {
      ok: true,
      log: rows.map(r => ({
        timestamp:   r.created_at.toISOString().slice(0, 16).replace('T', ' '),
        changedBy:   r.changed_by,
        levelName:   r.level_name || 'General',
        field:       r.field,
        oldValue:    r.old_value,
        newValue:    r.new_value,
        description: r.description,
      })),
    };
  }

  /** How many active employees use a given benefit level */
  async getBenefitLevelEmployeeCount(company_id: string, level_id: string) {
    const level = await this.prisma.corporateBenefitLevel.findUnique({ where: { id: level_id } });
    if (!level) throw new NotFoundException('Benefit level not found');
    if (level.company_id !== company_id) {
      throw new ForbiddenException('Benefit level belongs to a different company');
    }
    const count = await this.prisma.corporateEmployee.count({
      where: { company_id, benefit_level: level.level_name, is_active: true },
    });
    return { ok: true, level_id, level_name: level.level_name, employee_count: count };
  }

  // ── Manager: Company self-service ──────────────────────────────────────────

  /** Full company record for the manager dashboard */
  async getCompanyForManager(company_id: string) {
    const company = await this.prisma.corporateCompany.findUnique({
      where: { id: company_id },
    });
    if (!company) throw new NotFoundException('Company not found');
    return { ok: true, company };
  }

  /** Manager updates contact details, delivery day, plan_type, or extra fields */
  async updateCompanyAsManager(company_id: string, data: any) {
    // Whitelist mutable fields — manager cannot change id, plan_type, is_active
    const allowed = [
      'name', 'email', 'phone', 'address', 'city', 'province', 'postal_code',
      'contact_name', 'contact_phone', 'contact_email',
      'delivery_day', 'delivery_notes', 'extra',
    ];
    const updates: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) updates[key] = data[key];
    }
    const company = await this.prisma.corporateCompany.update({
      where: { id: company_id },
      data:  updates,
    });
    return { ok: true, company };
  }

  /**
   * Returns the company PIN if it's still in legacy plain text form.
   * bcrypt hashes are one-way — once upgraded, the manager has to set a new PIN.
   */
  async getCompanyPinForManager(company_id: string) {
    const pinRecord = await this.prisma.corporateCompanyPIN.findUnique({
      where: { company_id },
    });
    if (!pinRecord) return { ok: true, pin: null, encrypted: false };

    if (pinRecord.pin_hash.startsWith('plain:')) {
      return { ok: true, pin: pinRecord.pin_hash.slice(6), encrypted: false };
    }
    // bcrypt — cannot reverse
    return { ok: true, pin: null, encrypted: true };
  }

  // ── Manager: Par Levels ────────────────────────────────────────────────────

  async getParLevels(company_id: string) {
    const par_levels = await this.prisma.corporateParLevel.findMany({
      where:   { company_id },
      orderBy: { category_name: 'asc' },
    });
    return { ok: true, par_levels };
  }

  /** Bulk replace par levels for a company */
  async saveParLevels(
    company_id: string,
    levels: Array<{
      id?: string;
      category_id: string;
      category_name?: string;
      par_quantity?: number;
      items_json?: any;
    }>,
  ) {
    if (!Array.isArray(levels)) throw new BadRequestException('levels must be an array');

    const result = await this.prisma.$transaction(async tx => {
      const existing = await tx.corporateParLevel.findMany({ where: { company_id } });
      const incomingIds = new Set(levels.map(l => l.id).filter(Boolean) as string[]);

      const toDelete = existing.filter(e => !incomingIds.has(e.id));
      for (const del of toDelete) {
        await tx.corporateParLevel.delete({ where: { id: del.id } });
      }

      const saved: any[] = [];
      for (const lvl of levels) {
        if (lvl.id) {
          const updated = await tx.corporateParLevel.update({
            where: { id: lvl.id },
            data: {
              category_id:   lvl.category_id,
              category_name: lvl.category_name,
              par_quantity:  lvl.par_quantity ?? 0,
              items_json:    lvl.items_json ?? undefined,
            },
          });
          saved.push(updated);
        } else {
          const created = await tx.corporateParLevel.create({
            data: {
              company_id,
              category_id:   lvl.category_id,
              category_name: lvl.category_name,
              par_quantity:  lvl.par_quantity ?? 0,
              items_json:    lvl.items_json ?? undefined,
            },
          });
          saved.push(created);
        }
      }
      return saved;
    });

    return { ok: true, par_levels: result };
  }

  /** All available meals from the latest published plan, grouped by category for hand-pick UI */
  async getParCatalog() {
    const plan = await this.prisma.productionPlan.findFirst({
      where:   { published_to_corporate: true },
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
                allergen_tags: true,
                dietary_tags: true,
                protein_types: true,
              },
            },
          },
        },
      },
    });
    if (!plan) return { ok: true, week: null, catalog: {} };

    const catalog: Record<string, any[]> = {};
    for (const item of plan.items) {
      const cat = item.meal.category ?? 'Other';
      if (!catalog[cat]) catalog[cat] = [];
      catalog[cat].push({ ...item.meal, plan_quantity: item.quantity });
    }
    return { ok: true, week: plan.week_label, plan_id: plan.id, catalog };
  }

  /**
   * Compares the latest published plan vs the next draft/published plan.
   * Returns swap pairs by category — used to remap saved par carts week-over-week.
   */
  async getWeeklySwaps() {
    const plans = await this.prisma.productionPlan.findMany({
      orderBy: { week_start: 'desc' },
      take:    2,
      include: {
        items: { include: { meal: { select: { id: true, name: true, display_name: true, category: true } } } },
      },
    });

    if (plans.length < 2) return { ok: true, current: plans[0]?.week_label ?? null, next: null, swaps: [] };

    const [next, current] = plans; // most recent first
    const currentByCat: Record<string, any[]> = {};
    for (const item of current.items) {
      const cat = item.meal.category ?? 'Other';
      (currentByCat[cat] ??= []).push(item.meal);
    }
    const nextByCat: Record<string, any[]> = {};
    for (const item of next.items) {
      const cat = item.meal.category ?? 'Other';
      (nextByCat[cat] ??= []).push(item.meal);
    }

    const swaps: Array<{ category: string; from: any; to: any }> = [];
    for (const cat of Object.keys(currentByCat)) {
      const fromMeals = currentByCat[cat];
      const toMeals   = nextByCat[cat] ?? [];
      // Pair up by index (best-effort) — same category, same slot
      const len = Math.max(fromMeals.length, toMeals.length);
      for (let i = 0; i < len; i++) {
        swaps.push({ category: cat, from: fromMeals[i] ?? null, to: toMeals[i] ?? null });
      }
    }

    return {
      ok: true,
      current: current.week_label,
      next:    next.week_label,
      swaps,
    };
  }

  /**
   * Applies the latest weekly swaps to a company's saved par_level items_json,
   * remapping old meal IDs to their new equivalents.
   */
  async rebuildParCarts(company_id: string) {
    const swapsResult = await this.getWeeklySwaps();
    if (!swapsResult.swaps?.length) return { ok: true, updated: 0, message: 'No swaps to apply' };

    // Build a map of old_meal_id → new_meal_id
    const swapMap = new Map<string, string>();
    for (const s of swapsResult.swaps) {
      if (s.from?.id && s.to?.id) swapMap.set(s.from.id, s.to.id);
    }

    const parLevels = await this.prisma.corporateParLevel.findMany({ where: { company_id } });
    let updated = 0;

    for (const lvl of parLevels) {
      const items = (lvl.items_json as any) ?? null;
      if (!items || !Array.isArray(items)) continue;

      let changed = false;
      const remapped = items.map((item: any) => {
        if (item?.meal_id && swapMap.has(item.meal_id)) {
          changed = true;
          return { ...item, meal_id: swapMap.get(item.meal_id), swapped_from: item.meal_id };
        }
        return item;
      });

      if (changed) {
        await this.prisma.corporateParLevel.update({
          where: { id: lvl.id },
          data:  { items_json: remapped },
        });
        updated++;
      }
    }

    return { ok: true, updated, total_levels: parLevels.length };
  }

  /**
   * Confirms par-level selections by creating order rows for the company.
   * `items` is the flattened meal selection (already merged from all categories).
   */
  async confirmParOrder(
    company_id: string,
    items: Array<{ meal_id: string; quantity?: number }>,
    delivery_date?: string,
  ) {
    if (!items?.length) throw new BadRequestException('No items provided');

    const mealIds = items.map(i => i.meal_id);
    const meals = await this.prisma.mealRecipe.findMany({ where: { id: { in: mealIds } } });
    const mealMap = new Map(meals.map(m => [m.id, m]));

    // Generate next order code
    const lastSetting = await this.prisma.corporateSetting.findUnique({ where: { key: 'LastOrderID' } });
    const nextCode = String(parseInt(lastSetting?.value ?? '10022') + 1);

    let total = 0;
    const orderItems: any[] = [];

    for (const item of items) {
      const meal = mealMap.get(item.meal_id);
      if (!meal) throw new NotFoundException(`Meal ${item.meal_id} not found`);
      const qty = item.quantity ?? 1;
      const unitPrice = meal.pricing_override ?? meal.computed_cost ?? 0;
      const lineTotal = unitPrice * qty;
      total += lineTotal;

      orderItems.push({
        meal_recipe_id:   meal.id,
        meal_external_id: meal.meal_code?.replace('BD-', '#') ?? null,
        meal_name:        meal.display_name ?? meal.name,
        quantity:         qty,
        tier:             'free',
        unit_price:       unitPrice,
        employee_subsidy: 0,
        company_subsidy:  0,
        bd_subsidy:       0,
        line_total:       lineTotal,
      });
    }

    const order = await this.prisma.corporateOrder.create({
      data: {
        order_code:    nextCode,
        company:       { connect: { id: company_id } },
        delivery_date: delivery_date ? new Date(delivery_date) : null,
        status:        'pending',
        total_amount:  total,
        employee_cost: 0,
        company_cost:  total,
        bd_cost:       0,
        source:        'manager',
        items:         { create: orderItems },
      },
      include: { items: true },
    });

    await this.prisma.corporateSetting.upsert({
      where:  { key: 'LastOrderID' },
      update: { value: nextCode },
      create: { key: 'LastOrderID', value: nextCode },
    });

    return { ok: true, order_code: nextCode, order };
  }

  // ── Manager: Send order reminders ──────────────────────────────────────────

  /**
   * Emails employees who haven't placed an order in the last `since_days` days
   * (or this week, if a published plan exists).
   */
  async sendOrderReminders(company_id: string, since_days = 7) {
    const company = await this.prisma.corporateCompany.findUnique({ where: { id: company_id } });
    if (!company) throw new NotFoundException('Company not found');

    const since = new Date(Date.now() - since_days * 24 * 60 * 60 * 1000);
    const recentOrderEmployeeIds = new Set(
      (await this.prisma.corporateOrder.findMany({
        where:  { company_id, created_at: { gte: since }, employee_id: { not: null } },
        select: { employee_id: true },
      })).map(o => o.employee_id!),
    );

    const employees = await this.prisma.corporateEmployee.findMany({
      where: { company_id, is_active: true, id: { notIn: [...recentOrderEmployeeIds] } },
    });

    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(`[REMINDERS] RESEND_API_KEY not set — would have emailed ${employees.length} employees`);
      return { ok: true, sent: 0, would_send: employees.length, dev_mode: true };
    }

    const fromDomain = this.config.get<string>('RESEND_FROM_EMAIL') ?? 'noreply@betterday.com.au';
    const baseUrl    = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const resend     = new Resend(apiKey);

    let sent = 0;
    for (const emp of employees) {
      try {
        const { error } = await resend.emails.send({
          from:    `BetterDay Meals <${fromDomain}>`,
          to:      [emp.email],
          subject: `Reminder: Order your ${company.name} meals for this week`,
          html: `<p>Hi ${emp.name},</p><p>This is a friendly reminder to place your meal order for this week.</p><p><a href="${baseUrl}/corporate/login?company=${company.id}">Sign in to order →</a></p>`,
        });
        if (!error) sent++;
        else this.logger.error(`[REMINDERS] Failed for ${emp.email}: ${JSON.stringify(error)}`);
      } catch (err) {
        this.logger.error(`[REMINDERS] Failed for ${emp.email}: ${String(err)}`);
      }
    }

    return { ok: true, sent, total: employees.length };
  }

  // ── BD Admin: Invoices ─────────────────────────────────────────────────────

  /** All invoices across all companies (admin view) */
  async getAllInvoices(filter?: { status?: string; company_id?: string }) {
    const where: any = {};
    if (filter?.status)     where.status     = filter.status;
    if (filter?.company_id) where.company_id = filter.company_id;

    const invoices = await this.prisma.companyInvoice.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: { company: { select: { id: true, name: true } } },
    });
    return { ok: true, invoices };
  }

  /** Update invoice status, payment info, or notes */
  async updateInvoice(invoice_id: string, data: {
    status?: string;
    amount_paid?: number;
    notes?: string;
    pdf_url?: string;
    issued_at?: string;
    due_at?: string;
  }) {
    const updates: any = {};
    if (data.status !== undefined)      updates.status      = data.status;
    if (data.amount_paid !== undefined) updates.amount_paid = data.amount_paid;
    if (data.notes !== undefined)       updates.notes       = data.notes;
    if (data.pdf_url !== undefined)     updates.pdf_url     = data.pdf_url;
    if (data.issued_at !== undefined)   updates.issued_at   = new Date(data.issued_at);
    if (data.due_at !== undefined)      updates.due_at      = new Date(data.due_at);

    const invoice = await this.prisma.companyInvoice.update({
      where: { id: invoice_id },
      data:  updates,
    });
    return { ok: true, invoice };
  }

  /** Generate an invoice from order data for a company over a date range */
  async generateInvoice(
    company_id: string,
    period_start: string,
    period_end: string,
    notes?: string,
  ) {
    const start = new Date(period_start);
    const end   = new Date(period_end);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid period_start or period_end');
    }

    const company = await this.prisma.corporateCompany.findUnique({ where: { id: company_id } });
    if (!company) throw new NotFoundException('Company not found');

    const orders = await this.prisma.corporateOrder.findMany({
      where: {
        company_id,
        created_at: { gte: start, lte: end },
        status:     { not: 'pending' },
      },
    });

    const amount_total = orders.reduce((s, o) => s + (o.company_cost ?? 0), 0);

    // Pad invoice number with company prefix and date
    const invoice_number = `INV-${company_id}-${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

    const invoice = await this.prisma.companyInvoice.create({
      data: {
        invoice_number,
        company:      { connect: { id: company_id } },
        period_start: start,
        period_end:   end,
        amount_total,
        status:       'draft',
        notes:        notes ?? `Auto-generated from ${orders.length} orders`,
        issued_at:    new Date(),
      },
    });
    return { ok: true, invoice, order_count: orders.length };
  }

  // ── BD Admin: Credit Notes ─────────────────────────────────────────────────

  async createCreditNote(data: {
    company_id: string;
    employee_id?: string;
    amount: number;
    reason?: string;
    applied_to_order?: string;
  }) {
    if (!data.company_id || !data.amount) {
      throw new BadRequestException('company_id and amount are required');
    }

    const credit_note_code = `CN-${data.company_id}-${Date.now().toString().slice(-6)}`;
    const note = await this.prisma.corporateCreditNote.create({
      data: {
        credit_note_code,
        company_id:       data.company_id,
        employee_id:      data.employee_id ?? null,
        amount:           data.amount,
        reason:           data.reason ?? null,
        applied_to_order: data.applied_to_order ?? null,
        applied_at:       data.applied_to_order ? new Date() : null,
      },
    });
    return { ok: true, credit_note: note };
  }

  async getCreditNotes(company_id?: string) {
    const where: any = { is_void: false };
    if (company_id) where.company_id = company_id;

    const credit_notes = await this.prisma.corporateCreditNote.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: { company: { select: { id: true, name: true } } },
    });
    return { ok: true, credit_notes };
  }

  async voidCreditNote(id: string) {
    const note = await this.prisma.corporateCreditNote.update({
      where: { id },
      data:  { is_void: true },
    });
    return { ok: true, credit_note: note };
  }

  /** AR aging summary — invoices grouped by days overdue */
  async getArSummary() {
    const unpaid = await this.prisma.companyInvoice.findMany({
      where:   { status: { in: ['sent', 'overdue'] } },
      include: { company: { select: { id: true, name: true } } },
    });

    const now = Date.now();
    const buckets = {
      current:  { count: 0, total: 0, invoices: [] as any[] },  // not yet due
      d_1_30:   { count: 0, total: 0, invoices: [] as any[] },
      d_31_60:  { count: 0, total: 0, invoices: [] as any[] },
      d_61_90:  { count: 0, total: 0, invoices: [] as any[] },
      d_90_plus:{ count: 0, total: 0, invoices: [] as any[] },
    };

    for (const inv of unpaid) {
      const due = inv.due_at ? new Date(inv.due_at).getTime() : null;
      const outstanding = (inv.amount_total ?? 0) - (inv.amount_paid ?? 0);
      if (outstanding <= 0) continue;

      const daysOverdue = due ? Math.floor((now - due) / (1000 * 60 * 60 * 24)) : 0;
      const summary = { ...inv, days_overdue: daysOverdue, outstanding };

      let bucket: keyof typeof buckets;
      if (daysOverdue <= 0)       bucket = 'current';
      else if (daysOverdue <= 30) bucket = 'd_1_30';
      else if (daysOverdue <= 60) bucket = 'd_31_60';
      else if (daysOverdue <= 90) bucket = 'd_61_90';
      else                        bucket = 'd_90_plus';

      buckets[bucket].count++;
      buckets[bucket].total += outstanding;
      buckets[bucket].invoices.push(summary);
    }

    const total_outstanding = Object.values(buckets).reduce((s, b) => s + b.total, 0);
    return { ok: true, total_outstanding, buckets };
  }
}
