import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { AdminCommerceCheckoutController } from './admin/admin-commerce-checkout.controller';
import { CommerceCheckoutController } from './commerce-checkout.controller';
import { CardExpiryWarningCron } from './crons/card-expiry-warning.cron';
import { DailyReconciliationCron } from './crons/daily-reconciliation.cron';
import { WeeklyChargeCron } from './crons/weekly-charge.cron';
import { HelcimApiClient } from './helcim/helcim-api-client';
import { HelcimService } from './helcim/helcim.service';
import { HelcimWebhookService } from './helcim/helcim-webhook.service';
import { HelcimCheckoutSessionRepository } from './helcim/helcim-checkout-session.repository';
import { DeclineClassifier } from './helcim/decline-classifier';
import { HmacVerifier } from './helcim/hmac-verifier';
import { OrderRefundRepository } from './helcim/order-refund.repository';
import { ReconciliationLogRepository } from './helcim/reconciliation-log.repository';
import { WebhookEventRepository } from './helcim/webhook-event.repository';
import { HelcimWebhookController } from './webhooks/helcim-webhook.controller';


/**
 * CommerceCheckoutModule — wires the Helcim payment integration into the
 * NestJS app. Owns everything under `commerce-checkout/`: the HelcimPay.js
 * customer-present card save flow, the weekly cutoff merchant-initiated
 * weekly charge cron, refunds, webhooks, and the daily reconciliation
 * cron.
 *
 * This module is the translation layer between:
 *   - Helcim's REST API (`api.helcim.com/v2/...`)
 *   - Our commerce Prisma schema (`backend/prisma/commerce/schema.prisma`)
 *   - The HelcimPay.js browser SDK (consumed by `conner/client-website/`)
 *
 * Scope boundaries (what this module DOES NOT do):
 *   - Kitchen operations — that's `production/`, `kitchen-portal/`, etc.
 *   - Customer profile / preferences — that's `commerce-customers/`
 *   - Coupon validation — that's `commerce-coupons/`
 *   - Cart composition — that's `commerce-cart/` (not yet built)
 *   - Meal catalog — that's `commerce-catalog/` (not yet built)
 *
 * Research + design:
 *   - conner/data-model/helcim-integration.md (1,430 lines)
 *   - conner/data-model/helcim-integration-plan.md (1,355 lines)
 *
 * Controllers, cron jobs, and the webhook handler are added in later
 * phases of the build plan. This file is the Phase 1.1 skeleton.
 *
 * PrismaModule is @Global() so CommercePrismaService is auto-available
 * to anything in this module without an explicit import.
 */
@Module({
  imports: [AuthModule], // For JwtAuthGuard on the admin controller
  controllers: [
    CommerceCheckoutController,
    AdminCommerceCheckoutController,
    HelcimWebhookController,
  ],
  providers: [
    HelcimApiClient,
    HelcimService,
    HelcimWebhookService,
    HelcimCheckoutSessionRepository,
    OrderRefundRepository,
    WebhookEventRepository,
    ReconciliationLogRepository,
    DeclineClassifier,
    HmacVerifier,
    WeeklyChargeCron,
    DailyReconciliationCron,
    CardExpiryWarningCron,
  ],
  exports: [HelcimService],
})
export class CommerceCheckoutModule {}
