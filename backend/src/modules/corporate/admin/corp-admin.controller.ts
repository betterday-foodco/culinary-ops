import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
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

  // ── Employees (manager-scoped CRUD) ──────────────────────────────────────

  @Post('employees')
  createEmployee(@Request() req: { user: CorporateUser }, @Body() body: any) {
    return this.svc.createEmployeeAsManager(req.user.company_id, body);
  }

  @Patch('employees/:id')
  updateEmployee(
    @Request() req: { user: CorporateUser },
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.svc.updateEmployeeAsManager(req.user.company_id, id, body);
  }

  @Delete('employees/:id')
  deactivateEmployee(@Request() req: { user: CorporateUser }, @Param('id') id: string) {
    return this.svc.deactivateEmployee(req.user.company_id, id);
  }

  // ── Benefit Levels ───────────────────────────────────────────────────────

  @Get('benefit-levels')
  getBenefitLevels(@Request() req: { user: CorporateUser }) {
    return this.svc.getBenefitLevels(req.user.company_id);
  }

  @Put('benefit-levels')
  saveBenefitLevels(@Request() req: { user: CorporateUser }, @Body() body: { levels: any[] }) {
    return this.svc.saveBenefitLevels(req.user.company_id, body.levels);
  }

  @Delete('benefit-levels/:id')
  deleteBenefitLevel(
    @Request() req: { user: CorporateUser },
    @Param('id') id: string,
    @Query('reassign_to') reassign_to?: string,
  ) {
    return this.svc.deleteBenefitLevel(req.user.company_id, id, reassign_to);
  }

  @Patch('benefit-levels/:id/allowances')
  updateAllowances(
    @Request() req: { user: CorporateUser },
    @Param('id') id: string,
    @Body() body: { tier_config: any; changed_by?: string },
  ) {
    return this.svc.updateBenefitLevelAllowances(
      req.user.company_id,
      id,
      body.tier_config,
      body.changed_by || req.user.email,
    );
  }

  @Get('benefit-levels/:id/employee-count')
  getLevelEmployeeCount(@Request() req: { user: CorporateUser }, @Param('id') id: string) {
    return this.svc.getBenefitLevelEmployeeCount(req.user.company_id, id);
  }

  @Get('meal-change-log')
  getMealChangeLog(
    @Request() req: { user: CorporateUser },
    @Query('limit') limit?: string,
  ) {
    return this.svc.getMealChangeLog(req.user.company_id, limit ? parseInt(limit) : 50);
  }

  // ── Company self-service ─────────────────────────────────────────────────

  @Get('company')
  getCompany(@Request() req: { user: CorporateUser }) {
    return this.svc.getCompanyForManager(req.user.company_id);
  }

  @Patch('company')
  updateCompany(@Request() req: { user: CorporateUser }, @Body() body: any) {
    return this.svc.updateCompanyAsManager(req.user.company_id, body);
  }

  @Get('pin')
  getPin(@Request() req: { user: CorporateUser }) {
    return this.svc.getCompanyPinForManager(req.user.company_id);
  }

  @Patch('pin')
  updatePin(@Request() req: { user: CorporateUser }, @Body() body: { pin: string }) {
    return this.svc.updateCompanyPin(req.user.company_id, body.pin);
  }

  // ── Par Levels ───────────────────────────────────────────────────────────

  @Get('par-levels')
  getParLevels(@Request() req: { user: CorporateUser }) {
    return this.svc.getParLevels(req.user.company_id);
  }

  @Put('par-levels')
  saveParLevels(@Request() req: { user: CorporateUser }, @Body() body: { levels: any[] }) {
    return this.svc.saveParLevels(req.user.company_id, body.levels);
  }

  @Get('par-catalog')
  getParCatalog() {
    return this.svc.getParCatalog();
  }

  @Get('weekly-swaps')
  getWeeklySwaps() {
    return this.svc.getWeeklySwaps();
  }

  @Post('par-carts/rebuild')
  rebuildParCarts(@Request() req: { user: CorporateUser }) {
    return this.svc.rebuildParCarts(req.user.company_id);
  }

  @Post('par-orders/confirm')
  confirmParOrder(
    @Request() req: { user: CorporateUser },
    @Body() body: { items: Array<{ meal_id: string; quantity?: number }>; delivery_date?: string },
  ) {
    return this.svc.confirmParOrder(req.user.company_id, body.items, body.delivery_date);
  }

  // ── Reminders ────────────────────────────────────────────────────────────

  @Post('send-reminders')
  sendReminders(
    @Request() req: { user: CorporateUser },
    @Body() body: { since_days?: number },
  ) {
    return this.svc.sendOrderReminders(req.user.company_id, body?.since_days);
  }
}

// ── BD Admin routes — requires culinary admin JWT ────────────────────────────

@Controller('corp-admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class CorpBdAdminController {
  constructor(private readonly svc: CorpAdminService) {}

  @Get('companies')
  getAllCompanies() {
    return this.svc.getAllCompanies();
  }

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

  @Patch('plans/:id/publish-corporate')
  publishToCorporate(@Param('id') plan_id: string, @Body() body: { published: boolean }) {
    return this.svc.setPublishedToCorporate(plan_id, body.published);
  }

  @Get('companies/:id/employees')
  getCompanyEmployees(@Param('id') company_id: string) {
    return this.svc.getEmployees(company_id);
  }

  /** Get company dashboard from BD admin perspective */
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

  // ── Invoices (cross-company) ─────────────────────────────────────────────

  @Get('invoices')
  getAllInvoices(@Query('status') status?: string, @Query('company_id') company_id?: string) {
    return this.svc.getAllInvoices({ status, company_id });
  }

  @Patch('invoices/:id')
  updateInvoice(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateInvoice(id, body);
  }

  @Post('invoices/generate')
  generateInvoice(@Body() body: { company_id: string; period_start: string; period_end: string; notes?: string }) {
    return this.svc.generateInvoice(body.company_id, body.period_start, body.period_end, body.notes);
  }

  // ── Credit Notes ─────────────────────────────────────────────────────────

  @Post('credit-notes')
  createCreditNote(@Body() body: any) {
    return this.svc.createCreditNote(body);
  }

  @Get('credit-notes')
  getCreditNotes(@Query('company_id') company_id?: string) {
    return this.svc.getCreditNotes(company_id);
  }

  @Patch('credit-notes/:id/void')
  voidCreditNote(@Param('id') id: string) {
    return this.svc.voidCreditNote(id);
  }

  // ── AR Summary ───────────────────────────────────────────────────────────

  @Get('ar-summary')
  getArSummary() {
    return this.svc.getArSummary();
  }
}
