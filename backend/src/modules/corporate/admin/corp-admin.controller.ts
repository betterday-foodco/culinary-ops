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
}
