import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsString, IsUUID } from 'class-validator';

import { CommercePrismaService } from '../../../prisma/commerce-prisma.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WeeklyChargeCron } from '../crons/weekly-charge.cron';
import { RefundOrderDto } from '../dto/refund-order.dto';
import { HelcimService } from '../helcim/helcim.service';
import { OrderRefundRepository } from '../helcim/order-refund.repository';

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
 * trigger for WeeklyChargeCron.processOne() that bypasses the weekly
 * schedule and charges a single WeeklyCartRecord immediately.
 *
 * This lets Conner test the Helcim card-on-file flow end-to-end without
 * waiting for the weekly cutoff or fiddling with the system clock.
 *
 * Research: conner/data-model/helcim-integration.md §5
 * Plan: conner/data-model/helcim-integration-plan.md §7 (manual trigger)
 */
@Controller('admin/commerce')
@UseGuards(JwtAuthGuard)
export class AdminCommerceCheckoutController {
  constructor(
    private readonly weeklyChargeCron: WeeklyChargeCron,
    private readonly helcim: HelcimService,
    private readonly refundRepo: OrderRefundRepository,
    private readonly commercePrisma: CommercePrismaService,
  ) {}

  /**
   * POST /api/admin/commerce/checkout/weekly-charge/run-once
   * Body: { weeklyCartRecordId: "<uuid>" }
   *
   * Triggers WeeklyChargeCron.processOne() for a single record. Returns
   * the ChargeResult (approved / declined / system_error) directly.
   *
   * Works even when the cron schedule itself is disabled (i.e. in dev).
   */
  @Post('checkout/weekly-charge/run-once')
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

  /**
   * POST /api/admin/commerce/orders/:orderId/refund
   * Body: RefundOrderDto { amount, reason, reasonNote? }
   *
   * Issues a full or partial refund against a CustomerOrder via Helcim.
   * Validates:
   *   - Order exists
   *   - Order has a processor_charge_id (otherwise never charged via Helcim)
   *   - Refund amount > 0
   *   - Refund amount ≤ (order.total - sum of prior refunds)
   *
   * On success:
   *   - Creates an OrderRefund row in our ledger
   *   - Updates CustomerOrder.status to 'refunded' (full) or
   *     'partially_refunded' (partial)
   *
   * NOTE: does NOT currently send a customer-facing refund email — that
   * wire-up happens alongside the email service in a later phase. The
   * admin sees the refund in the dashboard; the customer will see it in
   * their next bank statement.
   *
   * Auth: JwtAuthGuard (existing staff JWT). The admin's username from
   * the authenticated request goes into initiated_by for audit.
   *
   * Research: conner/data-model/helcim-integration.md §8
   */
  @Post('orders/:orderId/refund')
  async refundOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: RefundOrderDto,
    @Req() req: Request,
  ): Promise<{
    orderId: string;
    refundId: string;
    newOrderStatus: 'refunded' | 'partially_refunded';
    result: unknown;
  }> {
    // 1. Load the order
    const order = await this.commercePrisma.customerOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (!order.processor_charge_id) {
      throw new UnprocessableEntityException(
        `Order ${orderId} has no processor_charge_id — was never charged via Helcim, cannot refund through this endpoint.`,
      );
    }

    // 2. Parse the Helcim transaction ID from the stringified field
    const originalTransactionId = Number(order.processor_charge_id);
    if (!Number.isFinite(originalTransactionId) || originalTransactionId <= 0) {
      throw new UnprocessableEntityException(
        `Order ${orderId} has an invalid processor_charge_id "${order.processor_charge_id}" — cannot parse as Helcim transaction ID.`,
      );
    }

    // 3. Validate the refund amount against the order total minus prior refunds
    const priorRefunded = await this.refundRepo.sumForOrder(orderId);
    const orderTotal = Number(order.total);
    const maxRefundable = orderTotal - priorRefunded;
    if (dto.amount > maxRefundable + 0.001) {
      throw new BadRequestException(
        `Refund amount $${dto.amount.toFixed(2)} exceeds remaining refundable $${maxRefundable.toFixed(2)} ` +
          `(order total $${orderTotal.toFixed(2)}, already refunded $${priorRefunded.toFixed(2)}).`,
      );
    }

    // 4. Build the idempotency key — format allows multiple refunds per order
    const idempotencyKey = this.buildRefundIdempotencyKey(order.display_id, priorRefunded);

    // 5. Resolve the admin IP address from the request
    const adminIpAddress = (req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0').slice(0, 45);

    // 6. Admin username for audit — read from the JWT-attached user object
    const adminUser = (req as unknown as { user?: { username?: string; id?: string } }).user;
    const initiatedBy = `admin:${adminUser?.username ?? adminUser?.id ?? 'unknown'}`;

    // 7. Call Helcim
    const result = await this.helcim.refundCharge({
      originalTransactionId,
      amount: dto.amount,
      adminIpAddress,
      idempotencyKey,
    });

    if (result.kind !== 'approved') {
      throw new BadRequestException({
        message: 'Helcim refund failed',
        result,
      });
    }

    // 8. Create the OrderRefund ledger row
    const refundRow = await this.refundRepo.createForOrder({
      orderId,
      processorRefundId: result.processorRefundId,
      amount: dto.amount,
      reason: dto.reason,
      reasonNote: dto.reasonNote ?? null,
      initiatedBy,
    });

    // 9. Update CustomerOrder.status based on total refunded including this one
    const newTotalRefunded = priorRefunded + dto.amount;
    const isFullRefund = newTotalRefunded >= orderTotal - 0.001;
    const newStatus: 'refunded' | 'partially_refunded' = isFullRefund
      ? 'refunded'
      : 'partially_refunded';

    await this.commercePrisma.customerOrder.update({
      where: { id: orderId },
      data: { status: newStatus },
    });

    return {
      orderId,
      refundId: refundRow.id,
      newOrderStatus: newStatus,
      result,
    };
  }

  /**
   * Build an idempotency key for a refund. Format:
   *   refund-<display_id>-<prior_refund_count>
   *
   * Using prior_refund_count (int) instead of a timestamp means multiple
   * refund attempts against the same remaining amount will collide with
   * Helcim's 5-minute idempotency cache and return the first result —
   * preventing double-refunds from accidental double-clicks in the admin UI.
   */
  private buildRefundIdempotencyKey(displayId: string, priorRefunded: number): string {
    // Use cents of prior refunded to make the count deterministic
    const priorCents = Math.round(priorRefunded * 100);
    const key = `refund-${displayId}-${priorCents}`;
    // Pad if shorter than Helcim's 25-char floor
    if (key.length < 25) return key.padEnd(25, '0');
    if (key.length > 36) {
      throw new Error(`Refund idempotency key exceeds 36 chars: ${key}`);
    }
    return key;
  }
}
