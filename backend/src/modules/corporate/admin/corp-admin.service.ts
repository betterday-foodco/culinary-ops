import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CorpAdminService {
  constructor(private prisma: PrismaService) {}

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
}
