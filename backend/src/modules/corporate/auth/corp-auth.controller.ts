import { Controller, Post, Get, Body, Query, HttpCode } from '@nestjs/common';
import { IsString, IsEmail } from 'class-validator';
import { CorpAuthService } from './corp-auth.service';

class ManagerLoginDto {
  @IsString() company_id: string;
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
}
