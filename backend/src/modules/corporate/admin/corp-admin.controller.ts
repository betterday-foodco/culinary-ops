import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CorpAdminService } from './corp-admin.service';
import { CorporateUser, CulinaryUser } from '../../auth/jwt.strategy';

type AnyUser = CorporateUser | CulinaryUser;

// ── Manager routes — requires corp_manager JWT ──────────────────────────────

@Controller('corp-manager')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('corp_manager')
export class CorpManagerController {
  constructor(private readonly svc: CorpAdminService) {}

  @Get('dashboard')
  getDashboard(@Request() req: { user: CorporateUser }) {
    return this.svc.getCompanyDashboard(req.user.company_id);
  }

  @Get('employees')
  getEmployees(@Request() req: { user: CorporateUser }) {
    return this.svc.getEmployees(req.user.company_id);
  }

  @Get('orders')
  getOrders(@Request() req: { user: CorporateUser }, @Query('limit') limit?: string) {
    return this.svc.getOrders(req.user.company_id, limit ? parseInt(limit) : 100);
  }

  @Get('invoices')
  getInvoices(@Request() req: { user: CorporateUser }) {
    return this.svc.getInvoices(req.user.company_id);
  }

  @Get('invoices/:id')
  getInvoiceDetail(@Param('id') id: string) {
    return this.svc.getInvoiceDetail(id);
  }

  @Get('monthly-report')
  getMonthlyReport(@Request() req: { user: CorporateUser }, @Query('month') month?: string) {
    return this.svc.getMonthlyReport(req.user.company_id, month);
  }

  @Get('par-levels')
  getParLevels(@Request() req: { user: CorporateUser }) {
    return this.svc.getParLevels(req.user.company_id);
  }

  @Get('benefit-levels')
  getBenefitLevels(@Request() req: { user: CorporateUser }) {
    return this.svc.getBenefitLevels(req.user.company_id);
  }

  @Get('account')
  getAccount(@Request() req: { user: CorporateUser }) {
    return this.svc.getCompanyAccount(req.user.company_id);
  }

  @Patch('account')
  updateAccount(@Request() req: { user: CorporateUser }, @Body() body: any) {
    return this.svc.updateCompanyAccount(req.user.company_id, body);
  }

  @Post('employees/bulk-action')
  bulkEmployeeAction(
    @Request() req: { user: CorporateUser },
    @Body() body: { action: string; employee_ids: string[]; params?: any },
  ) {
    return this.svc.bulkEmployeeAction(req.user.company_id, body.action, body.employee_ids, body.params);
  }

  @Patch('employees/:id/pin')
  setEmployeePin(
    @Request() req: { user: CorporateUser },
    @Param('id') employee_id: string,
    @Body() body: { pin: string },
  ) {
    return this.svc.setEmployeePin(employee_id, body.pin, req.user.company_id);
  }

  @Patch('employees/:id')
  updateEmployee(
    @Request() req: { user: CorporateUser },
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.svc.updateEmployee(id, body, req.user.company_id);
  }

  @Post('employees/:id/resend-link')
  resendMagicLink(@Request() req: { user: CorporateUser }, @Param('id') id: string) {
    return this.svc.resendMagicLink(id, req.user.company_id);
  }

  @Post('employees/:id/deactivate')
  deactivateEmployee(@Request() req: { user: CorporateUser }, @Param('id') id: string) {
    return this.svc.deactivateEmployee(id, req.user.company_id);
  }

  @Patch('benefit-levels/:id')
  updateBenefitLevel(@Request() req: { user: CorporateUser }, @Param('id') id: string, @Body() body: any) {
    return this.svc.updateBenefitLevel(id, body, req.user.company_id);
  }

  @Post('par-levels')
  saveParLevels(@Request() req: { user: CorporateUser }, @Body() body: { levels: any[] }) {
    return this.svc.upsertParLevels(req.user.company_id, body.levels);
  }

  @Patch('pin')
  updateManagerPin(@Request() req: { user: CorporateUser }, @Body() body: { pin: string }) {
    return this.svc.updateCompanyPin(req.user.company_id, body.pin);
  }

  @Post('send-reminders')
  sendReminders(@Request() req: { user: CorporateUser }) {
    return this.svc.sendOrderReminders(req.user.company_id);
  }
}

// ── BD Admin routes — requires culinary admin JWT ────────────────────────────

