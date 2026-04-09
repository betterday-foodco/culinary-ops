import { Injectable, Logger } from '@nestjs/common';

/**
 * Broad categories a decline can fall into. Each category maps to a
 * different retry/notification policy in the weekly charge cron.
 *
 * See helcim-integration.md §6 for the full policy.
 */
export type DeclineCategory =
  /** Try again immediately, don't count as an attempt. */
  | 'retryable_transient'
  /** Insufficient funds / over limit — retry per schedule. */
  | 'retryable_funds'
  /** Expired / invalid / stolen — pause subscription, email customer. */
  | 'fatal_card'
  /** Card issuer said no — pause after 1 more attempt. */
  | 'fatal_auth'
  /** Fraud flag — no retry, freeze, manual review. */
  | 'fatal_fraud'
  /** Classifier didn't match any pattern — log and treat as transient. */
  | 'unknown';

/**
 * DeclineClassifier — maps Helcim's free-text error strings to one of
 * the DeclineCategory buckets so the weekly charge cron can make retry
 * vs give-up decisions.
 *
 * ⚠️ The patterns below are GUESSES built from general payment processor
 * experience. The implementation chat should replace these with real
 * strings after running every decline variation in the Helcim sandbox
 * (see helcim-integration-plan.md §6 — generate CVV=200..999 + expired
 * + invalid card, record exact strings, paste here).
 *
 * Helcim returns errors as free text, not as machine-readable codes, so
 * we pattern-match on phrases. Brittle but unavoidable until Helcim ships
 * structured decline codes.
 *
 * Research: conner/data-model/helcim-integration.md §6 + §14 Q10
 */
@Injectable()
export class DeclineClassifier {
  private readonly logger = new Logger(DeclineClassifier.name);

  private readonly patterns: Array<{ regex: RegExp; category: DeclineCategory }> = [
    // Retryable — transient — no attempt counted, retry in 5 minutes
    {
      regex: /try again|temporary|timeout|network|unavailable|try later/i,
      category: 'retryable_transient',
    },

    // Fatal — fraud — matched FIRST so "cvv" doesn't fall through to fatal_auth
    {
      regex: /fraud|suspected|cvv.*(fail|reject|decline)|avs.*(fail|reject|decline)/i,
      category: 'fatal_fraud',
    },

    // Fatal — card issue (matched before fatal_auth since "expired card" includes "card")
    {
      regex: /expired|invalid card|stolen|lost card|pick.?up card|card.*not.*valid/i,
      category: 'fatal_card',
    },

    // Retryable — funds — customer can top up and retry, schedule retries
    {
      regex: /insufficient funds|exceeds.+limit|exceeds.+balance|over.+limit/i,
      category: 'retryable_funds',
    },

    // Fatal — auth — issuer said no, lower retry budget
    {
      regex: /declined|call issuer|contact.+bank|do not honor/i,
      category: 'fatal_auth',
    },
  ];

  /**
   * Classify a Helcim error string into a retry category.
   *
   * @param errorSource — the raw error from Helcim. May be a string,
   *                      an array of strings, or a field-keyed object.
   *                      Gets flattened to a single searchable string.
   * @returns the matched DeclineCategory, or `unknown` if nothing matched.
   */
  classify(errorSource: string | string[] | Record<string, string> | null | undefined): DeclineCategory {
    const flattened = this.flattenError(errorSource);
    if (!flattened) return 'unknown';

    for (const { regex, category } of this.patterns) {
      if (regex.test(flattened)) return category;
    }

    this.logger.warn(`Unclassified Helcim error: "${flattened.slice(0, 200)}"`);
    return 'unknown';
  }

  private flattenError(src: unknown): string {
    if (typeof src === 'string') return src;
    if (Array.isArray(src)) return src.map(String).join(' | ');
    if (src && typeof src === 'object') {
      return Object.entries(src as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
    }
    return '';
  }
}
