import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { CommercePrismaService } from '../../../prisma/commerce-prisma.service';

/**
 * CardExpiryWarningCron — daily cron that identifies customers whose
 * default payment card is expiring soon and emails them to update it
 * before the weekly charge starts failing.
 *
 * Why we need this: Helcim does NOT support network-level account
 * updater (no Visa Account Updater / Mastercard ABU webhook). When a
 * customer's card is reissued, the old `processor_token` stops working
 * and the next Thursday cutoff charge fails with "expired card". This
 * cron exists to warn the customer proactively BEFORE that failure.
 *
 * Research: conner/data-model/helcim-integration.md §9
 * Plan: conner/data-model/helcim-integration-plan.md §13 (email templates)
 *
 * ⚠️ STATUS: Phase 6 scaffold. The query + throttling logic are real
 * and testable, but the actual email send is a stub — we LOG a warning
 * instead of sending an email. Wiring up a shared EmailService is a
 * cross-module concern (the existing backend has Resend usage inline
 * in corp-auth.service.ts but no shared abstraction). Wire-up is a
 * follow-up task that lands alongside the charge-failure email
 * templates in a later phase. Until then, the last_expiry_warning_sent_at
 * field does get updated correctly so the throttling behavior can be
 * verified in staging.
 */
@Injectable()
export class CardExpiryWarningCron {
  private readonly logger = new Logger(CardExpiryWarningCron.name);
  private readonly enabled: boolean;

  /** Tiers the cron touches, in days-until-expiry order. */
  private static readonly WARNING_TIERS = [30, 14, 3];

  /** Re-warn throttle: never re-send a warning for the same card within this window. */
  private static readonly MIN_DAYS_BETWEEN_WARNINGS = 7;

  constructor(
    private readonly commercePrisma: CommercePrismaService,
    private readonly config: ConfigService,
  ) {
    const nodeEnv = this.config.get<string>('NODE_ENV');
    const devOverride = this.config.get<string>('ENABLE_CRONS_IN_DEV');
    this.enabled = nodeEnv === 'production' || devOverride === 'true';

    if (!this.enabled) {
      this.logger.warn(
        'CardExpiryWarningCron is DISABLED in dev. Set ENABLE_CRONS_IN_DEV=true to enable.',
      );
    }
  }

  /**
   * Fires every morning at 9:09 AM America/Denver. Deliberately off
   * :00 and :30 minute marks to avoid piling onto the global cron grid.
   */
  @Cron('9 9 * * *', { timeZone: 'America/Denver' })
  async runDaily(): Promise<void> {
    if (!this.enabled) return;
    await this.run();
  }

  /**
   * Public entry point for tests and manual triggers. Returns a summary
   * of how many warnings were sent at each tier so callers can log /
   * assert on the outcome.
   */
  async run(): Promise<{ tiers: Record<number, number>; totalWarned: number; totalSkipped: number }> {
    this.logger.log('CardExpiryWarningCron starting');

    const tiers: Record<number, number> = {};
    let totalWarned = 0;
    let totalSkipped = 0;

    for (const daysUntilExpiry of CardExpiryWarningCron.WARNING_TIERS) {
      const cards = await this.findCardsExpiringIn(daysUntilExpiry);
      tiers[daysUntilExpiry] = 0;

      for (const card of cards) {
        if (this.isThrottled(card.last_expiry_warning_sent_at)) {
          totalSkipped++;
          continue;
        }
        await this.warnCardholder(card, daysUntilExpiry);
        tiers[daysUntilExpiry]++;
        totalWarned++;
      }
    }

    this.logger.log(
      `CardExpiryWarningCron complete: ` +
        `warned=${totalWarned} (30d=${tiers[30] ?? 0}, 14d=${tiers[14] ?? 0}, 3d=${tiers[3] ?? 0}) ` +
        `skipped_throttled=${totalSkipped}`,
    );

    return { tiers, totalWarned, totalSkipped };
  }

