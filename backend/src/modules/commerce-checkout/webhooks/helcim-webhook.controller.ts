import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { HelcimWebhookService } from '../helcim/helcim-webhook.service';
import { HmacVerifier } from '../helcim/hmac-verifier';
import { WebhookEventRepository } from '../helcim/webhook-event.repository';

/**
 * Inbound webhook receiver for Helcim events.
 *
 * Route: POST /api/commerce/helcim/webhook
 * Auth:  none (Helcim calls us from their infrastructure and can't
 *        supply an API token — we verify via HMAC signature instead)
 *
 * Protocol (per Helcim docs 2026-04-09):
 *   Headers:
 *     webhook-id        — unique event ID (we use for dedup)
 *     webhook-timestamp — ISO timestamp (we check for replay protection)
 *     webhook-signature — base64(HMAC-SHA256(signedContent, verifierToken))
 *       where signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`
 *       and verifierToken is base64-decoded from HELCIM_WEBHOOK_VERIFIER_TOKEN
 *   Body: JSON — shape varies by event type (see HelcimWebhookService)
 *
 * Flow:
 *   1. Load-or-create the WebhookEvent row by webhook-id
 *   2. If processed_at is already set → return 204 (idempotent replay)
 *   3. Verify the HMAC signature against the raw body
 *   4. Verify the timestamp is within 5 minutes (replay protection)
 *   5. Dispatch to HelcimWebhookService.handle()
 *   6. Mark the WebhookEvent row with the result
 *   7. Return 204 (body ignored by Helcim per their docs)
 *
 * Response codes:
 *   204 — success (also returned on idempotent replay)
 *   400 — invalid signature or stale timestamp (Helcim WILL NOT retry 4xx)
 *   500 — unexpected server error (Helcim WILL retry 5xx per its schedule)
 *
 * Research: conner/data-model/helcim-integration.md §7
 */
@Controller('commerce/helcim')
export class HelcimWebhookController {
  private readonly logger = new Logger(HelcimWebhookController.name);

  constructor(
    private readonly verifier: HmacVerifier,
    private readonly webhookService: HelcimWebhookService,
    private readonly webhookRepo: WebhookEventRepository,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.NO_CONTENT)
  async receiveWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('webhook-id') webhookId: string | undefined,
    @Headers('webhook-timestamp') webhookTimestamp: string | undefined,
    @Headers('webhook-signature') webhookSignature: string | undefined,
  ): Promise<void> {
    // NestFactory is created with `rawBody: true` in main.ts, which
    // populates req.rawBody as a Buffer for every request. We convert
    // to string for HMAC signing (Helcim's documented procedure uses
    // the UTF-8 string of the body, not the raw bytes).
    const rawBody = req.rawBody?.toString('utf-8') ?? '';

    // Validate required headers are present
    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      this.logger.warn(
        `Helcim webhook missing headers: id=${!!webhookId} ts=${!!webhookTimestamp} sig=${!!webhookSignature}`,
      );
      throw new BadRequestException('Missing webhook headers');
    }

    // 1. Parse body — accept even if parse fails, we still dedup+log it
    let parsed: { type?: string; id?: string; data?: unknown } & Record<string, unknown> = {};
    try {
      parsed = rawBody ? (JSON.parse(rawBody) as typeof parsed) : {};
    } catch (err) {
      this.logger.warn(`Helcim webhook body is not valid JSON: ${err}`);
      // Fall through to signature check — a valid signature on invalid
      // JSON is still important to detect (means Helcim sent something
      // weird that we should investigate, not silently reject).
    }
    const eventType = parsed.type ?? 'unknown';

    // 2. Verify HMAC signature against the raw body
    const signatureValid = this.verifier.verify({
      webhookId,
      webhookTimestamp,
      rawBody,
      expectedSignature: webhookSignature,
    });

    // 3. Upsert the WebhookEvent row (dedup). This happens BEFORE the
    //    signature check's side effects so even rejected webhooks leave
    //    an audit trail.
    const { row: event, wasNew } = await this.webhookRepo.findOrCreate({
      id: webhookId,
      type: eventType,
      signatureValid,
      rawBody,
    });

    // 4. Idempotent replay — if this event was already processed, return 204
    if (!wasNew && event.processed_at) {
      this.logger.log(
        `Helcim webhook replay: id=${webhookId} already processed at ${event.processed_at.toISOString()}`,
      );
      return;
    }

    // 5. Reject on invalid signature — do NOT process, do NOT let Helcim
    //    retry (4xx stops retries per their docs)
    if (!signatureValid) {
      await this.webhookRepo.markProcessed(webhookId, {
        result: 'error',
        errorDetail: 'Invalid HMAC signature',
      });
      this.logger.error(`Helcim webhook signature verification FAILED for id=${webhookId}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    // 6. Reject stale timestamps (replay protection) — a valid signature
    //    on an old event means either clock skew or a replay attack.
    //    Either way, refuse.
    if (!this.verifier.isTimestampFresh(webhookTimestamp, 5)) {
      await this.webhookRepo.markProcessed(webhookId, {
        result: 'error',
        errorDetail: `Stale timestamp: ${webhookTimestamp}`,
      });
      this.logger.error(
        `Helcim webhook timestamp out of range: id=${webhookId} ts=${webhookTimestamp}`,
      );
      throw new BadRequestException('Webhook timestamp too old');
    }

    // 7. Dispatch to the event handler
    let result: 'processed' | 'ignored_event_type' | 'error' = 'error';
    let errorDetail: string | undefined;
    try {
      result = await this.webhookService.handle(parsed);
    } catch (err) {
      errorDetail = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Helcim webhook handler threw: id=${webhookId} type=${eventType} err=${errorDetail}`,
      );
      // Mark the event as errored but still return 204 so Helcim doesn't
      // retry — the failure is in OUR code, not Helcim's. Investigate in
      // the logs, don't flood the inbox with retries.
      await this.webhookRepo.markProcessed(webhookId, {
        result: 'error',
        errorDetail,
      });
      return;
    }

    await this.webhookRepo.markProcessed(webhookId, { result });
    this.logger.log(
      `Helcim webhook processed: id=${webhookId} type=${eventType} result=${result}`,
    );
  }
}
