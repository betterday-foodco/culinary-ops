import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { CommercePrismaService } from '../../../prisma/commerce-prisma.service';
import {
  ReconciliationLogRepository,
  type ReconciliationTally,
} from '../helcim/reconciliation-log.repository';

/**
 * DailyReconciliationCron — morning sweep that reconciles our
 * CustomerOrder records against Helcim's Transaction History API.
 *
 * This is the PRIMARY mechanism for learning about disputes, refunds,
 * and chargebacks — Helcim's public webhook surface only covers
 * terminal events (cardTransaction, terminalCancel), so async
 * e-commerce notifications arrive here a day late instead of in real time.
 *
 * What a run looks like (once the Transaction History endpoint is wired):
 *   1. Fetch all transactions for the past 48h from Helcim
 *   2. For each transaction, look up the CustomerOrder by
 *      processor_charge_id
 *   3. Compare statuses + amounts — if Helcim shows a status we don't
 *      have, act on it:
 *      - REFUNDED but we don't have a matching OrderRefund → create one
 *      - DISPUTED but we don't have a frozen PaymentMethod → freeze it,
 *        pause the Subscription, alert admin
 *      - Unknown transaction (Helcim has a txn we can't match) → log
 *        + alert ops
 *   4. Persist a ReconciliationLog row with counters
 *   5. Email ops if discrepancies were found
 *
 * ⚠️ STATUS: Phase 5 skeleton. Implementation is PARTIAL — the cron is
 * wired and scheduled, the log persistence works, but the actual
 * transaction-fetch step is a TODO because:
 *   - The legacy Transaction History API doc URL timed out during
 *     research (https://legacysupport.helcim.com/v1/docs/transaction-history-api/)
 *   - Whether this endpoint lives under /v2/ or a v1 legacy namespace
 *     is unconfirmed
 *   - The response shape is unknown until sandbox testing
 *
 * A dev-only @Post endpoint on the admin controller lets you trigger
 * this manually once the endpoint is known. Until then, the scheduled
 * cron records a ReconciliationLog row with transactions_fetched=0
 * and errors="TODO: Transaction History endpoint not yet wired" every
 * morning so there's visible evidence the cron is running even in
 * degraded mode.
 *
 * Research: conner/data-model/helcim-integration.md §7 + §14 Q3 + Q11
 * Plan: conner/data-model/helcim-integration-plan.md §10
 */
@Injectable()
export class DailyReconciliationCron {
  private readonly logger = new Logger(DailyReconciliationCron.name);
  private readonly enabled: boolean;

  constructor(
    private readonly commercePrisma: CommercePrismaService,
    private readonly reconRepo: ReconciliationLogRepository,
    private readonly config: ConfigService,
  ) {
    const nodeEnv = this.config.get<string>('NODE_ENV');
    const devOverride = this.config.get<string>('ENABLE_CRONS_IN_DEV');
    this.enabled = nodeEnv === 'production' || devOverride === 'true';

    if (!this.enabled) {
      this.logger.warn(
        'DailyReconciliationCron is DISABLED in dev. Set ENABLE_CRONS_IN_DEV=true to enable.',
      );
    }
  }

  /**
   * Fires every morning at 6:03 AM America/Denver. The :03 minute offset
   * is deliberate — avoids the :00 and :30 marks that get hit by every
   * other cron on the planet.
   */
  @Cron('3 6 * * *', { timeZone: 'America/Denver' })
  async runDaily(): Promise<void> {
    if (!this.enabled) return;
    await this.run();
  }

  /**
   * Public entry point callable from tests and manual triggers. Executes
   * the reconciliation logic once regardless of the schedule.
   */
  async run(): Promise<ReconciliationTally> {
    const startTime = Date.now();
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 2 * 24 * 60 * 60 * 1000); // 48h back

    this.logger.log(
      `DailyReconciliationCron starting for period ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    const tally: ReconciliationTally = {
      periodStart,
      periodEnd,
      transactionsFetched: 0,
      matchedOk: 0,
      discrepanciesFound: 0,
      disputesFound: 0,
      refundsFound: 0,
      unknownTransactions: 0,
      errors: null,
      durationMs: 0,
    };

    try {
      // ──────────────────────────────────────────────────────────────
      // TODO(phase-5-sandbox): Wire the Transaction History API call.
      //
      // Expected flow once the endpoint is confirmed:
      //
      //   const transactions = await this.helcimApi.listTransactions({
      //     periodStart, periodEnd,
      //   });
      //   tally.transactionsFetched = transactions.length;
      //
      //   for (const txn of transactions) {
      //     const ourOrder = await this.commercePrisma.customerOrder.findFirst({
      //       where: { processor_charge_id: String(txn.transactionId) },
      //     });
      //     if (!ourOrder) {
      //       tally.unknownTransactions++;
      //       this.logger.warn(`Unknown txn: ${txn.transactionId}`);
      //       continue;
      //     }
      //     await this.reconcileOne(ourOrder, txn, tally);
      //   }
      //
      // The exact shape of the Transaction History API response is not
      // yet known. Phase 5 wiring will need:
      //   - HelcimApiClient.listTransactions() method + types
      //   - Per-transaction reconcileOne() handler that creates
      //     OrderRefund rows / freezes PaymentMethods / alerts ops
      //   - Ops email integration (deferred to Phase 6 email phase)
      //
      // See conner/data-model/helcim-integration.md §7 for the full design.
      // ──────────────────────────────────────────────────────────────

      tally.errors = 'TODO: Transaction History endpoint not yet wired — Phase 5 sandbox task';
      this.logger.warn(
        'DailyReconciliationCron running in DEGRADED mode — no transactions fetched. ' +
          'See §14 Q11 of helcim-integration.md for the unresolved endpoint question.',
      );
    } catch (err) {
      const errorDetail = err instanceof Error ? err.message : String(err);
      this.logger.error(`DailyReconciliationCron failed: ${errorDetail}`);
      tally.errors = errorDetail;
    }

    tally.durationMs = Date.now() - startTime;
    await this.reconRepo.recordRun(tally);

    this.logger.log(
      `DailyReconciliationCron complete: fetched=${tally.transactionsFetched} ` +
        `matched=${tally.matchedOk} discrepancies=${tally.discrepanciesFound} ` +
        `disputes=${tally.disputesFound} refunds=${tally.refundsFound} ` +
        `unknown=${tally.unknownTransactions} duration=${tally.durationMs}ms`,
    );

    return tally;
  }
}
