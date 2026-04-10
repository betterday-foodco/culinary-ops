import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { CommercePrismaService } from '../../../prisma/commerce-prisma.service';
import { HelcimService, type ChargeResult } from '../helcim/helcim.service';

/**
 * WeeklyChargeCron — the weekly cutoff MIT (merchant-initiated) charge
 * loop. Runs once per week at the order cutoff time and iterates every
 * active subscriber with a non-empty WeeklyCartRecord, charging their
 * saved card for whatever their cart currently totals.
 *
 * SCHEDULE CONFIGURATION:
 *   The cutoff cron expression is set via ORDER_CUTOFF_CRON env var.
 *   Default: '1 0 * * 5' (Friday 00:01 MT) for BetterDay's Sunday
 *   delivery schedule. This should eventually be admin-configurable
 *   via a SystemConfig table (like Shopify's order deadlines), not
 *   hardcoded in env. See TODO below.
 *
 *   BetterDay's actual rhythm:
 *     Sunday    → deliveries arrive
 *     Mon-Thu   → customers edit carts for next week
 *     Fri 00:01 → orders lock + payment capture
 *     Fri-Sat   → kitchen production
 *     Sunday    → delivery
 *
 *   With the pre-auth model (plan §18), the rhythm becomes:
 *     Wed 00:01 → pre-auth (48h before cutoff)
 *     Wed-Thu   → dunning for failures
 *     Fri 00:01 → capture (or void if skipped/paused/cancelled)
 *
 * Uses the existing @prisma/commerce-client schema. Built against the
 * Phase 1 schema additions (CustomerOrder.charge_attempts,
 * last_charge_attempt_at, last_charge_error, next_charge_retry_at, etc).
 *
 * This is the load-bearing call for the entire BetterDay subscription
 * model — see research §1 for why we charge via Payment API card-on-file
 * instead of Helcim's Recurring API.
 *
 * Research: conner/data-model/helcim-integration.md §5 + §6
 * Plan: conner/data-model/helcim-integration-plan.md §7 + §18 (revised pre-auth)
 *
 * ⚠️ STATUS — Phase 3 scaffolding:
 *   - The runCutoff() cron handler is wired but DISABLED in dev (it would
 *     collide with other chats' worktrees running the same backend).
 *   - The retry sweep cron is wired but guarded the same way.
 *   - processOne() is a SKELETON — it calls HelcimService.chargeSavedCard
 *     on a given WeeklyCartRecord but DOES NOT yet build a CustomerOrder
 *     row from the cart because that pipeline doesn't exist yet. Until
 *     the cart→order pipeline lands, this cron is dead code EXCEPT when
 *     invoked via the admin dev-trigger endpoint with a pre-built order ID.
 *   - Full integration requires the cart generation cron + order totals
 *     engine + coupon application + points earn — none of which exist.
 *     A TODO block in processOne() lists what's missing.
 *
 * TODO(admin-configurable-schedule): Replace the @Cron decorator with
 *   SchedulerRegistry-based dynamic cron registration that reads the
 *   schedule from a SystemConfig table at startup (and reloads when an
 *   admin changes it). NestJS's @Cron decorator is evaluated at class
 *   decoration time and can't read runtime config. The SchedulerRegistry
 *   approach creates the CronJob programmatically in onModuleInit().
 *   Until then, the schedule comes from the ORDER_CUTOFF_CRON env var
 *   and changing it requires a redeploy.
 */
@Injectable()
export class WeeklyChargeCron {
  private readonly logger = new Logger(WeeklyChargeCron.name);
  private readonly enabled: boolean;

  constructor(
    private readonly commercePrisma: CommercePrismaService,
    private readonly helcim: HelcimService,
    private readonly config: ConfigService,
  ) {
    // Guard: the weekly charge cron must NEVER run automatically in dev.
    // Two parallel worktrees would both try to charge the same cart,
    // idempotency-key would save us from a double-charge but the DB
    // state would race. See helcim-integration-plan.md §7.
    const nodeEnv = this.config.get<string>('NODE_ENV');
    const devOverride = this.config.get<string>('ENABLE_CRONS_IN_DEV');
    this.enabled = nodeEnv === 'production' || devOverride === 'true';

    if (!this.enabled) {
      this.logger.warn(
        'WeeklyChargeCron is DISABLED in dev. Use the admin /weekly-charge/run-once ' +
          'endpoint to trigger a single order charge manually, or set ' +
          'ENABLE_CRONS_IN_DEV=true in backend/.env to enable the full schedule.',
      );
    }
  }

