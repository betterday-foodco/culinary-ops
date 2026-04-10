import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/commerce-client';
import { CommercePrismaService } from '../../prisma/commerce-prisma.service';

/**
 * CouponValidationService — the core coupon validator.
 *
 * Takes a cart + code and determines whether the code is valid for this
 * customer right now, returning either a successful result with a savings
 * preview or a structured error describing the failure reason + the
 * context a UI layer needs to render a helpful error message.
 *
 * DESIGN RULES:
 *
 * 1. Pure domain service. Does not mutate state. Does not persist anything
 *    to CustomerCoupon — that's the apply-coupon endpoint's job (Phase 1
 *    leaf 3). Safe to call repeatedly with the same inputs.
 *
 * 2. Input shape is intentionally NEUTRAL (`CouponValidationContext`). It
 *    does not take a `WeeklyCartRecord` or `CustomerOrder` directly — it
 *    takes a list of cart items + totals + customer id. This makes the
 *    same validator reusable for:
 *      (a) Live checkout flow — pass the current cart
 *      (b) Admin preview / "does this code work?" tool — pass a hypothetical
 *      (c) Auto-apply best-coupon engine — iterate eligible coupons and
 *          pick the highest `savings` value
 *
 * 3. Rule order matches project-scope/NEXT_UP.md. The 10 rules are checked
 *    in sequence and the FIRST failure short-circuits. This matters for
 *    UX: telling the customer "code expired" before "minimum not met" is
 *    friendlier than the reverse.
 *
 * 4. Error messages are NOT produced here. The `reason` + `meta` fields on
 *    a failure carry everything a UI needs to render a warm copy string,
 *    but the actual copy lives in `backend/src/commerce/coupons/
 *    error-messages.ts` (parallel side-project, Phase 1 track 2). A
 *    downstream consumer maps `reason` → customer-facing copy.
 *
 * 5. Household limits (`max_uses_per_household`) are a deferred feature
 *    per conner/deferred-decisions.md. When the field is null (the default
 *    for every coupon right now), the check is skipped. A best-effort
 *    implementation using raw street+zip matching is included for when
 *    the field is non-null; normalized address matching is a separate
 *    work item.
 *
 * 6. Savings preview is a NUMBER (not a Decimal). The authoritative
 *    write-time computation will go through Prisma Decimal arithmetic in
 *    the apply-coupon endpoint. The preview is for UI display and
 *    auto-apply scoring — both OK with JS number precision for cart-size
 *    amounts ($0 – $500).
 */
@Injectable()
export class CouponValidationService {
  private readonly logger = new Logger(CouponValidationService.name);

  constructor(private readonly commerce: CommercePrismaService) {}

  /**
   * Validate a coupon code against a cart + customer. Returns either
   * { valid: true, coupon, savings } or { valid: false, reason, meta? }.
   */
  async validate(
    context: CouponValidationContext,
  ): Promise<CouponValidationResult> {
    // Normalize code to uppercase, trimmed. Coupon.code is case-sensitive
    // in the schema, and we store codes uppercase by admin convention
    // ("WELCOME10"). Customer input may arrive as "welcome10" or
    // " WELCOME10 " — normalize before the lookup.
    const normalizedCode = context.code.trim().toUpperCase();

    // ─── Rule 1 — code exists + is_active ─────────────────────────────────
    const coupon = await this.commerce.coupon.findUnique({
      where: { code: normalizedCode },
      include: { tiers: { orderBy: { sort_order: 'asc' } } },
    });

    if (!coupon) {
      return fail('CODE_NOT_FOUND');
    }
    if (!coupon.is_active) {
      return fail('INACTIVE');
    }

    // ─── Rule 2 — date range ──────────────────────────────────────────────
    const now = context.now ?? new Date();
    if (coupon.starts_at && coupon.starts_at > now) {
      return fail('NOT_YET_ACTIVE', { startsAt: coupon.starts_at });
    }
    if (coupon.expires_at && coupon.expires_at < now) {
      return fail('EXPIRED', { expiredAt: coupon.expires_at });
    }

    // ─── Rule 3 — usage limits ────────────────────────────────────────────
    // 3a. Global cap — use the denormalized uses_count.
    if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
      return fail('GLOBAL_LIMIT_REACHED', {
        required: coupon.max_uses,
        actual: coupon.uses_count,
      });
    }

