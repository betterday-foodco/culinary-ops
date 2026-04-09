import { Injectable } from '@nestjs/common';
import type { OrderRefund, RefundReason } from '@prisma/commerce-client';

import { CommercePrismaService } from '../../../prisma/commerce-prisma.service';

/**
 * OrderRefundRepository — persistence layer for the OrderRefund ledger.
 *
 * A single CustomerOrder can have multiple OrderRefund rows (for partial
 * refunds) summing up to at most the original order total. This
 * repository enforces nothing on its own — the caller (HelcimService
 * and the admin controller) is responsible for validating amounts
 * against the order total minus prior refunds.
 *
 * Research: conner/data-model/helcim-integration.md §8 + §13
 */
@Injectable()
export class OrderRefundRepository {
  constructor(private readonly commercePrisma: CommercePrismaService) {}

  /**
   * Create an OrderRefund row after a successful Helcim refund call.
   * The `initiated_at` timestamp is set to now() via the schema default;
   * `completed_at` is set now as well because at this point the Helcim
   * call has already returned successfully.
   */
  async createForOrder(args: {
    orderId: string;
    processorRefundId: string;
    amount: number;
    reason: RefundReason;
    reasonNote?: string | null;
    initiatedBy: string;
  }): Promise<OrderRefund> {
    return this.commercePrisma.orderRefund.create({
      data: {
        order_id: args.orderId,
        processor_refund_id: args.processorRefundId,
        amount: args.amount,
        reason: args.reason,
        reason_note: args.reasonNote ?? null,
        initiated_by: args.initiatedBy,
        completed_at: new Date(),
      },
    });
  }

  /**
   * Sum all refund amounts for a given order. Used to validate partial
   * refund requests — the new refund amount must be ≤ (order.total - sumForOrder).
   */
  async sumForOrder(orderId: string): Promise<number> {
    const result = await this.commercePrisma.orderRefund.aggregate({
      where: { order_id: orderId },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  }

  /**
   * List all refunds against an order, newest first. Used by admin UI
   * and the refund history view.
   */
  async listForOrder(orderId: string): Promise<OrderRefund[]> {
    return this.commercePrisma.orderRefund.findMany({
      where: { order_id: orderId },
      orderBy: { initiated_at: 'desc' },
    });
  }
}
