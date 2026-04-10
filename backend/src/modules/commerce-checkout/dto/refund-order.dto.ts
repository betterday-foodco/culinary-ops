import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { RefundReason } from '@prisma/commerce-client';

/**
 * POST /api/admin/commerce/orders/:orderId/refund body shape.
 *
 * Research: conner/data-model/helcim-integration.md §8
 */
export class RefundOrderDto {
  /**
   * Refund amount in dollars. Must be > 0 and ≤ (order.total - already_refunded).
   * The controller validates the cap against the order and prior refunds.
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  /**
   * Categorization — feeds the RefundReason enum. Admin picks from the
   * dropdown in the UI. The `dispute` value is reserved for the
   * reconciliation cron — admins shouldn't normally select it manually.
   */
  @IsEnum(RefundReason)
  reason!: RefundReason;

  /**
   * Optional free-text note — shown in the admin history view and in
   * audit logs for dispute defense.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonNote?: string;
}