    // 3b. Per-customer cap — count this customer's applied + redeemed rows.
    if (coupon.max_uses_per_customer !== null) {
      const customerUses = await this.commerce.customerCoupon.count({
        where: {
          customer_id: context.customer_id,
          coupon_id: coupon.id,
          status: { in: ['applied', 'redeemed'] },
        },
      });
      if (customerUses >= coupon.max_uses_per_customer) {
        return fail('CUSTOMER_LIMIT_REACHED', {
          required: coupon.max_uses_per_customer,
          actual: customerUses,
        });
      }
    }

    // 3c. Per-household cap — best-effort raw address matching. Proper
    // normalization is deferred (see class docblock + deferred-decisions.md).
    // Skip silently when the field is null, which is the default.
    if (coupon.max_uses_per_household !== null) {
      const householdUses = await this.countHouseholdRedemptions(
        coupon.id,
        context.customer_id,
      );
      if (householdUses >= coupon.max_uses_per_household) {
        return fail('HOUSEHOLD_LIMIT_REACHED', {
          required: coupon.max_uses_per_household,
          actual: householdUses,
        });
      }
    }

    // ─── Rule 4 — order value thresholds ──────────────────────────────────
    if (coupon.min_order_value !== null) {
      const min = Number(coupon.min_order_value);
      if (context.cart_subtotal < min) {
        return fail('MIN_ORDER_NOT_MET', {
          required: min,
          actual: context.cart_subtotal,
          shortfall: +(min - context.cart_subtotal).toFixed(2),
        });
      }
    }
    if (coupon.max_order_value !== null) {
      const max = Number(coupon.max_order_value);
      if (context.cart_subtotal > max) {
        return fail('MAX_ORDER_EXCEEDED', {
          required: max,
          actual: context.cart_subtotal,
        });
      }
    }

    // ─── Rule 5 — product + category include / exclude ────────────────────
    // Semantics:
    //   include[] → at least one cart item must match (empty = no restriction)
    //   exclude[] → no cart item may match (empty = no restriction)
    const cartMealCodes = context.cart_items.map((i) => i.meal_code);
    const cartCategories = context.cart_items
      .map((i) => i.category)
      .filter((c): c is string => Boolean(c));

    if (coupon.product_include.length > 0) {
      const hit = cartMealCodes.some((c) => coupon.product_include.includes(c));
      if (!hit) {
        return fail('PRODUCT_NOT_IN_CART', {
          requiredCodes: coupon.product_include,
        });
      }
    }
    if (coupon.product_exclude.length > 0) {
      const conflict = cartMealCodes.find((c) =>
        coupon.product_exclude.includes(c),
      );
      if (conflict) {
        return fail('PRODUCT_EXCLUDED', { excludedCode: conflict });
      }
    }
    if (coupon.category_include.length > 0) {
      const hit = cartCategories.some((c) =>
        coupon.category_include.includes(c),
      );
      if (!hit) {
        return fail('CATEGORY_NOT_IN_CART', {
          requiredCategories: coupon.category_include,
        });
      }
    }
    if (coupon.category_exclude.length > 0) {
      const conflict = cartCategories.find((c) =>
        coupon.category_exclude.includes(c),
      );
      if (conflict) {
        return fail('CATEGORY_EXCLUDED', { excludedCategory: conflict });
      }
    }

    // ─── Rule 6 — email allowlist / blocklist ─────────────────────────────
    // Fetch customer up-front; needed for rules 6, 7, 8, and 9.
    const customer = await this.commerce.customer.findUnique({
      where: { id: context.customer_id },
      include: { subscription: true },
    });
    if (!customer) {
      // Defensive: if the customer doesn't exist, treat as not found. This
      // should never happen in practice because the caller already
      // authenticated.
      this.logger.warn(
        `Coupon validation: customer ${context.customer_id} not found`,
      );
      return fail('CODE_NOT_FOUND');
    }

    const customerEmail = customer.email.toLowerCase();
    if (
      coupon.allowed_emails.length > 0 &&
      !coupon.allowed_emails.map((e) => e.toLowerCase()).includes(customerEmail)
    ) {
      return fail('EMAIL_NOT_ALLOWED');
    }
    if (
      coupon.excluded_emails.length > 0 &&
      coupon.excluded_emails.map((e) => e.toLowerCase()).includes(customerEmail)
    ) {
      return fail('EMAIL_BLOCKED');
    }

