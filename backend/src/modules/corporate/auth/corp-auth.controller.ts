import { Controller, Post, Get, Body, Query, Param, HttpCode } from '@nestjs/common';
import { IsString, IsEmail, IsOptional } from 'class-validator';
import { CorpAuthService } from './corp-auth.service';

class ManagerLoginDto {
  @IsString() company_id: string;
  @IsString() pin: string;
}

class EmployeePinLoginDto {
  @IsString() company_id: string;
  @IsEmail()  email: string;
  @IsString() pin: string;
}

class MagicLinkRequestDto {
  @IsEmail()  email: string;
  @IsString() company_id: string;
}

@Controller('corp-auth')
export class CorpAuthController {
  constructor(private readonly svc: CorpAuthService) {}

  /**
   * POST /api/corp-auth/manager-login
   * Body: { company_id: "DEMO", pin: "2026" }
   * Returns: { access_token, user }
   */
  @Post('manager-login')
  @HttpCode(200)
  managerLogin(@Body() dto: ManagerLoginDto) {
    return this.svc.managerLogin(dto.company_id, dto.pin);
  }

  /**
   * POST /api/corp-auth/employee-pin-login
   * Body: { company_id: "DEMO", email: "john@acme.com", pin: "1234" }
   * Returns: { access_token, user }
   */
  @Post('employee-pin-login')
  @HttpCode(200)
  employeePinLogin(@Body() dto: EmployeePinLoginDto) {
    return this.svc.employeePinLogin(dto.company_id, dto.email, dto.pin);
  }

  /**
   * POST /api/corp-auth/magic-link
   * Body: { email: "conner@eatbetterday.ca", company_id: "DEMO" }
   * Returns: { ok: true, message }
   * Always returns 200 — never reveals whether email exists.
   */
  @Post('magic-link')
  @HttpCode(200)
  requestMagicLink(@Body() dto: MagicLinkRequestDto) {
    return this.svc.requestMagicLink(dto.email, dto.company_id);
  }

  /**
   * GET /api/corp-auth/verify?token=<hex>
   * Returns: { access_token, user }
   * Frontend calls this after user clicks the email link.
   */
  @Get('verify')
  verifyToken(@Query('token') token: string) {
    return this.svc.verifyMagicToken(token);
  }

  @Get('company/:id')
  getCompany(@Param('id') id: string) {
    return this.svc.getCompanyPublic(id);
  }

  @Post('register-employee')
  @HttpCode(200)
  registerEmployee(@Body() body: { company_id: string; name: string; email: string; pin?: string; company_pin?: string }) {
    return this.svc.registerEmployee(body.company_id, body.name, body.email, body.pin);
  }
}
