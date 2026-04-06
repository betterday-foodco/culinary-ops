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

    // In dev: log link. In production: send email (pluggable email service)
    this.logger.log(`[MAGIC LINK] ${employee.name} <${normalEmail}>: ${link}`);
    await this.sendMagicLinkEmail(normalEmail, employee.name, link, company.name);

    return { ok: true, message: 'If that email is registered, a link has been sent.' };
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

  // ── Email sending (pluggable) ──────────────────────────────────────────────

  private async sendMagicLinkEmail(
    to: string,
    name: string,
    link: string,
    company_name: string,
  ) {
    // TODO Phase 3: wire up Resend / SendGrid / Nodemailer
    // For now: just log. In dev the link is logged above.
    this.logger.log(`[EMAIL] To: ${to} | Subject: Your BetterDay login link | Body: Hi ${name}, click ${link}`);
  }
}
