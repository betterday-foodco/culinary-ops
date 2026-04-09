import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

import { CorpAuthService } from './auth/corp-auth.service';
import { CorpAuthController } from './auth/corp-auth.controller';

import { CorpPortalService } from './portal/corp-portal.service';
import { CorpPortalController } from './portal/corp-portal.controller';

import { CorpAdminService } from './admin/corp-admin.service';
import { CorpManagerController, CorpBdAdminController } from './admin/corp-admin.controller';
import { CorporateParSchedulerService } from './admin/corp-par-scheduler.service';

/**
 * CorporateModule
 *
 * Replaces Flask + Google Sheets (betterday-app) entirely.
 * All corporate routes are under this module.
 *
 * Route prefixes:
 *   /api/corp-auth/*     — login, magic links (no JWT required)
 *   /api/corp-portal/*   — employee + manager portal (corp_employee | corp_manager JWT)
 *   /api/corp-manager/*  — manager-only dashboard (corp_manager JWT)
 *   /api/corp-admin/*    — BD admin (culinary admin JWT)
 *
 * Role separation:
 *   - Culinary staff (admin/staff/kitchen) cannot access /api/corp-portal or /api/corp-manager
 *   - Corporate employees/managers cannot access ANY culinary routes
 *   - Enforced by RolesGuard on every controller
 */
@Module({
  imports: [PrismaModule, AuthModule],
  providers: [CorpAuthService, CorpPortalService, CorpAdminService, CorporateParSchedulerService],
  controllers: [
    CorpAuthController,
    CorpPortalController,
    CorpManagerController,
    CorpBdAdminController,
  ],
  exports: [CorpAdminService],
})
export class CorporateModule {}
