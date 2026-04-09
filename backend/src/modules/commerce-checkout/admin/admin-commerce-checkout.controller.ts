import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsUUID } from 'class-validator';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WeeklyChargeCron } from '../crons/weekly-charge.cron';

/**
 * DTO for the manual weekly-charge trigger.
 */
export class RunOnceDto {
  @IsString()
  @IsUUID()
  weeklyCartRecordId!: string;
}

/**
 * Admin endpoints for the commerce-checkout module.
 *
 * Route prefix: /api/admin/commerce/checkout
 * Auth: existing staff JwtAuthGuard (Gurleen + Conner). The same guard
 *   that protects culinary admin routes; no new auth concept introduced.
 *
 * Currently exposes a single endpoint for dev + sandbox testing: a manual
 * trigger for WeeklyChargeCron.processOne() that bypasses the Thursday
 * schedule and charges a single WeeklyCartRecord immediately.
 *
 * This lets Conner test the Helcim card-on-file flow end-to-end without
 * waiting for Thursday 8 PM or fiddling with the system clock.
 *
 * Research: conner/data-model/helcim-integration.md §5
 * Plan: conner/data-model/helcim-integration-plan.md §7 (manual trigger)
 */
@Controller('admin/commerce/checkout')
@UseGuards(JwtAuthGuard)
export class AdminCommerceCheckoutController {
  constructor(private readonly weeklyChargeCron: WeeklyChargeCron) {}

  /**
   * POST /api/admin/commerce/checkout/weekly-charge/run-once
   * Body: { weeklyCartRecordId: "<uuid>" }
   *
   * Triggers WeeklyChargeCron.processOne() for a single record. Returns
   * the ChargeResult (approved / declined / system_error) directly.
   *
   * Works even when the cron schedule itself is disabled (i.e. in dev).
   */
  @Post('weekly-charge/run-once')
  async runWeeklyChargeOnce(@Body() dto: RunOnceDto): Promise<{
    recordId: string;
    result: unknown;
  }> {
    const result = await this.weeklyChargeCron.processOne(dto.weeklyCartRecordId);
    if (!result) {
      throw new BadRequestException(
        'processOne returned null — check server logs. Likely: record not found, ' +
          'already processed, customer lacks helcim_customer_id, or default_payment missing.',
      );
    }
    return {
      recordId: dto.weeklyCartRecordId,
      result,
    };
  }
}
