import { Injectable, Logger } from '@nestjs/common';

/**
 * HelcimWebhookService — dispatches inbound Helcim webhook payloads to
 * the appropriate handler based on event type.
 *
 * ⚠️ STATUS: as of 2026-04-09 Helcim only publicly documents TWO webhook
 * event types — `cardTransaction` and `terminalCancel` — both for
 * physical card terminals. Neither applies to our e-commerce flow.
 * There are no documented webhooks for refund completion, dispute filed,
 * chargeback opened, or card updater events.
 *
 * This service is built defensively against future events Helcim may add
 * AND to give us a place to plug in reconciliation-cron-driven "virtual"
 * events when disputes are detected via the Transaction History API.
 *
 * Current behavior: logs the event and returns 'ignored_event_type' for
 * any event we don't explicitly handle. The WebhookEventRepository
 * preserves the raw body for audit so nothing gets lost.
 *
 * Research: conner/data-model/helcim-integration.md §7 + §14 Q3
 */
@Injectable()
export class HelcimWebhookService {
  private readonly logger = new Logger(HelcimWebhookService.name);

  /**
   * Dispatch a parsed webhook payload to the right handler.
   *
   * @returns the result label to record on the WebhookEvent row.
   */
  async handle(
    parsed: { type?: string; id?: string; data?: unknown } & Record<string, unknown>,
  ): Promise<'processed' | 'ignored_event_type' | 'error'> {
    const eventType = parsed.type;
    if (!eventType) {
      this.logger.warn('Helcim webhook missing `type` field');
      return 'ignored_event_type';
    }

    switch (eventType) {
      case 'cardTransaction':
        return this.handleCardTransaction(parsed);
      case 'terminalCancel':
        return this.handleTerminalCancel(parsed);
      default:
        // Future events, or types Helcim adds without notice — log + skip.
        // Any future implementation will add a new case here.
        this.logger.log(`Helcim webhook of unknown type "${eventType}" — ignoring`);
        return 'ignored_event_type';
    }
  }

  /**
   * Handle a `cardTransaction` event. Per Helcim's docs, these fire for
   * Payment Hardware API transactions — physical card terminals. We
   * don't have a terminal, but we receive the event defensively in case
   * Helcim silently extends its scope to include e-commerce charges.
   *
   * Current behavior: log and move on. Future phases may cross-reference
   * the event's `id` against CustomerOrder.processor_charge_id.
   */
  private async handleCardTransaction(
    parsed: { id?: string; data?: unknown },
  ): Promise<'processed' | 'ignored_event_type'> {
    this.logger.log(
      `cardTransaction webhook: id=${parsed.id ?? '?'} — logged only, no handler wired yet`,
    );
    return 'ignored_event_type';
  }

  /**
   * Handle a `terminalCancel` event. Fires when a payment is cancelled
   * on a physical card device before processing. We have no terminals,
   * so this should never actually land. Defensive logging only.
   */
  private async handleTerminalCancel(
    parsed: { data?: unknown },
  ): Promise<'processed' | 'ignored_event_type'> {
    this.logger.warn(
      `terminalCancel webhook received — we have no terminals, this should not happen. ` +
        `data=${JSON.stringify(parsed.data).slice(0, 500)}`,
    );
    return 'ignored_event_type';
  }
}