  /**
   * Order cutoff cron. Fires weekly per ORDER_CUTOFF_CRON env var.
   * Default: Friday 00:01 MT (for Sunday deliveries).
   *
   * TODO(admin-configurable-schedule): read from SystemConfig table
   * instead of env var. For now, changing the cutoff time requires
   * editing ORDER_CUTOFF_CRON in .env and restarting.
   *
   * Iterates every WeeklyCartRecord for the current delivery week that's:
   *   - status = 'scheduled' (not skipped/paused/cancelled)
   *   - order_id IS NULL (no order created yet)
   *
   * For each row, processOne() is called.
   */
  @Cron(process.env.ORDER_CUTOFF_CRON || '1 0 * * 5', { timeZone: 'America/Denver' })
  async runCutoff(): Promise<void> {
    if (!this.enabled) return;

    const deliveryWeek = this.computeDeliveryWeekFor(new Date());
    this.logger.log(`Weekly charge cutoff starting for delivery week ${deliveryWeek.toISOString()}`);

    const records = await this.commercePrisma.weeklyCartRecord.findMany({
      where: {
        delivery_week: deliveryWeek,
        delivery_status: 'scheduled',
        order_id: null,
      },
      orderBy: { created_at: 'asc' },
    });

    this.logger.log(`Found ${records.length} cart records to charge`);

    let approved = 0;
    let declined = 0;
    let errored = 0;

    for (const record of records) {
      try {
        const result = await this.processOne(record.id);
        if (result?.kind === 'approved') approved++;
        else if (result?.kind === 'declined') declined++;
        else errored++;
      } catch (err) {
        this.logger.error(
          `Weekly charge failed unexpectedly for record ${record.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        errored++;
      }
    }

    this.logger.log(
      `Weekly charge cutoff complete: approved=${approved} declined=${declined} errored=${errored} total=${records.length}`,
    );
  }

  /**
   * Hourly retry sweep. Picks up orders whose `next_charge_retry_at` has
   * arrived and attempts another charge. See research §6 retry policy
   * (attempts at T+0, T+6h, T+24h, T+48h, then paused_indefinite).
   *
   * Runs at :07 past the hour to avoid piling on the :00 and :30 marks.
   */
  @Cron('7 * * * *')
  async runRetrySweep(): Promise<void> {
    if (!this.enabled) return;

    const now = new Date();
    const ordersToRetry = await this.commercePrisma.customerOrder.findMany({
      where: {
        next_charge_retry_at: { lte: now, not: null },
        status: { in: ['pending'] },
        charge_attempts: { lt: 4 }, // Max 4 attempts per §6 retry policy
      },
      take: 100, // Batch size — don't hammer Helcim with a huge sweep
      orderBy: { next_charge_retry_at: 'asc' },
    });

    if (ordersToRetry.length === 0) return;
    this.logger.log(`Retry sweep: ${ordersToRetry.length} orders ready for retry`);

    for (const order of ordersToRetry) {
      await this.retryOne(order.id);
    }
  }

  /**
   * Public entry point for the admin dev-trigger endpoint. Charges
   * a single WeeklyCartRecord by ID, bypassing the cron schedule.
   *
   * Used for sandbox testing — the admin hits
   * POST /api/admin/commerce/weekly-charge/run-once { recordId: "..." }
   * to exercise chargeSavedCard without waiting for the weekly cutoff.
   */
  async processOne(weeklyCartRecordId: string): Promise<ChargeResult | null> {
    const record = await this.commercePrisma.weeklyCartRecord.findUnique({
      where: { id: weeklyCartRecordId },
      include: {
        customer: true,
        subscription: {
          include: {
            default_payment: true,
          },
        },
      },
    });

    if (!record) {
      this.logger.warn(`processOne: record ${weeklyCartRecordId} not found`);
      return null;
    }

    // Validate the row is in a charge-able state
    if (record.delivery_status !== 'scheduled') {
      this.logger.warn(
        `processOne: record ${weeklyCartRecordId} has status ${record.delivery_status}, skipping`,
      );
      return null;
    }
    if (record.order_id) {
      this.logger.warn(
        `processOne: record ${weeklyCartRecordId} already has order_id ${record.order_id}, skipping`,
      );
      return null;
    }
    if (!record.customer.helcim_customer_id) {
      this.logger.warn(
        `processOne: customer ${record.customer_id} has no helcim_customer_id, skipping`,
      );
      return null;
    }
    if (!record.subscription?.default_payment) {
      this.logger.warn(
        `processOne: subscription ${record.subscription_id} has no default_payment, skipping`,
      );
      return null;
    }
    const payment = record.subscription.default_payment;
    if (payment.is_disputed) {
      this.logger.warn(
        `processOne: default card ${payment.id} is frozen (disputed), skipping`,
      );
      return null;
    }

    // ──────────────────────────────────────────────────────────────────
    // TODO(phase-3-cart-flow): Build a CustomerOrder from the cart
    //
    // The full implementation needs to:
    //   1. Compute the order total from record.cart_items + tax +
    //      subscriber_discount (from Subscription.savings_tier) +
    //      coupons (from CustomerCoupon status='applied') + delivery_fee
    //   2. Create a CustomerOrder row with:
    //      - line_items = record.cart_items JSONB
    //      - billing_contact = customer display fields
    //      - display_id generated from sequence
    //      - all the money fields (subtotal, tax, total, etc.)
    //      - status = 'pending', placed_at = now()
    //   3. Link weeklyCartRecord.order_id = newOrder.id
    //   4. Pass the real total into chargeSavedCard
    //
    // Until that flow exists, this scaffold charges a HARDCODED amount
    // based on the cart_items JSONB sum alone — no tax, no discounts,
    // no coupons. This is a smoke-test entry point, NOT a production path.
    // ──────────────────────────────────────────────────────────────────

    const placeholderAmount = this.estimatePlaceholderAmount(record.cart_items);
    if (placeholderAmount <= 0) {
      this.logger.warn(
        `processOne: record ${weeklyCartRecordId} cart_items sum is zero, skipping`,
      );
      return null;
    }

    // ipAddress fallback chain from §5
    const ipAddress = this.helcim.resolveMitIpAddress({
      customerLastLoginIp: record.customer.last_login_ip,
      paymentMethodSavedFromIp: payment.saved_from_ip,
    });

    // Use a synthetic display_id for the idempotency key since we don't
    // have a real CustomerOrder yet. Format: "WKR-<recordId>" plus the
    // attempt number. Long enough to hit the 25-char floor naturally.
    const syntheticOrderId = `WKR-${record.id}`;
    const attemptNumber = 1;

    const result = await this.helcim.chargeSavedCard({
      orderDisplayId: syntheticOrderId,
      helcimCustomerCode: record.customer.helcim_customer_id,
      cardToken: payment.processor_token,
      amount: placeholderAmount,
      currency: 'CAD',
      ipAddress,
      attemptNumber,
    });

    // ──────────────────────────────────────────────────────────────────
    // TODO(phase-3-cart-flow): Persist the result to CustomerOrder
    //
    // On APPROVED:
    //   - Create CustomerOrder with processor_charge_id = result.processorChargeId
    //   - Set status='confirmed', confirmed_at=now()
    //   - Set mit_indicator=true, charge_initiated_by='cutoff_cron', charge_ip_address=ipAddress
    //   - Update WeeklyCartRecord.order_id + processed_at
    //   - Award points via RewardPointsTransaction
    //   - Send order confirmation email
    //
    // On DECLINED (retryable):
    //   - Create or update CustomerOrder with charge_attempts++
    //   - last_charge_error = result.rawError
    //   - next_charge_retry_at = computeRetryTime(result.category, charge_attempts)
    //   - Send first-decline email
    //
    // On DECLINED (fatal):
    //   - Same as retryable, but set next_charge_retry_at = null
    //   - Move Subscription.status to 'paused_indefinite'
    //   - Send pause email
    //
    // On system_error (transient):
    //   - Queue re-run in 15 minutes
    //   - Do NOT count as a real attempt
    //
    // On system_error (auth/rate limit):
    //   - Halt the cron loop, page on-call
    // ──────────────────────────────────────────────────────────────────

    this.logger.log(
      `processOne complete for record ${weeklyCartRecordId}: result=${result.kind}` +
        (result.kind === 'approved' ? ` txn=${result.processorChargeId}` : '') +
        (result.kind === 'declined' ? ` category=${result.category}` : ''),
    );

    return result;
  }

  /**
   * Retry a single order that's past its next_charge_retry_at. Used by
   * the hourly retry sweep.
   *
   * Skeleton only — the full body needs the cart/order flow to be wired
   * so we have a real CustomerOrder to retry.
   */
  private async retryOne(orderId: string): Promise<void> {
    this.logger.log(`retryOne: attempting ${orderId}`);
    // TODO(phase-3-cart-flow): fetch CustomerOrder, look up its
    // Customer + PaymentMethod, call chargeSavedCard with
    // attemptNumber = charge_attempts + 1, handle the result per §6
    // retry policy.
  }

  /**
   * Compute the delivery week (the Sunday date) for a given reference date.
   * The cutoff fires before delivery day, so the delivery week is the
   * upcoming Sunday.
   *
   * TODO(admin-configurable-schedule): the delivery day (Sunday) should
   * come from SystemConfig, not be hardcoded here. Some food businesses
   * deliver on different days per route/zone. For BetterDay v1, Sunday
   * is the only delivery day.
   */
  private computeDeliveryWeekFor(now: Date): Date {
    const deliveryDayOfWeek = 0; // 0 = Sunday. TODO: read from config
    const d = new Date(now);
    const day = d.getDay();
    const daysUntilDelivery = (deliveryDayOfWeek - day + 7) % 7;
    d.setDate(d.getDate() + (daysUntilDelivery || 7));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Sum the cart_items JSONB to get a placeholder order amount. Used
   * only in the Phase 3 scaffolding — the real order total comes from
   * the cart/order pipeline once it's built.
   *
   * Expects cart_items to be an array of objects with `price` and `qty`
   * fields (per the schema comment on WeeklyCartRecord.cart_items).
   * Safe against malformed data — returns 0 if the shape is wrong.
   */
  private estimatePlaceholderAmount(cartItems: unknown): number {
    if (!Array.isArray(cartItems)) return 0;
    let total = 0;
    for (const item of cartItems) {
      if (item && typeof item === 'object') {
        const price = Number((item as Record<string, unknown>).price ?? 0);
        const qty = Number((item as Record<string, unknown>).qty ?? 0);
        if (Number.isFinite(price) && Number.isFinite(qty) && price > 0 && qty > 0) {
          total += price * qty;
        }
      }
    }
    return Math.round(total * 100) / 100;
  }
}
