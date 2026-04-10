import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * HmacVerifier — HMAC-SHA256 signature verification for inbound Helcim
 * webhooks.
 *
 * Per Helcim's webhook docs (2026-04-09):
 *   - `webhook-id`        header is the unique event ID
 *   - `webhook-timestamp` header is the ISO timestamp of the event
 *   - `webhook-signature` header is the HMAC Helcim computed
 *
 * Signing procedure:
 *   1. Read `HELCIM_WEBHOOK_VERIFIER_TOKEN` from env, base64-decode it
 *   2. Construct `signedContent = webhookId + "." + webhookTimestamp + "." + rawBody`
 *   3. Compute HMAC-SHA256 of signedContent with the decoded token as key
 *   4. Base64-encode the result
 *   5. Compare to `webhook-signature` header with constant-time compare
 *
 * ⚠️ The raw body MUST be the bytes as received from the wire, not a
 * re-serialized parsed object. NestJS's default JSON parser replaces
 * rawBody with a parsed object — the webhook controller must be wired
 * with `express.raw()` middleware ON THAT ROUTE ONLY to preserve the
 * raw bytes. See helcim-integration.md §7.
 *
 * Research: conner/data-model/helcim-integration.md §7
 */
@Injectable()
export class HmacVerifier {
  private readonly logger = new Logger(HmacVerifier.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Verify a webhook signature.
   *
   * @returns true if the signature matches, false otherwise. Does NOT
   *          throw on mismatch — the controller decides how to respond.
   */
  verify(args: {
    webhookId: string;
    webhookTimestamp: string;
    rawBody: string;
    expectedSignature: string;
  }): boolean {
    const verifierToken = this.config.get<string>('HELCIM_WEBHOOK_VERIFIER_TOKEN');
    if (!verifierToken) {
      this.logger.error(
        'HELCIM_WEBHOOK_VERIFIER_TOKEN is not set. Webhook cannot be verified.',
      );
      return false;
    }

    let hmacKey: Buffer;
    try {
      hmacKey = Buffer.from(verifierToken, 'base64');
    } catch (err) {
      this.logger.error(`HELCIM_WEBHOOK_VERIFIER_TOKEN is not valid base64: ${err}`);
      return false;
    }

    const signedContent = `${args.webhookId}.${args.webhookTimestamp}.${args.rawBody}`;
    const expected = crypto.createHmac('sha256', hmacKey).update(signedContent).digest('base64');

    return this.constantTimeEquals(expected, args.expectedSignature);
  }

  /**
   * Check that the webhook timestamp is within N minutes of now.
   * Used by the controller to reject replay attacks — even a valid
   * signature should be rejected if the event is more than ~5 minutes
   * old.
   *
   * @param toleranceMinutes — max allowed age (default 5)
   * @returns true if within tolerance, false if too old or unparseable
   */
  isTimestampFresh(webhookTimestamp: string, toleranceMinutes = 5): boolean {
    const parsed = Date.parse(webhookTimestamp);
    if (Number.isNaN(parsed)) return false;
    const ageMs = Date.now() - parsed;
    return ageMs >= 0 && ageMs <= toleranceMinutes * 60 * 1000;
  }

  /**
   * Constant-time string comparison. Prevents timing attacks on signature
   * verification — a naive === check leaks information about which byte
   * differs first, which can be exploited to forge signatures.
   */
  private constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  }
}
