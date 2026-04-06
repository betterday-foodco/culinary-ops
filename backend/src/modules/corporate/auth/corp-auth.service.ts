import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Resend } from 'resend';

@Injectable()
export class CorpAuthService {
  private readonly logger = new Logger(CorpAuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  // ── Manager PIN login ──────────────────────────────────────────────────────

  async managerLogin(company_id: string, pin: string) {
    const company = await this.prisma.corporateCompany.findUnique({
      where: { id: company_id.toUpperCase() },
    });
    if (!company || !company.is_active) {
      throw new UnauthorizedException('Invalid company or inactive account');
    }

    const pinRecord = await this.prisma.corporateCompanyPIN.findUnique({
      where: { company_id: company.id },
    });
    if (!pinRecord) throw new UnauthorizedException('Manager PIN not configured');

    // Support both bcrypt hashes and plain: prefixed (legacy migration)
    const isValid = await this.verifyPin(pin, pinRecord.pin_hash, company.id);
    if (!isValid) throw new UnauthorizedException('Incorrect PIN');

    return this.signManagerToken(company.id, company.name);
  }

  private async verifyPin(plainPin: string, storedHash: string, company_id: string): Promise<boolean> {
    if (storedHash.startsWith('plain:')) {
      const plain = storedHash.slice(6);
      const match = plain === plainPin;
      if (match) {
        // Upgrade to bcrypt on first successful login
        const hashed = await bcrypt.hash(plainPin, 12);
        await this.prisma.corporateCompanyPIN.update({
          where: { company_id },
          data:  { pin_hash: hashed },
        });
      }
      return match;
    }
    return bcrypt.compare(plainPin, storedHash);
  }

  // ── Employee magic-link flow ───────────────────────────────────────────────

  async requestMagicLink(email: string, company_id: string) {
    const normalEmail = email.trim().toLowerCase();
    const company = await this.prisma.corporateCompany.findUnique({
      where: { id: company_id.toUpperCase() },
    });
    if (!company || !company.is_active) throw new NotFoundException('Company not found');

    const employee = await this.prisma.corporateEmployee.findFirst({
      where: { email: normalEmail, company_id: company.id, is_active: true },
    });
    if (!employee) {
      // Return 200 regardless — don't leak whether email exists
      this.logger.warn(`Magic link requested for unknown email: ${normalEmail} @ ${company_id}`);
      return { ok: true, message: 'If that email is registered, a link has been sent.' };
    }

    // Expire any existing unused tokens for this employee
    await this.prisma.corporateMagicToken.updateMany({
      where: { employee_id: employee.id, is_used: false },
      data:  { is_used: true },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await this.prisma.corporateMagicToken.create({
      data: {
        token,
        email: normalEmail,
        company_id: company.id,
        expires_at,
        employee: { connect: { id: employee.id } },
      },
    });

    const baseUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const link = `${baseUrl}/corporate/verify?token=${token}`;

    this.logger.log(`[MAGIC LINK] ${employee.name} <${normalEmail}>: ${link}`);
    await this.sendMagicLinkEmail(normalEmail, employee.name, link, company.name);

    // In development: return the token directly so the frontend can redirect
    // without needing a real email service configured yet.
    const isDev = (this.config.get<string>('NODE_ENV') ?? 'development') !== 'production';
    return {
      ok: true,
      message: 'If that email is registered, a link has been sent.',
      ...(isDev ? { dev_token: token, dev_link: link } : {}),
    };
  }

  async verifyMagicToken(token: string) {
    const record = await this.prisma.corporateMagicToken.findUnique({
      where: { token },
      include: { employee: true },
    });

    if (!record) throw new UnauthorizedException('Invalid or expired link');
    if (record.is_used) throw new UnauthorizedException('This link has already been used');
    if (record.expires_at < new Date()) throw new UnauthorizedException('Link has expired — request a new one');
    if (!record.employee || !record.employee.is_active) {
      throw new UnauthorizedException('Employee account is inactive');
    }

    await this.prisma.corporateMagicToken.update({
      where: { token },
      data:  { is_used: true },
    });

    return this.signEmployeeToken(record.employee);
  }

  // ── JWT helpers ────────────────────────────────────────────────────────────

  private signManagerToken(company_id: string, company_name: string) {
    const payload = {
      sub:        company_id,
      email:      `manager@${company_id.toLowerCase()}.corp`,
      type:       'corporate',
      role:       'corp_manager',
      company_id,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id:         company_id,
        role:       'corp_manager',
        company_id,
        name:       company_name,
        type:       'corporate',
      },
    };
  }

  private signEmployeeToken(emp: { id: string; email: string; name: string; company_id: string; employee_code: string }) {
    const payload = {
      sub:           emp.id,
      email:         emp.email,
      type:          'corporate',
      role:          'corp_employee',
      company_id:    emp.company_id,
      employee_code: emp.employee_code,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id:            emp.id,
        email:         emp.email,
        role:          'corp_employee',
        company_id:    emp.company_id,
        name:          emp.name,
        employee_code: emp.employee_code,
        type:          'corporate',
      },
    };
  }

  // ── Email sending via Resend ───────────────────────────────────────────────

  private async sendMagicLinkEmail(
    to: string,
    name: string,
    link: string,
    company_name: string,
  ) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('[EMAIL] RESEND_API_KEY not set — skipping email send (dev mode)');
      return;
    }

    const fromDomain = this.config.get<string>('RESEND_FROM_EMAIL') ?? 'noreply@betterday.com.au';
    const resend = new Resend(apiKey);

    try {
      const { error } = await resend.emails.send({
        from:    `BetterDay Meals <${fromDomain}>`,
        to:      [to],
        subject: `Your ${company_name} meal portal login link`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:40px 0">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr><td style="background:#00465e;padding:32px 40px">
          <p style="margin:0;color:#fff;font-size:22px;font-weight:700">BetterDay Meals</p>
          <p style="margin:6px 0 0;color:#a3c8d8;font-size:14px">${company_name} Employee Portal</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px">
          <p style="margin:0 0 16px;color:#222;font-size:16px">Hi ${name},</p>
          <p style="margin:0 0 28px;color:#555;font-size:15px;line-height:1.6">
            Click the button below to sign in to your ${company_name} meal ordering portal.
            This link expires in <strong>15 minutes</strong>.
          </p>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${link}" style="display:inline-block;background:#00465e;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px">
              Sign in to ${company_name} Portal →
            </a>
          </td></tr></table>
          <p style="margin:28px 0 0;color:#999;font-size:13px">
            If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f5f5f5;padding:20px 40px;border-top:1px solid #e8e8e8">
          <p style="margin:0;color:#aaa;font-size:12px">
            © ${new Date().getFullYear()} BetterDay Meals · This is an automated email, please do not reply.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });

      if (error) {
        this.logger.error(`[EMAIL] Resend error: ${JSON.stringify(error)}`);
      } else {
        this.logger.log(`[EMAIL] Magic link sent to ${to} via Resend`);
      }
    } catch (err) {
      // Don't fail the request if email fails — token was already saved
      this.logger.error(`[EMAIL] Resend send failed: ${String(err)}`);
    }
  }
}
