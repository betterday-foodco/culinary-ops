/**
 * HelcimApiError — thrown by HelcimApiClient when Helcim returns a
 * non-2xx response. Wraps the raw status + body and provides typed
 * helpers for distinguishing retryable vs fatal errors at the call site.
 *
 * Helcim error shapes are inconsistent:
 *   - 401 auth failure:    { "errors": "Unauthorized" }                (string)
 *   - 400 validation:      { "errors": { "field": "reason" } }          (object)
 *   - Payment decline:     { "errors": "Declined" } or similar          (string/array)
 *
 * This class preserves the raw body for audit and exposes a
 * normalized `parsedErrors` property for callers that want to pattern-
 * match decline reasons (see DeclineClassifier).
 *
 * Research: conner/data-model/helcim-integration.md §6
 */

export class HelcimApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly rawBody: string,
    public readonly parsedErrors: string | string[] | Record<string, string> | null,
  ) {
    const preview = rawBody.length > 200 ? `${rawBody.slice(0, 200)}...` : rawBody;
    super(`Helcim API error ${status} on ${path}: ${preview}`);
    this.name = 'HelcimApiError';
  }

  /**
   * Parse a failed Response into a HelcimApiError. Callers pass the
   * raw body text; this constructor tries to parse it as JSON and
   * extract the `errors` field. Never throws during parsing — unknown
   * shapes are preserved as rawBody with parsedErrors=null.
   */
  static fromResponseBody(status: number, rawBody: string, path: string): HelcimApiError {
    let parsedErrors: string | string[] | Record<string, string> | null = null;
    try {
      const parsed = JSON.parse(rawBody) as { errors?: unknown };
      if (typeof parsed.errors === 'string') {
        parsedErrors = parsed.errors;
      } else if (Array.isArray(parsed.errors)) {
        parsedErrors = parsed.errors.filter((x): x is string => typeof x === 'string');
      } else if (parsed.errors && typeof parsed.errors === 'object') {
        const normalized: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed.errors as Record<string, unknown>)) {
          normalized[k] = String(v);
        }
        parsedErrors = normalized;
      }
    } catch {
      // Body wasn't JSON — leave parsedErrors null, keep rawBody for audit
    }
    return new HelcimApiError(status, path, rawBody, parsedErrors);
  }

  /** 409 means we reused an idempotency key with a different payload. */
  isIdempotencyConflict(): boolean {
    return this.status === 409;
  }

  /** 401/403 means our token is wrong or revoked — page on-call. */
  isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** 429 means we're being rate limited — back off. */
  isRateLimit(): boolean {
    return this.status === 429;
  }

  /** 5xx or 429 — transient Helcim-side issue, safe to retry. */
  isTransient(): boolean {
    return this.status >= 500 || this.status === 429;
  }

  /**
   * Flattens parsedErrors to a single string for logging and for the
   * DeclineClassifier's regex matching. Always returns a non-empty string.
   */
  toErrorString(): string {
    if (typeof this.parsedErrors === 'string') return this.parsedErrors;
    if (Array.isArray(this.parsedErrors)) return this.parsedErrors.join(' | ');
    if (this.parsedErrors && typeof this.parsedErrors === 'object') {
      return Object.entries(this.parsedErrors)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
    }
    return this.rawBody || `HTTP ${this.status}`;
  }
}
