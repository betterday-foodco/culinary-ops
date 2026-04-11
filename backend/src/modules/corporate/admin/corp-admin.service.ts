import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

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
    const { id, code, _count, employees, orders, invoices, benefit_levels, par_levels, company_pin, credit_notes, monthly_statements, ...rest } = data;
    // Use code as id for new companies if id not provided
    const companyId = id || code;
    if (companyId) {
      const exists = await this.prisma.corporateCompany.findUnique({ where: { id: companyId } });
      if (exists) {
        const company = await this.prisma.corporateCompany.update({ where: { id: companyId }, data: rest });
        return { ok: true, company };
      }
    }
    const company = await this.prisma.corporateCompany.create({ data: { id: companyId ?? rest.name?.toUpperCase().replace(/\s+/g, '').slice(0, 10), ...rest } });
    return { ok: true, company };
  }

  /** Upsert an employee (with domain validation + optional PIN) */
  async upsertEmployee(data: any) {
    const { id, employee_code, pin, role, is_manager, ...rest } = data;

    // TODO: Domain validation — add allowed_email_domain column to CorporateCompany
    // schema when ready. For now, skip email domain enforcement.

    // Hash PIN if provided
    const updateData = { ...rest };
    if (pin) {
      const bcrypt = require('bcrypt');
      updateData.pin_hash = await bcrypt.hash(pin, 12);
    }

    if (id) {
      const { company_id: _cid, ...safeUpdate } = updateData;
      const emp = await this.prisma.corporateEmployee.update({ where: { id }, data: safeUpdate });
      return { ok: true, employee: emp };
    }
    const { company_id: compId, ...createData } = updateData;
    const emp = await this.prisma.corporateEmployee.create({
      data: {
        employee_code: employee_code ?? `EMP${Date.now()}`,
        ...createData,
        company: { connect: { id: compId } },
      },
    });
    return { ok: true, employee: emp };
  }

  /** Set employee PIN */
  async setEmployeePin(employee_id: string, plain_pin: string, company_id?: string) {
    // If company_id provided, verify the employee belongs to that company (for manager access)
    if (company_id) {
      const emp = await this.prisma.corporateEmployee.findFirst({
        where: { id: employee_id, company_id },
      });
      if (!emp) throw new NotFoundException('Employee not found in your company');
    }

    const bcrypt = require('bcrypt');
    const pin_hash = await bcrypt.hash(plain_pin, 12);
    await this.prisma.corporateEmployee.update({
      where: { id: employee_id },
      data: { pin_hash },
    });
    return { ok: true };
  }

  /** Update employee fields (manager-scoped) */
  async updateEmployee(employee_id: string, data: any, company_id: string) {
    const emp = await this.prisma.corporateEmployee.findFirst({ where: { id: employee_id, company_id } });
    if (!emp) throw new NotFoundException('Employee not found');
    const { id, role, is_manager, pin, employee_code, ...safe } = data;
    const updated = await this.prisma.corporateEmployee.update({ where: { id: employee_id }, data: safe });
    return { ok: true, employee: updated };
  }

  /** Deactivate employee (manager-scoped) */
  async deactivateEmployee(employee_id: string, company_id: string) {
    const emp = await this.prisma.corporateEmployee.findFirst({ where: { id: employee_id, company_id } });
    if (!emp) throw new NotFoundException('Employee not found');
    await this.prisma.corporateEmployee.update({ where: { id: employee_id }, data: { is_active: false } });
    return { ok: true };
  }

  /** Update a single benefit level's tier config */
  async updateBenefitLevel(level_id: string, data: any, company_id: string) {
    const level = await this.prisma.corporateBenefitLevel.findFirst({
      where: { id: level_id, company_id },
    });
    if (!level) throw new NotFoundException('Benefit level not found');
    const updated = await this.prisma.corporateBenefitLevel.update({
      where: { id: level_id },
      data: { tier_config: data.tier_config ?? data },
    });
    return { ok: true, benefit_level: updated };
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

  // ── Global aggregates (BD Admin) ─────────────────────────────────────────

  /** Overview stats across ALL companies */
  async getGlobalOverview() {
    // This week bounds
    const now = new Date();
    const sun = new Date(now); sun.setDate(now.getDate() - now.getDay()); sun.setHours(0, 0, 0, 0);
    const sat = new Date(sun); sat.setDate(sun.getDate() + 7);

    const [companies, employees, orders, invoices, weekOrders, topMealRows] = await Promise.all([
      this.prisma.corporateCompany.findMany({ select: { id: true, is_active: true } }),
      this.prisma.corporateEmployee.count(),
      this.prisma.corporateOrder.aggregate({
        _sum: { total_amount: true, employee_cost: true, company_cost: true, bd_cost: true },
        _count: true,
      }),
      this.prisma.companyInvoice.findMany({
        select: { status: true, amount_total: true, amount_paid: true },
      }),
      // This week's orders
      this.prisma.corporateOrder.findMany({
        where: { created_at: { gte: sun, lt: sat }, status: { not: 'cancelled' } },
        select: { total_amount: true, employee_id: true, company_id: true, items: { select: { id: true } } },
      }),
      // Top meal (most ordered all time)
      this.prisma.corporateOrderItem.groupBy({
        by: ['meal_name'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 1,
      }),
    ]);

    const totalRevenue = orders._sum.total_amount ?? 0;
    const totalMeals = await this.prisma.corporateOrderItem.count();
    const outstanding = invoices
      .filter(i => ['draft', 'sent', 'overdue'].includes(i.status))
      .reduce((s, i) => s + ((i.amount_total ?? 0) - (i.amount_paid ?? 0)), 0);
    const avgOrder = orders._count > 0 ? totalRevenue / orders._count : 0;

    // Weekly aggregates
    const weekRevenue = weekOrders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
    const weekMeals = weekOrders.reduce((s, o) => s + o.items.length, 0);
    const weekEmployees = new Set(weekOrders.map(o => o.employee_id)).size;
    const weekCompanies = new Set(weekOrders.map(o => o.company_id)).size;

    // Top meal
    const topMeal = topMealRows.length > 0 ? topMealRows[0].meal_name : null;
    const topMealCount = topMealRows.length > 0 ? topMealRows[0]._count.id : 0;

    return {
      ok: true,
      total_companies: companies.length,
      active_companies: companies.filter(c => c.is_active).length,
      total_employees: employees,
      total_orders: orders._count,
      total_revenue: totalRevenue,
      total_employee_cost: orders._sum.employee_cost ?? 0,
      total_company_cost: orders._sum.company_cost ?? 0,
      total_bd_cost: orders._sum.bd_cost ?? 0,
      total_meals: totalMeals,
      outstanding_amount: outstanding,
      avg_order_value: avgOrder,
      total_invoices: invoices.length,
      // Weekly stats
      week_revenue: weekRevenue,
      week_orders: weekOrders.length,
      week_meals: weekMeals,
      week_employees: weekEmployees,
      week_companies: weekCompanies,
      // Top performer
      top_meal: topMeal,
      top_meal_count: topMealCount,
    };
  }

  /** Create a credit note */
  async createCreditNote(data: { company_id: string; employee_id?: string; amount: number; reason?: string }) {
    const code = `CN-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const note = await this.prisma.corporateCreditNote.create({
      data: {
        credit_note_code: code,
        company_id: data.company_id,
        employee_id: data.employee_id || null,
        amount: data.amount,
        reason: data.reason || null,
      },
    });
    return { ok: true, credit_note: note };
  }

  /** AR (accounts receivable) summary — outstanding amounts by aging bucket */
  async getArSummary() {
    const invoices = await this.prisma.companyInvoice.findMany({
      where: { status: { in: ['draft', 'sent', 'overdue'] } },
    });
    const now = Date.now();
    let total_outstanding = 0, overdue_count = 0;
    const buckets = { current: 0, days_15: 0, days_30: 0, days_60: 0 };
    for (const inv of invoices) {
      const amt = (inv as any).amount_total ?? (inv as any).company_owed ?? 0;
      const paid = (inv as any).amount_paid ?? (inv as any).paid_amount ?? 0;
      const owed = amt - paid;
      total_outstanding += owed;
      const age = inv.created_at ? Math.floor((now - new Date(inv.created_at).getTime()) / 86400000) : 0;
      if (age >= 60) buckets.days_60 += owed;
      else if (age >= 30) buckets.days_30 += owed;
      else if (age >= 15) buckets.days_15 += owed;
      else buckets.current += owed;
      if (inv.status === 'overdue') overdue_count++;
    }
    return {
      ok: true,
      total_outstanding,
      total_ar: total_outstanding, // alias for frontend
      overdue_count,
      // Flat fields (legacy)
      ...buckets,
      // Nested buckets (frontend uses this shape)
      buckets: {
        current: buckets.current,
        days_15_30: buckets.days_15,
        days_30_60: buckets.days_30,
        days_60_90: buckets.days_60,
      },
    };
  }

  /** Mark invoice status (send/paid/void) */
  async markInvoiceStatus(invoice_id: string, status: string) {
    const invoice = await this.prisma.companyInvoice.update({
      where: { id: invoice_id },
      data: { status },
    });
    return { ok: true, invoice };
  }

  /** Paginated global invoices across all companies */
  async getAllInvoices(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [invoices, total] = await Promise.all([
      this.prisma.companyInvoice.findMany({
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: { company: { select: { id: true, name: true } } },
      }),
      this.prisma.companyInvoice.count(),
    ]);
    return { ok: true, invoices, total, page, limit };
  }

  /** Paginated global orders across all companies */
  async getAllOrders(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.prisma.corporateOrder.findMany({
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          company:  { select: { id: true, name: true } },
          employee: { select: { name: true, email: true, employee_code: true } },
          items:    { include: { meal_recipe: { select: { display_name: true, category: true } } } },
        },
      }),
      this.prisma.corporateOrder.count(),
    ]);
    return { ok: true, orders, total, page, limit };
  }

  // ── Company detail (full) ─────────────────────────────────────────────────

  /** Full company detail with all relations */
  async getCompanyDetail(company_id: string) {
    const company = await this.prisma.corporateCompany.findUnique({
      where: { id: company_id },
      include: {
        benefit_levels: { orderBy: { level_order: 'asc' } },
        par_levels: true,
        company_pin: { select: { updated_at: true } },
        _count: { select: { employees: true, orders: true, invoices: true } },
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return { ok: true, company };
  }

  /** Update all company fields */
  async updateCompanyFull(company_id: string, data: any) {
    const { id, _count, benefit_levels, par_levels, company_pin, employees, orders, invoices, credit_notes, monthly_statements, ...updateData } = data;
    const company = await this.prisma.corporateCompany.update({
      where: { id: company_id },
      data: updateData,
    });
    return { ok: true, company };
  }

  /** Bulk upsert benefit levels for a company */
  async upsertBenefitLevels(company_id: string, levels: any[]) {
    await this.prisma.corporateBenefitLevel.deleteMany({ where: { company_id } });
    const created = await Promise.all(
      levels.map((level, i) =>
        this.prisma.corporateBenefitLevel.create({
          data: {
            company_id,
            level_id: level.level_id ?? String(i + 1),
            level_name: level.level_name,
            level_order: level.level_order ?? i,
            free_meals_week: level.free_meals_week ?? 0,
            max_meals_week: level.max_meals_week ?? 0,
            full_price: level.full_price ?? 0,
            tier_config: level.tier_config ?? null,
          },
        }),
      ),
    );
    return { ok: true, benefit_levels: created };
  }

  /** Bulk upsert par levels for a company */
  async upsertParLevels(company_id: string, levels: any[]) {
    await this.prisma.corporateParLevel.deleteMany({ where: { company_id } });
    const created = await Promise.all(
      levels.map(level =>
        this.prisma.corporateParLevel.create({
          data: {
            company_id,
            category_id: level.category_id,
            category_name: level.category_name,
            par_quantity: level.par_quantity ?? 0,
            items_json: level.items_json ?? null,
          },
        }),
      ),
    );
    return { ok: true, par_levels: created };
  }

  // ── Monthly Report (Manager) ──────────────────────────────────────────────

  /** Monthly report with tier breakdown */
  async getMonthlyReport(company_id: string, month?: string) {
    const now = new Date();
    const targetMonth = month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [year, mon] = targetMonth.split('-').map(Number);
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 0, 23, 59, 59);

    const orders = await this.prisma.corporateOrder.findMany({
      where: {
        company_id,
        created_at: { gte: start, lte: end },
        status: { not: 'cancelled' },
      },
      include: { items: true, employee: { select: { name: true } } },
    });

    const tierBreakdown: Record<string, { meals: number; staff_paid: number; company_covered: number; bd_contributed: number }> = {};
    for (const order of orders) {
      for (const item of order.items) {
        const tier = item.tier ?? 'free';
        if (!tierBreakdown[tier]) tierBreakdown[tier] = { meals: 0, staff_paid: 0, company_covered: 0, bd_contributed: 0 };
        tierBreakdown[tier].meals += item.quantity;
        tierBreakdown[tier].staff_paid += item.unit_price * item.quantity;
        tierBreakdown[tier].company_covered += item.company_subsidy * item.quantity;
        tierBreakdown[tier].bd_contributed += item.bd_subsidy * item.quantity;
      }
    }

    const statement = await this.prisma.corporateMonthlyStatement.findFirst({
      where: { company_id, month_year: targetMonth },
    });

    return {
      ok: true,
      month: targetMonth,
      total_orders: orders.length,
      tier_breakdown: Object.entries(tierBreakdown).map(([tier, data]) => ({
        tier,
        ...data,
        total_value: data.staff_paid + data.company_covered + data.bd_contributed,
      })),
      totals: {
        meals: Object.values(tierBreakdown).reduce((s, t) => s + t.meals, 0),
        staff_paid: Object.values(tierBreakdown).reduce((s, t) => s + t.staff_paid, 0),
        company_covered: Object.values(tierBreakdown).reduce((s, t) => s + t.company_covered, 0),
        bd_contributed: Object.values(tierBreakdown).reduce((s, t) => s + t.bd_contributed, 0),
      },
      statement,
    };
  }

  /** Get par levels for a company */
  async getParLevels(company_id: string) {
    const par_levels = await this.prisma.corporateParLevel.findMany({ where: { company_id } });
    return { ok: true, par_levels };
  }

  /** Get benefit levels for a company */
  async getBenefitLevels(company_id: string) {
    const benefit_levels = await this.prisma.corporateBenefitLevel.findMany({
      where: { company_id },
      orderBy: { level_order: 'asc' },
    });
    return { ok: true, benefit_levels };
  }

  /** Get full company account for manager view */
  async getCompanyAccount(company_id: string) {
    const company = await this.prisma.corporateCompany.findUnique({
      where: { id: company_id },
      include: { _count: { select: { employees: true, orders: true } } },
    });
    if (!company) throw new NotFoundException('Company not found');
    return { ok: true, company };
  }

  /** Update company account (limited manager fields) */
  async updateCompanyAccount(company_id: string, data: any) {
    const allowed = ['contact_name', 'contact_email', 'contact_phone', 'phone', 'delivery_notes'];
    const filtered: Record<string, any> = {};
    for (const key of allowed) {
      if (data[key] !== undefined) filtered[key] = data[key];
    }
    const company = await this.prisma.corporateCompany.update({
      where: { id: company_id },
      data: filtered,
    });
    return { ok: true, company };
  }

  /** Bulk employee actions */
  async bulkEmployeeAction(company_id: string, action: string, employee_ids: string[], params?: any) {
    switch (action) {
      case 'apply_level': {
        const level = params?.level ?? 'free';
        await this.prisma.corporateEmployee.updateMany({
          where: { id: { in: employee_ids }, company_id },
          data: { benefit_level: level },
        });
        return { ok: true, updated: employee_ids.length };
      }
      case 'deactivate': {
        await this.prisma.corporateEmployee.updateMany({
          where: { id: { in: employee_ids }, company_id },
          data: { is_active: false },
        });
        return { ok: true, deactivated: employee_ids.length };
      }
      default:
        return { ok: false, message: `Unknown action: ${action}` };
    }
  }

  // ── Invoice detail ─────────────────────────────────────────────────────────

  /** Get invoice with computed line items */
  async getInvoiceDetail(invoice_id: string) {
    const invoice = await this.prisma.companyInvoice.findUnique({
      where: { id: invoice_id },
      include: { company: { select: { id: true, name: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const orders = await this.prisma.corporateOrder.findMany({
      where: {
        company_id: invoice.company_id,
        created_at: { gte: invoice.period_start, lte: invoice.period_end },
        status: { not: 'cancelled' },
      },
      include: {
        employee: { select: { name: true, email: true } },
        items: { include: { meal_recipe: { select: { display_name: true, category: true } } } },
      },
      orderBy: { created_at: 'asc' },
    });

    const line_items = orders.flatMap(order =>
      order.items.map(item => ({
        employee_name: order.employee?.name ?? 'N/A',
        delivery_date: order.delivery_date,
        dish: item.meal_recipe?.display_name ?? item.meal_name,
        tier: item.tier,
        quantity: item.quantity,
        retail: item.unit_price + item.company_subsidy + item.bd_subsidy,
        employee_paid: item.unit_price * item.quantity,
        company_covers: item.company_subsidy * item.quantity,
        bd_covers: item.bd_subsidy * item.quantity,
      })),
    );

    return {
      ok: true,
      invoice,
      line_items,
      summary: {
        total_meals: line_items.reduce((s, l) => s + l.quantity, 0),
        total_employee: line_items.reduce((s, l) => s + l.employee_paid, 0),
        total_company: line_items.reduce((s, l) => s + l.company_covers, 0),
        total_bd: line_items.reduce((s, l) => s + l.bd_covers, 0),
      },
    };
  }

  // ── Corporate Reports ──────────────────────────────────────────────────────

  /** Delivery report for a week */
  async getDeliveryReport(week?: string) {
    const companies = await this.prisma.corporateCompany.findMany({
      where: { is_active: true },
      include: {
        _count: { select: { employees: true } },
      },
    });

    // Get orders for the week
    const now = new Date();
    const weekStart = week ? new Date(week) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59);

    const orders = await this.prisma.corporateOrder.findMany({
      where: {
        created_at: { gte: weekStart, lte: weekEnd },
        status: { not: 'cancelled' },
      },
      include: { items: true },
    });

    // Aggregate per company
    const byCompany: Record<string, { meals: number; total: number }> = {};
    for (const order of orders) {
      if (!byCompany[order.company_id]) byCompany[order.company_id] = { meals: 0, total: 0 };
      byCompany[order.company_id].meals += order.items.reduce((s, i) => s + i.quantity, 0);
      byCompany[order.company_id].total += order.total_amount;
    }

    return {
      ok: true,
      week_start: weekStart.toISOString(),
      rows: companies.map(c => {
        const extra = (c as any).extra as Record<string, any> ?? {};
        return {
          client: c.name,
          company_id: c.id,
          meals: byCompany[c.id]?.meals ?? 0,
          total: byCompany[c.id]?.total ?? 0,
          address: [c.address, c.city, c.province, c.postal_code].filter(Boolean).join(', '),
          gate_code: extra.GateCode ?? extra.gate_code ?? '',
          email: c.contact_email ?? '',
          phone: c.contact_phone ?? c.phone ?? '',
          notes: c.delivery_notes ?? '',
          bags: '',
          duration: '',
          business_hours: extra.BusinessHours ?? (c as any).delivery_window_start ? `${(c as any).delivery_window_start}-${(c as any).delivery_window_end}` : '',
          assigned_driver: '',
          delivery_day: c.delivery_day ?? '',
        };
      }).filter(r => r.meals > 0),
    };
  }

  /** Labels report for a week */
  async getLabelsReport(week?: string) {
    const now = new Date();
    const weekStart = week ? new Date(week) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59);

    const items = await this.prisma.corporateOrderItem.findMany({
      where: {
        order: {
          created_at: { gte: weekStart, lte: weekEnd },
          status: { not: 'cancelled' },
        },
      },
      include: {
        meal_recipe: { select: { display_name: true, category: true, dietary_tags: true, allergen_tags: true } },
        order: { include: { employee: { select: { name: true } }, company: { select: { name: true } } } },
      },
    });

    return {
      ok: true,
      week_start: weekStart.toISOString(),
      labels: items.map(item => ({
        dish: item.meal_recipe?.display_name ?? item.meal_name,
        diet: item.meal_recipe?.dietary_tags?.join(', ') ?? '',
        allergens: item.meal_recipe?.allergen_tags?.join(', ') ?? '',
        employee: item.order.employee?.name ?? 'N/A',
        company: item.order.company.name,
        quantity: item.quantity,
      })),
    };
  }

  /** Picklist report for a week */
  async getPicklistReport(week?: string) {
    const now = new Date();
    const weekStart = week ? new Date(week) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59);

    const items = await this.prisma.corporateOrderItem.findMany({
      where: {
        order: {
          created_at: { gte: weekStart, lte: weekEnd },
          status: { not: 'cancelled' },
        },
      },
      include: {
        meal_recipe: { select: { display_name: true, category: true, dietary_tags: true, meal_code: true } },
      },
    });

    // Aggregate by meal
    const byMeal: Record<string, { qty: number; diet: string; dish: string; sku: string }> = {};
    for (const item of items) {
      const key = item.meal_recipe_id ?? item.meal_name;
      if (!byMeal[key]) {
        byMeal[key] = {
          qty: 0,
          diet: item.meal_recipe?.dietary_tags?.join(', ') ?? '',
          dish: item.meal_recipe?.display_name ?? item.meal_name,
          sku: item.meal_recipe?.meal_code ?? item.meal_external_id ?? '',
        };
      }
      byMeal[key].qty += item.quantity;
    }

    return {
      ok: true,
      week_start: weekStart.toISOString(),
      rows: Object.values(byMeal).sort((a, b) => a.dish.localeCompare(b.dish)),
    };
  }

  /** Production report for a week */
  async getProductionReport(week?: string) {
    // Same as picklist but could include additional production-specific data
    return this.getPicklistReport(week);
  }

  /** Publish or unpublish the current production plan to corporate portal */
  async setPublishedToCorporate(plan_id: string, published: boolean) {
    const plan = await this.prisma.productionPlan.update({
      where: { id: plan_id },
      data:  { published_to_corporate: published },
    });
    return { ok: true, plan_id: plan.id, published_to_corporate: plan.published_to_corporate };
  }

  /** Resend magic login link for a specific employee */
  async resendMagicLink(employee_id: string, company_id: string) {
    const emp = await this.prisma.corporateEmployee.findFirst({
      where: { id: employee_id, company_id },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    if (!emp.email) return { ok: false, message: 'Employee has no email address' };

    // Generate token
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await this.prisma.corporateMagicToken.create({
      data: {
        token,
        employee_id: emp.id,
        email: emp.email,
        company_id,
        expires_at: expires,
      },
    });

    const baseUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const link = `${baseUrl}/corporate/verify?token=${token}`;

    // Send email
    const smtpEmail = this.config.get<string>('SMTP_EMAIL');
    const smtpPassword = this.config.get<string>('SMTP_PASSWORD');
    if (!smtpEmail || !smtpPassword) {
      this.logger.warn(`[MAGIC LINK] SMTP not configured — link for ${emp.email}: ${link}`);
      return { ok: true, message: 'Magic link generated (SMTP not configured — check server logs)', dev_link: link };
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: smtpEmail, pass: smtpPassword },
    });

    const company = await this.prisma.corporateCompany.findUnique({ where: { id: company_id } });
    await transporter.sendMail({
      from: `BetterDay Meals <${smtpEmail}>`,
      to: emp.email,
      subject: `Your login link — ${company?.name ?? 'BetterDay'}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <div style="background:#00465e;padding:24px 30px;border-radius:12px 12px 0 0">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:700">BetterDay Meals</p>
          <p style="margin:4px 0 0;color:#a3c8d8;font-size:13px">${company?.name ?? ''} Employee Portal</p>
        </div>
        <div style="background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <p style="margin:0 0 12px;color:#222;font-size:15px">Hi ${emp.name},</p>
          <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6">
            Click the button below to sign in to your meal portal. This link expires in 15 minutes.
          </p>
          <a href="${link}" style="display:inline-block;background:#00465e;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px">
            Sign In →
          </a>
          <p style="margin:20px 0 0;color:#999;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
        </div>
      </div>`,
    });

    this.logger.log(`[MAGIC LINK] Sent login link to ${emp.email}`);
    return { ok: true, message: `Login link sent to ${emp.email}` };
  }

  /** Send order reminder emails to all active employees who haven't ordered this week */
  async sendOrderReminders(company_id: string) {
    const company = await this.prisma.corporateCompany.findUnique({ where: { id: company_id } });
    if (!company) throw new NotFoundException('Company not found');

    // Find employees who haven't ordered this week
    const now = new Date();
    const sun = new Date(now); sun.setDate(now.getDate() - now.getDay()); sun.setHours(0, 0, 0, 0);
    const sat = new Date(sun); sat.setDate(sun.getDate() + 7);

    const employees = await this.prisma.corporateEmployee.findMany({
      where: { company_id, is_active: true },
    });

    const ordersThisWeek = await this.prisma.corporateOrder.findMany({
      where: { company_id, created_at: { gte: sun, lt: sat } },
      select: { employee_id: true },
    });
    const orderedIds = new Set(ordersThisWeek.map(o => o.employee_id));
    const needReminder = employees.filter(e => !orderedIds.has(e.id));

    if (!needReminder.length) return { ok: true, sent: 0, message: 'All employees have already ordered this week!' };

    // Send emails
    const smtpEmail = this.config.get<string>('SMTP_EMAIL');
    const smtpPassword = this.config.get<string>('SMTP_PASSWORD');
    if (!smtpEmail || !smtpPassword) {
      return { ok: true, sent: 0, message: `SMTP not configured. ${needReminder.length} employees need reminders.` };
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: smtpEmail, pass: smtpPassword },
    });

    const baseUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    let sent = 0;

    for (const emp of needReminder) {
      try {
        await transporter.sendMail({
          from: `BetterDay Meals <${smtpEmail}>`,
          to: emp.email,
          subject: `Don't forget to order your meals this week — ${company.name}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
            <div style="background:#00465e;padding:24px 30px;border-radius:12px 12px 0 0">
              <p style="margin:0;color:#fff;font-size:20px;font-weight:700">BetterDay Meals</p>
              <p style="margin:4px 0 0;color:#a3c8d8;font-size:13px">${company.name} Employee Meals</p>
            </div>
            <div style="background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
              <p style="margin:0 0 12px;color:#222;font-size:15px">Hi ${emp.name},</p>
              <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6">
                This is a friendly reminder that you haven't placed your meal order for this week yet.
                Don't miss out on your meals!
              </p>
              <a href="${baseUrl}/corporate/login" style="display:inline-block;background:#00465e;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px">
                Order Now →
              </a>
              <p style="margin:20px 0 0;color:#999;font-size:12px">This is an automated reminder from BetterDay Meals.</p>
            </div>
          </div>`,
        });
        sent++;
      } catch (err) {
        this.logger.error(`[REMINDER] Failed to send to ${emp.email}: ${err}`);
      }
    }

    this.logger.log(`[REMINDERS] Sent ${sent}/${needReminder.length} reminders for ${company.name}`);
    return { ok: true, sent, total: needReminder.length, message: `Sent ${sent} reminder${sent !== 1 ? 's' : ''}` };
  }
}