  /**
   * Find all default PaymentMethods that expire between (now + daysUntilExpiry - 1)
   * and (now + daysUntilExpiry), i.e. cards that cross the threshold today.
   *
   * Expiry is stored as exp_month + exp_year (MMYY split across two int
   * fields). We convert to a JS Date for comparison. The "expires" concept
   * means "the LAST day the card is valid is the last day of the expiry
   * month" so we use day 1 of (exp_month + 1) as the effective expiry date.
   *
   * Filtering happens in application code, not SQL, because the date
   * math on MMYY → Date is awkward in Prisma's query builder and the
   * PaymentMethod table is small enough that a full scan every morning
   * is fine (< 10k rows for a while).
   */
  private async findCardsExpiringIn(daysUntilExpiry: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysUntilExpiry);

    const allDefaultHelcimCards = await this.commercePrisma.paymentMethod.findMany({
      where: {
        is_default: true,
        processor: 'helcim',
        is_disputed: false,
      },
      include: {
        customer: {
          select: {
            id: true,
            display_id: true,
            email: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    return allDefaultHelcimCards.filter((card) => {
      const effectiveExpiry = this.computeEffectiveExpiry(card.exp_month, card.exp_year);
      // Match cards whose effectiveExpiry falls on targetDate
      return (
        effectiveExpiry.getFullYear() === targetDate.getFullYear() &&
        effectiveExpiry.getMonth() === targetDate.getMonth() &&
        effectiveExpiry.getDate() === targetDate.getDate()
      );
    });
  }

  /**
   * A card expires at the END of its expiry month. We represent that
   * as day 1 of the FOLLOWING month — i.e., a card with exp_month=5
   * exp_year=25 is considered "expired" starting June 1, 2025.
   */
  private computeEffectiveExpiry(expMonth: number, expYear: number): Date {
    const yearFull = expYear < 100 ? 2000 + expYear : expYear;
    // exp_month is 1-indexed; Date month is 0-indexed, so expMonth as
    // month index gives the NEXT month naturally.
    return new Date(yearFull, expMonth, 1);
  }

  /**
   * Throttle check — don't re-warn the same card within
   * MIN_DAYS_BETWEEN_WARNINGS days of the last warning. Prevents
   * spamming the customer if they ignore the first email.
   */
  private isThrottled(lastWarning: Date | null): boolean {
    if (!lastWarning) return false;
    const minGapMs = CardExpiryWarningCron.MIN_DAYS_BETWEEN_WARNINGS * 24 * 60 * 60 * 1000;
    return Date.now() - lastWarning.getTime() < minGapMs;
  }

  /**
   * Warn a single cardholder. Currently a stub that logs the warning
   * and updates last_expiry_warning_sent_at. Real email delivery
   * happens once a shared EmailService is introduced.
   */
  private async warnCardholder(
    card: Awaited<ReturnType<typeof this.findCardsExpiringIn>>[number],
    daysUntilExpiry: number,
  ): Promise<void> {
    const customer = card.customer;
    this.logger.warn(
      `[EMAIL STUB] Card expiring in ${daysUntilExpiry} days: ` +
        `customer=${customer.display_id} email=${customer.email} ` +
        `card=****${card.last4} exp=${String(card.exp_month).padStart(2, '0')}/${card.exp_year}`,
    );

    // TODO(phase-6-email-service): replace the log line above with:
    //   await this.emailService.send({
    //     to: customer.email,
    //     template: 'card-expiring',
    //     variables: {
    //       firstName: customer.first_name,
    //       last4: card.last4,
    //       daysUntilExpiry,
    //       updateCardUrl: `${brandBaseUrl}/account/payment-methods`,
    //     },
    //   });

    await this.commercePrisma.paymentMethod.update({
      where: { id: card.id },
      data: { last_expiry_warning_sent_at: new Date() },
    });
  }
}
