import { CouponValidationErrorCode, CouponValidationErrorMeta } from './coupon-validation.service';

/**
 * Customer-facing error messages for coupon validation failures.
 *
 * The CouponValidationService returns structured { reason, meta } pairs.
 * This catalog turns those into warm, action-oriented copy in BetterDay
 * voice. The frontend calls `getCouponErrorMessage(reason, meta)` and
 * renders the result directly — no switch statements in UI code.
 *
 * Guidelines:
 *   - Lead with what the customer can DO, not what went wrong
 *   - Use specific numbers from meta when available ("Add $4.37 more")
 *   - Never expose internal field names, IDs, or system details
 *   - Keep messages under ~120 chars so they fit in a toast or inline alert
 */

interface ErrorMessageEntry {
  /** Short headline for toast / inline alert */
  title: string;
  /** Longer explanation with action hint. May include {placeholders} resolved from meta. */
  detail: string;
}

const ERROR_MESSAGES: Record<CouponValidationErrorCode, ErrorMessageEntry> = {
  // ─── Rule 1 — code exists + active ────────────────────────────────────────
  CODE_NOT_FOUND: {
    title: "We don't recognize that code",
    detail: 'Double-check the spelling and try again. Codes are not case-sensitive.',
  },
  INACTIVE: {
    title: 'This code is no longer active',
    detail: 'This promotion has ended. Check your email for current offers!',
  },

  // ─── Rule 2 — date range ──────────────────────────────────────────────────
  NOT_YET_ACTIVE: {
    title: 'This code isn\u2019t active yet',
    detail: 'This promotion starts on {startsAt}. Save it and come back then!',
  },
  EXPIRED: {
    title: 'This code has expired',
    detail: 'This promotion ended on {expiredAt}. Check your email for current offers!',
  },

  // ─── Rule 3 — usage limits ────────────────────────────────────────────────
  GLOBAL_LIMIT_REACHED: {
    title: 'This promotion is fully claimed',
    detail: 'All available uses have been taken. Follow us for future deals!',
  },
  CUSTOMER_LIMIT_REACHED: {
    title: 'You\u2019ve already used this code',
    detail: 'This code can only be used {required} time(s) per customer.',
  },
  HOUSEHOLD_LIMIT_REACHED: {
    title: 'This code has been used at your address',
    detail: 'This promotion is limited to {required} use(s) per household.',
  },

  // ─── Rule 4 — order value thresholds ──────────────────────────────────────
  MIN_ORDER_NOT_MET: {
    title: 'Your cart needs a little more',
    detail: 'Add ${shortfall} more to unlock this discount. Minimum order: ${required}.',
  },
  MAX_ORDER_EXCEEDED: {
    title: 'Your cart is over the limit for this code',
    detail: 'This code applies to orders under ${required}.',
  },

  // ─── Rule 5 — product + category ──────────────────────────────────────────
  PRODUCT_NOT_IN_CART: {
    title: 'This code requires a specific item',
    detail: 'Add an eligible item to your cart to use this code.',
  },
  PRODUCT_EXCLUDED: {
    title: 'This code can\u2019t be used with an item in your cart',
    detail: 'One or more items in your cart are excluded from this promotion.',
  },
  CATEGORY_NOT_IN_CART: {
    title: 'This code is for a specific category',
    detail: 'Add an item from the eligible category to use this code.',
  },
  CATEGORY_EXCLUDED: {
    title: 'This code doesn\u2019t apply to a category in your cart',
    detail: 'Some categories in your cart are excluded from this promotion.',
  },

  // ─── Rule 6 — email targeting ─────────────────────────────────────────────
  EMAIL_NOT_ALLOWED: {
    title: 'This code isn\u2019t available for your account',
    detail: 'This is a private promotion. Check your email for codes meant for you!',
  },
  EMAIL_BLOCKED: {
    title: 'This code isn\u2019t available for your account',
    detail: 'This promotion is not available for your account.',
  },

  // ─── Rule 7 — customer segment ────────────────────────────────────────────
  CUSTOMER_TAG_NOT_ALLOWED: {
    title: 'This code is for a select group',
    detail: 'This promotion is limited to specific customer groups.',
  },
  CUSTOMER_TAG_EXCLUDED: {
    title: 'This code isn\u2019t available for your account',
    detail: 'Your account type is not eligible for this promotion.',
  },
  LIFETIME_SPEND_BELOW_MIN: {
    title: 'Keep ordering to unlock this reward!',
    detail: 'This code is a loyalty reward for customers who\u2019ve spent ${required} or more with us.',
  },
  LIFETIME_SPEND_ABOVE_MAX: {
    title: 'This code is for newer customers',
    detail: 'This promotion is for customers getting started with BetterDay.',
  },
  MEMBER_TOO_NEW: {
    title: 'This code unlocks after more time with us',
    detail: 'This is a loyalty reward \u2014 you\u2019ll be eligible in {daysUntil} more day(s).',
  },
  MEMBER_TOO_OLD: {
    title: 'This code was for new members',
    detail: 'This promotion was available during your first {required} days.',
  },
  STATUS_NOT_TARGETED: {
    title: 'This code isn\u2019t available for your account',
    detail: 'This promotion is limited to specific account types.',
  },
  EMAIL_NOT_VERIFIED: {
    title: 'Verify your email to use this code',
    detail: 'Check your inbox for a verification link, then come back and apply this code.',
  },
  NEW_CUSTOMERS_ONLY: {
    title: 'This code is for first-time customers',
    detail: 'Welcome codes are for your very first order. Thanks for being a loyal customer \u2014 check your email for returning-customer offers!',
  },

  // ─── Rule 8 — subscription ────────────────────────────────────────────────
  REQUIRES_SUBSCRIPTION: {
    title: 'This code is for subscribers',
    detail: 'Start a meal plan to unlock this discount \u2014 subscribers save on every order.',
  },
  NEW_SUBSCRIBERS_ONLY: {
    title: 'This code is for new subscribers',
    detail: 'This welcome offer is for customers starting their first meal plan.',
  },
  NON_SUBSCRIBERS_ONLY: {
    title: 'This code is for non-subscribers',
    detail: 'You already get subscriber savings \u2014 this code is for one-time orders.',
  },

  // ─── Rule 9 — order count ─────────────────────────────────────────────────
  ORDER_COUNT_BELOW_MIN: {
    title: 'Keep ordering to unlock this reward!',
    detail: 'This code activates after {required} orders. You\u2019ve placed {actual} so far \u2014 {remaining} more to go!',
  },
  ORDER_COUNT_ABOVE_MAX: {
    title: 'This code was for your first few orders',
    detail: 'This promotion was available for your first {required} orders.',
  },

  // ─── Rule 10 — DOTW week ──────────────────────────────────────────────────
  WRONG_DELIVERY_WEEK: {
    title: 'This deal is for a different delivery week',
    detail: 'This Deal of the Week applies to the week of {requiredWeek}. Check the current week\u2019s deals!',
  },

  // ─── Apply-time errors (not from the 10-rule validator) ───────────────────
  // These are added by the apply service, not the validation service.
  // Extending the same error code type keeps the catalog unified.
} as Record<CouponValidationErrorCode, ErrorMessageEntry>;

