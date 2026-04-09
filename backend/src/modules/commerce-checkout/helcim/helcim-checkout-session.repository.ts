import { Injectable } from '@nestjs/common';
import type { HelcimCheckoutSession } from '@prisma/commerce-client';

import { CommercePrismaService } from '../../../prisma/commerce-prisma.service';

/**
 * HelcimCheckoutSessionRepository — persistence layer for in-flight
 * HelcimPay.js checkout sessions.
 *
 * Replaces betterday-app's in-memory dict pattern so our checkout flow
 * survives backend restarts and works across multiple Render dynos.
 * Each row represents a `POST /v2/helcim-pay/initialize` call whose
 * result hasn't been confirmed yet.
 *
 * Research: conner/data-model/helcim-integration.md §4
 */
@Injectable()
export class HelcimCheckoutSessionRepository {
  private static readonly TTL_MINUTES = 60;

  constructor(private readonly commercePrisma: CommercePrismaService) {}

  /**
   * Create a new checkout session. Called by HelcimService.initCheckout
   * after a successful /helcim-pay/initialize response.
   *
   * @param args.checkoutToken — the id from Helcim (acts as primary key)
   * @param args.secretToken   — stays server-side, used for optional hash verification
   */
  async create(args: {
    checkoutToken: string;
    secretToken: string;
    customerId: string | null;
    paymentType: 'purchase' | 'verify' | 'preauth';
    amount: number;
    currency?: string;
  }): Promise<HelcimCheckoutSession> {
    const expires_at = new Date(
      Date.now() + HelcimCheckoutSessionRepository.TTL_MINUTES * 60 * 1000,
    );
    return this.commercePrisma.helcimCheckoutSession.create({
      data: {
        id: args.checkoutToken,
        secret_token: args.secretToken,
        customer_id: args.customerId,
        payment_type: args.paymentType,
        amount: args.amount,
        currency: args.currency ?? 'CAD',
        expires_at,
      },
    });
  }

  /**
   * Look up a session by its checkoutToken. Returns null if not found.
   * Used by the confirm endpoint to retrieve the secretToken + metadata
   * before validating the browser's postMessage payload.
   */
  async findByToken(checkoutToken: string): Promise<HelcimCheckoutSession | null> {
    return this.commercePrisma.helcimCheckoutSession.findUnique({
      where: { id: checkoutToken },
    });
  }

  /**
   * Mark a session as confirmed and link it to the resulting order.
   * Idempotent: calling twice with the same checkoutToken + orderId
   * is a no-op.
   */
  async markConfirmed(args: {
    checkoutToken: string;
    orderId: string | null;
  }): Promise<HelcimCheckoutSession> {
    return this.commercePrisma.helcimCheckoutSession.update({
      where: { id: args.checkoutToken },
      data: {
        confirmed_at: new Date(),
        confirmed_order_id: args.orderId,
      },
    });
  }

  /**
   * Delete sessions that expired more than `keepForDays` days ago.
   * Called by the daily cleanup cron. We keep expired sessions for a
   * few days as audit trail for debugging before purging.
   */
  async deleteExpired(keepForDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - keepForDays * 24 * 60 * 60 * 1000);
    const result = await this.commercePrisma.helcimCheckoutSession.deleteMany({
      where: { expires_at: { lt: cutoff } },
    });
    return result.count;
  }

  /**
   * Check whether a session is valid for confirmation. Returns a
   * reason code if invalid, null if valid. Pure function — does not
   * mutate state.
   */
  validateForConfirm(
    session: HelcimCheckoutSession | null,
  ): null | 'not_found' | 'expired' | 'already_confirmed' {
    if (!session) return 'not_found';
    if (session.expires_at < new Date()) return 'expired';
    if (session.confirmed_at) return 'already_confirmed';
    return null;
  }
}
