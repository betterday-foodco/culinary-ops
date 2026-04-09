import { Injectable } from '@nestjs/common';
import type { WebhookEvent } from '@prisma/commerce-client';

import { CommercePrismaService } from '../../../prisma/commerce-prisma.service';

/**
 * WebhookEventRepository — idempotent dedup store for inbound Helcim
 * webhooks. The controller's first action on every webhook POST is
 * findOrCreate({ id: webhookId }) — if the row already has processed_at
 * set, the controller returns 204 immediately without re-processing.
 *
 * Research: conner/data-model/helcim-integration.md §7
 */
@Injectable()
export class WebhookEventRepository {
  constructor(private readonly commercePrisma: CommercePrismaService) {}

  /**
   * Atomically create a new WebhookEvent row, or return the existing
   * one if a row with the same `id` (= webhook-id header) already
   * exists. Prisma's upsert() with `create + empty update` serves as
   * a cheap findOrCreate.
   */
  async findOrCreate(args: {
    id: string;
    type: string;
    signatureValid: boolean;
    rawBody: string;
  }): Promise<{ row: WebhookEvent; wasNew: boolean }> {
    const existing = await this.commercePrisma.webhookEvent.findUnique({
      where: { id: args.id },
    });
    if (existing) {
      return { row: existing, wasNew: false };
    }
    const created = await this.commercePrisma.webhookEvent.create({
      data: {
        id: args.id,
        type: args.type,
        signature_valid: args.signatureValid,
        raw_body: args.rawBody,
      },
    });
    return { row: created, wasNew: true };
  }

  /**
   * Mark a previously-created WebhookEvent as processed. Sets the
   * processed_at timestamp and optionally the result + error fields.
   */
  async markProcessed(
    id: string,
    args: {
      result: 'processed' | 'skipped_duplicate' | 'ignored_event_type' | 'error';
      errorDetail?: string;
    },
  ): Promise<WebhookEvent> {
    return this.commercePrisma.webhookEvent.update({
      where: { id },
      data: {
        processed_at: new Date(),
        result: args.result,
        error_detail: args.errorDetail ?? null,
      },
    });
  }
}