    // ─── Rule 7 — customer segment targeting ──────────────────────────────
    if (coupon.target_customer_tags.length > 0) {
      const hit = customer.tags.some((t) =>
        coupon.target_customer_tags.includes(t),
      );
      if (!hit) {
        return fail('CUSTOMER_TAG_NOT_ALLOWED', {
          requiredTags: coupon.target_customer_tags,
        });
      }
    }
    if (coupon.exclude_customer_tags.length > 0) {
      const conflict = customer.tags.find((t) =>
        coupon.exclude_customer_tags.includes(t),
      );
      if (conflict) {
        return fail('CUSTOMER_TAG_EXCLUDED', { excludedTag: conflict });
      }
    }

    const lifetimeSpend = customer.subscription
      ? Number(customer.subscription.lifetime_spend)
      : 0;
    if (coupon.min_lifetime_spend !== null) {
      const min = Number(coupon.min_lifetime_spend);
      if (lifetimeSpend < min) {
        return fail('LIFETIME_SPEND_BELOW_MIN', {
          required: min,
          actual: lifetimeSpend,
        });
      }
    }
    if (coupon.max_lifetime_spend !== null) {
      const max = Number(coupon.max_lifetime_spend);
      if (lifetimeSpend > max) {
        return fail('LIFETIME_SPEND_ABOVE_MAX', {
          required: max,
          actual: lifetimeSpend,
        });
      }
    }