/**
 * Resolve a validation error code + meta into customer-facing copy.
 *
 * Replaces {placeholder} tokens in the detail string with values from
 * meta. Unknown placeholders are left as-is (better to show "{required}"
 * than crash).
 */
export function getCouponErrorMessage(
  reason: CouponValidationErrorCode,
  meta?: CouponValidationErrorMeta,
): { title: string; detail: string } {
  const entry = ERROR_MESSAGES[reason] ?? {
    title: 'This code can\u2019t be applied',
    detail: 'Something went wrong. Please try again or contact support.',
  };

  let detail = entry.detail;

  if (meta) {
    // Standard numeric/date replacements
    if (meta.required !== undefined) {
      detail = detail.replace(/\{required\}/g, String(meta.required));
    }
    if (meta.actual !== undefined) {
      detail = detail.replace(/\{actual\}/g, String(meta.actual));
    }
    if (meta.shortfall !== undefined) {
      detail = detail.replace(/\{shortfall\}/g, meta.shortfall.toFixed(2));
    }

    // Computed: "remaining" for order count rules
    if (meta.required !== undefined && meta.actual !== undefined) {
      const remaining = Math.max(0, meta.required - meta.actual);
      detail = detail.replace(/\{remaining\}/g, String(remaining));
    }

    // Computed: "daysUntil" for MEMBER_TOO_NEW
    if (meta.required !== undefined && meta.actual !== undefined) {
      const daysUntil = Math.max(0, meta.required - meta.actual);
      detail = detail.replace(/\{daysUntil\}/g, String(daysUntil));
    }

    // Date formatting
    if (meta.startsAt) {
      detail = detail.replace(
        /\{startsAt\}/g,
        meta.startsAt.toLocaleDateString('en-CA', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      );
    }
    if (meta.expiredAt) {
      detail = detail.replace(
        /\{expiredAt\}/g,
        meta.expiredAt.toLocaleDateString('en-CA', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      );
    }
    if (meta.requiredWeek) {
      detail = detail.replace(
        /\{requiredWeek\}/g,
        meta.requiredWeek.toLocaleDateString('en-CA', {
          month: 'long',
          day: 'numeric',
        }),
      );
    }
  }

  return { title: entry.title, detail };
}
