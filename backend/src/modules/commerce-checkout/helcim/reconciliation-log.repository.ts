import { Injectable } from '@nestjs/common';
import type { ReconciliationLog } from '@prisma/commerce-client';

import { CommercePrismaService } from '../../../prisma/commerce-prisma.service';

/**
 * Tally collected by the daily reconciliation cron during a single run.
 */
export interface ReconciliationTally {
  periodStart: Date;
  periodEnd: Date;
  transactionsFetched: number;
  matchedOk: number;
  discrepanciesFound: number;
  disputesFound: number;
  refundsFound: number;
  unknownTransactions: number;
  errors: string | null;
  durationMs: number;
}

/**
 * ReconciliationLogRepository — audit trail for the daily reconciliation
 * cron. Each run produces exactly one row with counters + duration +
 * any top-level errors. The cron service persists the row at the END
 * of each run so ops can diff day-over-day and detect cron failures
 * (a missing row means the cron didn't run).
 *
 * Research: conner/data-model/helcim-integration.md §7
 */
@Injectable()
export class ReconciliationLogRepository {
  constructor(private readonly commercePrisma: CommercePrismaService) {}

  async recordRun(tally: ReconciliationTally): Promise<ReconciliationLog> {
    return this.commercePrisma.reconciliationLog.create({
      data: {
        period_start: tally.periodStart,
        period_end: tally.periodEnd,
        transactions_fetched: tally.transactionsFetched,
        matched_ok: tally.matchedOk,
        discrepancies_found: tally.discrepanciesFound,
        disputes_found: tally.disputesFound,
        refunds_found: tally.refundsFound,
        unknown_transactions: tally.unknownTransactions,
        errors: tally.errors,
        duration_ms: tally.durationMs,
      },
    });
  }

  /**
   * Return the most recent run's log, or null if the cron has never run.
   * Used by ops health checks to confirm the cron is alive.
   */
  async findLastRun(): Promise<ReconciliationLog | null> {
    return this.commercePrisma.reconciliationLog.findFirst({
      orderBy: { run_at: 'desc' },
    });
  }
}