@Controller('corp-admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class CorpBdAdminController {
  constructor(private readonly svc: CorpAdminService) {}

  // ── Global endpoints ──────────────────────────────────────────────────────

  @Get('overview')
  getOverview() {
    return this.svc.getGlobalOverview();
  }

  @Get('companies')
  getAllCompanies() {
    return this.svc.getAllCompanies();
  }

  @Get('invoices')
  getAllInvoices(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.svc.getAllInvoices(page ? parseInt(page) : 1, limit ? parseInt(limit) : 50);
  }

  @Get('invoices/:id')
  getInvoiceDetail(@Param('id') id: string) {
    return this.svc.getInvoiceDetail(id);
  }

  @Patch('invoices/:id/status')
  markInvoice(@Param('id') id: string, @Body() body: { status: string }) {
    return this.svc.markInvoiceStatus(id, body.status);
  }

  @Post('credit-notes')
  createCreditNote(@Body() body: { company_id: string; employee_id?: string; amount: number; reason?: string }) {
    return this.svc.createCreditNote(body);
  }

  @Get('ar-summary')
  getArSummary() {
    return this.svc.getArSummary();
  }

  @Get('orders')
  getAllOrders(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.svc.getAllOrders(page ? parseInt(page) : 1, limit ? parseInt(limit) : 50);
  }

  // ── Company CRUD ──────────────────────────────────────────────────────────

  @Post('companies')
  upsertCompany(@Body() body: any) {
    return this.svc.upsertCompany(body);
  }

  @Post('employees')
  upsertEmployee(@Body() body: any) {
    return this.svc.upsertEmployee(body);
  }

  @Patch('companies/:id/pin')
  updatePin(@Param('id') company_id: string, @Body() body: { pin: string }) {
    return this.svc.updateCompanyPin(company_id, body.pin);
  }

  @Patch('employees/:id/pin')
  setEmployeePin(@Param('id') employee_id: string, @Body() body: { pin: string }) {
    return this.svc.setEmployeePin(employee_id, body.pin);
  }

  @Patch('plans/:id/publish-corporate')
  publishToCorporate(@Param('id') plan_id: string, @Body() body: { published: boolean }) {
    return this.svc.setPublishedToCorporate(plan_id, body.published);
  }

  // ── Company detail ────────────────────────────────────────────────────────

  @Get('companies/:id')
  getCompanyDetail(@Param('id') company_id: string) {
    return this.svc.getCompanyDetail(company_id);
  }

  @Patch('companies/:id')
  updateCompany(@Param('id') company_id: string, @Body() body: any) {
    return this.svc.updateCompanyFull(company_id, body);
  }

  @Get('companies/:id/employees')
  getCompanyEmployees(@Param('id') company_id: string) {
    return this.svc.getEmployees(company_id);
  }

  @Get('companies/:id/dashboard')
  getCompanyDashboard(@Param('id') company_id: string) {
    return this.svc.getCompanyDashboard(company_id);
  }

  @Get('companies/:id/orders')
  getCompanyOrders(@Param('id') company_id: string, @Query('limit') limit?: string) {
    return this.svc.getOrders(company_id, limit ? parseInt(limit) : 100);
  }

  @Get('companies/:id/invoices')
  getCompanyInvoices(@Param('id') company_id: string) {
    return this.svc.getInvoices(company_id);
  }

  @Get('companies/:id/benefit-levels')
  getCompanyBenefitLevels(@Param('id') company_id: string) {
    return this.svc.getBenefitLevels(company_id);
  }

  @Post('companies/:id/benefit-levels')
  upsertBenefitLevels(@Param('id') company_id: string, @Body() body: { levels: any[] }) {
    return this.svc.upsertBenefitLevels(company_id, body.levels);
  }

  @Get('companies/:id/par-levels')
  getCompanyParLevels(@Param('id') company_id: string) {
    return this.svc.getParLevels(company_id);
  }

  @Post('companies/:id/par-levels')
  upsertParLevels(@Param('id') company_id: string, @Body() body: { levels: any[] }) {
    return this.svc.upsertParLevels(company_id, body.levels);
  }

  // ── Corporate Reports ─────────────────────────────────────────────────────

  @Get('reports/delivery')
  getDeliveryReport(@Query('week') week?: string) {
    return this.svc.getDeliveryReport(week);
  }

  @Get('reports/labels')
  getLabelsReport(@Query('week') week?: string) {
    return this.svc.getLabelsReport(week);
  }

  @Get('reports/picklists')
  getPicklistReport(@Query('week') week?: string) {
    return this.svc.getPicklistReport(week);
  }

  @Get('reports/production')
  getProductionReport(@Query('week') week?: string) {
    return this.svc.getProductionReport(week);
  }
}
