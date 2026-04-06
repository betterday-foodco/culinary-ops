import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface CulinaryUser {
  id: string;
  email: string;
  role: string;         // 'admin' | 'staff' | 'kitchen'
  name: string | null;
  station: string | null;
  type: 'culinary';
}

export interface CorporateUser {
  id: string;           // CorporateEmployee.id OR CorporateCompany.id (manager sessions)
  email: string;
  role: 'corp_employee' | 'corp_manager';
  company_id: string;
  name: string | null;
  type: 'corporate';
}

export type AuthenticatedUser = CulinaryUser | CorporateUser;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any): Promise<AuthenticatedUser> {
    // ── Corporate user (employee or manager) ──────────────────────────────
    if (payload.type === 'corporate') {
      if (payload.role === 'corp_manager') {
        // Manager session: sub = company_id (no individual employee record)
        const company = await this.prisma.corporateCompany.findUnique({
          where: { id: payload.sub },
        });
        if (!company || !company.is_active) throw new UnauthorizedException();
        return {
          id: company.id,
          email: payload.email ?? '',
          role: 'corp_manager',
          company_id: company.id,
          name: company.contact_name,
          type: 'corporate',
        };
      }

      // Employee session: sub = CorporateEmployee.id
      const emp = await this.prisma.corporateEmployee.findUnique({
        where: { id: payload.sub },
      });
      if (!emp || !emp.is_active) throw new UnauthorizedException();
      return {
        id: emp.id,
        email: emp.email,
        role: 'corp_employee',
        company_id: emp.company_id,
        name: emp.name,
        type: 'corporate',
      };
    }

    // ── Culinary / admin user ────────────────────────────────────────────
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      station: user.station,
      type: 'culinary',
    };
  }
}