    if (
      coupon.min_member_since_days !== null ||
      coupon.max_member_since_days !== null
    ) {
      const memberDays = Math.floor(
        (now.getTime() - customer.member_since.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (
        coupon.min_member_since_days !== null &&
        memberDays < coupon.min_member_since_days
      ) {
        return fail('MEMBER_TOO_NEW', {
          required: coupon.min_member_since_days,
          actual: memberDays,
        });
      }
      if (
        coupon.max_member_since_days !== null &&
        memberDays > coupon.max_member_since_days
      ) {
        return fail('MEMBER_TOO_OLD', {
          required: coupon.max_member_since_days,
          actual: memberDays,
        });
      }
    }

    if (
      coupon.target_customer_statuses.length > 0 &&
      !coupon.target_customer_statuses.includes(customer.status)
    ) {
      return fail('STATUS_NOT_TARGETED', {
        requiredStatuses: coupon.target_customer_statuses,
      });
    }

    if (coupon.require_verified_email && !customer.email_verified) {
      return fail('EMAIL_NOT_VERIFIED');
    }

    // new_customers_only: customer must have zero non-cancelled orders.
    if (coupon.new_customers_only) {
      const completedCount = await this.countCompletedOrders(
        context.customer_id,
      );
      if (completedCount > 0) {
        return fail('NEW_CUSTOMERS_ONLY', { actual: completedCount });
      }
    }

    // ─── Rule 8 — subscription restriction ────────────────────────────────
    const hasActiveSub =
      customer.subscription?.status === 'active' ||
      customer.subscription?.status === 'paused';
    switch (coupon.subscription_restriction) {
      case 'none':
        break;
      case 'active_subscribers_only':
        if (!hasActiveSub) {
          return fail('REQUIRES_SUBSCRIPTION');
        }
        break;
      case 'new_subscribers_only':
        // Any existing Subscription row (even cancelled) disqualifies.
        if (customer.subscription) {
          return fail('NEW_SUBSCRIBERS_ONLY');
        }
        break;
      case 'non_subscribers_only':
        if (hasActiveSub) {
          return fail('NON_SUBSCRIBERS_ONLY');
        }
        break;
    }

    // ─── Rule 9 — order count restrictions ────────────────────────────────
    // Only query the order count if a rule actually needs it, to avoid an
    // unnecessary round trip on the common case.
    if (coupon.min_order_count !== null || coupon.max_order_count !== null) {
      const completedCount = await this.countCompletedOrders(
        context.customer_id,
      );
      if (
        coupon.min_order_count !== null &&
        completedCount < coupon.min_order_count
      ) {
        return fail('ORDER_COUNT_BELOW_MIN', {
          required: coupon.min_order_count,
          actual: completedCount,
        });
      }
      if (
        coupon.max_order_count !== null &&
        completedCount >= coupon.max_order_count
      ) {
        return fail('ORDER_COUNT_ABOVE_MAX', {
          required: coupon.max_order_count,
          actual: completedCount,
        });
      }
    }

    // ─── Rule 10 — DOTW delivery week match ───────────────────────────────
    // See project_dotw_preorder_rules memory for the full three-rule
    // explanation (week binding, visibility filter, cart price ceiling).
    // This is rule #1 of that three-rule set.
    if (coupon.purpose === 'deal_of_the_week') {
      if (!coupon.delivery_week_sunday) {
        // Config error: a DOTW coupon with no delivery_week_sunday set.
        // Admin UI should prevent this; log and fail closed.
        this.logger.warn(
          `DOTW coupon ${coupon.code} has purpose=deal_of_the_week but no delivery_week_sunday`,
        );
        return fail('WRONG_DELIVERY_WEEK');
      }
      if (!context.delivery_week_sunday) {
        // Caller did not supply a delivery week but the coupon requires
        // one. Fail closed — better to reject than silently accept.
        return fail('WRONG_DELIVERY_WEEK', {
          requiredWeek: coupon.delivery_week_sunday,
        });
      }
      if (
        !sameDateDay(coupon.delivery_week_sunday, context.delivery_week_sunday)
      ) {
        return fail('WRONG_DELIVERY_WEEK', {
          requiredWeek: coupon.delivery_week_sunday,
          actualWeek: context.delivery_week_sunday,
        });
      }
    }

    // ─── All rules passed — compute savings preview ───────────────────────
    const savings = this.computeSavings(coupon, context);

    return { valid: true, coupon, savings };
  }

  // ─── Savings preview ────────────────────────────────────────────────────
  // Determines the dollar amount the customer would save at the current
  // cart state. Used by both the UI (to render the discount line) and the
  // auto-apply engine (to rank candidates). NOT the source of truth for
  // the actual charged amount — that's re-computed at apply time.

  private computeSavings(
    coupon: CouponWithTiers,
    context: CouponValidationContext,
  ): number {
    // If a tier matches the cart subtotal, its discount_type + discount_value
    // override the base coupon values. Tiers are already sorted ascending by
    // sort_order. We want the HIGHEST tier whose min_spend is <= subtotal.
    const matchingTier = [...coupon.tiers]
      .reverse()
      .find((t) => context.cart_subtotal >= Number(t.min_spend));

    const effectiveType = matchingTier?.discount_type ?? coupon.type;
    const effectiveValue = Number(
      matchingTier?.discount_value ?? coupon.value,
    );

    // Narrow the applicable subtotal to include-listed items if the coupon
    // is product/category scoped. Also respect exclude_sale_items.
    const applicableSubtotal = this.computeApplicableSubtotal(coupon, context);

    let savings = 0;
    switch (effectiveType) {
      case 'percentage': {
        savings = applicableSubtotal * (effectiveValue / 100);
        if (coupon.max_discount_amount !== null) {
          savings = Math.min(savings, Number(coupon.max_discount_amount));
        }
        break;
      }
      case 'dollar_amount': {
        savings = Math.min(effectiveValue, applicableSubtotal);
        break;
      }
      case 'free_delivery': {
        // Delivery fee waiver is scored outside the cart subtotal. The
        // apply endpoint will zero out CustomerOrder.delivery_fee. For
        // the preview we report 0 — the UI renders "Free delivery"
        // separately.
        savings = 0;
        break;
      }
      case 'free_item': {
        // CouponAttachedProduct adds a line item to the cart at a
        // discount. Apply-time logic, not preview-time.
        savings = 0;
        break;
      }
    }
    return Math.round(savings * 100) / 100;
  }

  /**
   * The dollar amount of the cart that the discount applies to. For an
   * unscoped coupon, that's the full subtotal. For a product/category
   * scoped coupon, only the matching line items count. For a coupon
   * with exclude_sale_items=true, on-sale items are stripped first.
   */
  private computeApplicableSubtotal(
    coupon: CouponWithTiers,
    context: CouponValidationContext,
  ): number {
    const hasProductScope =
      coupon.product_include.length > 0 || coupon.product_exclude.length > 0;
    const hasCategoryScope =
      coupon.category_include.length > 0 || coupon.category_exclude.length > 0;

    if (!hasProductScope && !hasCategoryScope && !coupon.exclude_sale_items) {
      return context.cart_subtotal;
    }

    return context.cart_items.reduce((sum, item) => {
      if (coupon.exclude_sale_items && item.is_on_sale) return sum;
      if (
        coupon.product_include.length > 0 &&
        !coupon.product_include.includes(item.meal_code)
      ) {
        return sum;
      }
      if (coupon.product_exclude.includes(item.meal_code)) return sum;
      if (
        coupon.category_include.length > 0 &&
        (!item.category || !coupon.category_include.includes(item.category))
      ) {
        return sum;
      }
      if (item.category && coupon.category_exclude.includes(item.category)) {
        return sum;
      }
      return sum + item.price * item.quantity;
    }, 0);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Count orders that "consumed" a coupon slot from this customer. We
   * include any non-cancelled, non-refunded order because those represent
   * real transactions — pending orders count too, since they reserve the
   * discount.
   */
  private async countCompletedOrders(customerId: string): Promise<number> {
    return this.commerce.customerOrder.count({
      where: {
        customer_id: customerId,
        status: { notIn: ['cancelled', 'refunded'] },
      },
    });
  }

  /**
   * Best-effort household redemption count. Matches on raw lowercased
   * street + zip on the customer's default delivery address. Proper
   * address normalization (city aliases, "Apt" vs "#", etc) is a
   * separate work item — see conner/deferred-decisions.md "Household
   * limits" under Future ideas.
   *
   * Returns 0 if the customer has no default delivery address, which
   * conservatively lets the redemption through. This is the safer
   * failure mode for a customer-facing flow — we'd rather under-enforce
   * than bounce a legitimate customer because their profile is
   * incomplete.
   */
  private async countHouseholdRedemptions(
    couponId: string,
    customerId: string,
  ): Promise<number> {
    const defaultAddress = await this.commerce.customerAddress.findFirst({
      where: {
        customer_id: customerId,
        type: 'delivery',
        is_default: true,
      },
    });
    if (!defaultAddress) return 0;

    const street = defaultAddress.street.trim().toLowerCase();
    const zip = defaultAddress.zip.trim().toLowerCase();

    // Find all customer IDs whose default delivery address matches.
    const matchingAddresses = await this.commerce.customerAddress.findMany({
      where: {
        type: 'delivery',
        is_default: true,
        // Use Prisma's `equals` with `mode: 'insensitive'` for case
        // tolerance. `street` and `zip` are the two most reliable
        // matching fields — city/state often have input variance.
        street: { equals: street, mode: 'insensitive' },
        zip: { equals: zip, mode: 'insensitive' },
      },
      select: { customer_id: true },
    });
    const customerIds = matchingAddresses.map((a) => a.customer_id);
    if (customerIds.length === 0) return 0;

    return this.commerce.customerCoupon.count({
      where: {
        coupon_id: couponId,
        customer_id: { in: customerIds },
        status: { in: ['applied', 'redeemed'] },
      },
    });
  }
}

// ─── Public types ───────────────────────────────────────────────────────────

/**
 * A cart line item as the validator understands it. Intentionally
 * minimal — the validator doesn't need pictures or descriptions, just
 * the fields that affect rule evaluation.
 */
export interface CouponValidationCartItem {
  /** SKU / meal identifier, matched against Coupon.product_include/exclude */
  meal_code: string;
  /** Optional human-readable name, surfaced in error meta for UX copy */
  meal_name?: string;
  /** Category label (e.g. "entree", "snack"), matched against category lists */
  category?: string;
  quantity: number;
  /** Unit price in dollars — row subtotal is quantity * price */
  price: number;
  /** Marks items the admin flagged as on sale, respected by exclude_sale_items */
  is_on_sale?: boolean;
}

/**
 * Everything the validator needs to know about the cart and the context
 * the customer is ordering in. Deliberately decoupled from
 * WeeklyCartRecord / CustomerOrder so the same validator powers live
 * checkout, admin preview tools, and auto-apply ranking.
 */
export interface CouponValidationContext {
  /** The raw code the customer typed (will be normalized to uppercase) */
  code: string;
  /** The authenticated customer's id */
  customer_id: string;
  /** All cart line items at current state */
  cart_items: CouponValidationCartItem[];
  /** Pre-coupon subtotal in dollars */
  cart_subtotal: number;
  /**
   * Sunday of the delivery week this cart targets. Required for DOTW
   * coupon validation (rule 10). Missing is treated as "no delivery
   * week asserted" — DOTW coupons will reject, non-DOTW pass.
   */
  delivery_week_sunday?: Date;
  /**
   * Override for the current time, used by tests to simulate date-range
   * rule evaluation. Defaults to `new Date()`.
   */
  now?: Date;
}

/**
 * The coupon shape returned on a successful validation. Matches the
 * Prisma query (`include: { tiers: true }`) used in `validate`.
 */
export type CouponWithTiers = Prisma.CouponGetPayload<{
  include: { tiers: true };
}>;

/**
 * Discriminated union result. On success, `coupon` is the full Coupon
 * row (with tiers) so callers can pipe it straight into the apply
 * endpoint without re-querying. On failure, `reason` + `meta` carry
 * everything the error-messages catalog needs to render copy.
 */
export type CouponValidationResult =
  | {
      valid: true;
      coupon: CouponWithTiers;
      /** Dollar savings preview at current cart state (2dp) */
      savings: number;
    }
  | {
      valid: false;
      reason: CouponValidationErrorCode;
      meta?: CouponValidationErrorMeta;
    };

export type CouponValidationErrorCode =
  // Rule 1
  | 'CODE_NOT_FOUND'
  | 'INACTIVE'
  // Rule 2
  | 'NOT_YET_ACTIVE'
  | 'EXPIRED'
  // Rule 3
  | 'GLOBAL_LIMIT_REACHED'
  | 'CUSTOMER_LIMIT_REACHED'
  | 'HOUSEHOLD_LIMIT_REACHED'
  // Rule 4
  | 'MIN_ORDER_NOT_MET'
  | 'MAX_ORDER_EXCEEDED'
  // Rule 5
  | 'PRODUCT_NOT_IN_CART'
  | 'PRODUCT_EXCLUDED'
  | 'CATEGORY_NOT_IN_CART'
  | 'CATEGORY_EXCLUDED'
  // Rule 6
  | 'EMAIL_NOT_ALLOWED'
  | 'EMAIL_BLOCKED'
  // Rule 7
  | 'CUSTOMER_TAG_NOT_ALLOWED'
  | 'CUSTOMER_TAG_EXCLUDED'
  | 'LIFETIME_SPEND_BELOW_MIN'
  | 'LIFETIME_SPEND_ABOVE_MAX'
  | 'MEMBER_TOO_NEW'
  | 'MEMBER_TOO_OLD'
  | 'STATUS_NOT_TARGETED'
  | 'EMAIL_NOT_VERIFIED'
  | 'NEW_CUSTOMERS_ONLY'
  // Rule 8
  | 'REQUIRES_SUBSCRIPTION'
  | 'NEW_SUBSCRIBERS_ONLY'
  | 'NON_SUBSCRIBERS_ONLY'
  // Rule 9
  | 'ORDER_COUNT_BELOW_MIN'
  | 'ORDER_COUNT_ABOVE_MAX'
  // Rule 10
  | 'WRONG_DELIVERY_WEEK';

/**
 * Structured context attached to a failure. Every field is optional —
 * each error code populates only the fields relevant to it. The
 * error-messages catalog reads these to build warm copy like
 * "Add $4.37 more and this 10% kicks in."
 */
export interface CouponValidationErrorMeta {
  required?: number;
  actual?: number;
  shortfall?: number;
  mealNames?: string[];
  expiredAt?: Date;
  startsAt?: Date;
  requiredCodes?: string[];
  excludedCode?: string;
  requiredCategories?: string[];
  excludedCategory?: string;
  requiredTags?: string[];
  excludedTag?: string;
  requiredStatuses?: string[];
  requiredWeek?: Date;
  actualWeek?: Date;
}

// ─── Private helpers ────────────────────────────────────────────────────────

/**
 * Build a failure result. Thin helper to keep the validator body free of
 * repeated object-literal boilerplate.
 */
function fail(
  reason: CouponValidationErrorCode,
  meta?: CouponValidationErrorMeta,
): CouponValidationResult {
  return { valid: false, reason, ...(meta ? { meta } : {}) };
}

/**
 * Compare two dates by calendar day, ignoring time-of-day. Used for
 * delivery_week_sunday matching — the column is `@db.Date` (no time
 * component in Postgres), but Prisma hydrates it as a Date object with
 * a zeroed time, so the comparison needs to be day-precise and
 * timezone-robust.
 */
function sameDateDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
