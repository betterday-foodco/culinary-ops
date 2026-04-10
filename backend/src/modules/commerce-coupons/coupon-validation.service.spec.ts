import {
  CouponValidationService,
  CouponValidationContext,
  CouponValidationResult,
} from './coupon-validation.service';

/**
 * Unit tests for CouponValidationService.
 *
 * These are PURE unit tests: the validator is instantiated directly with a
 * hand-rolled mock CommercePrismaService. No NestJS DI container, no real
 * database, no @nestjs/testing module. That keeps the tests fast (<100ms
 * total) and keeps the failure messages pointing at business logic instead
 * of test-harness plumbing.
 *
 * Each test covers ONE rule path in the validator. The rule order in the
 * describe() blocks matches the rule order in coupon-validation.service.ts,
 * which in turn matches project-scope/NEXT_UP.md.
 *
 * Coverage of the 10 rules from NEXT_UP.md:
 *   Rule 1 — code exists + is_active        → CODE_NOT_FOUND, INACTIVE
 *   Rule 2 — date range                     → NOT_YET_ACTIVE, EXPIRED
 *   Rule 3 — usage limits                   → GLOBAL_LIMIT_REACHED, CUSTOMER_LIMIT_REACHED
 *   Rule 4 — order value thresholds         → MIN_ORDER_NOT_MET (+ shortfall meta), MAX_ORDER_EXCEEDED
 *   Rule 5 — product + category include/exclude → PRODUCT_NOT_IN_CART, PRODUCT_EXCLUDED, CATEGORY_NOT_IN_CART, CATEGORY_EXCLUDED
 *   Rule 6 — email allow/block              → EMAIL_NOT_ALLOWED, EMAIL_BLOCKED
 *   Rule 7 — customer segment               → NEW_CUSTOMERS_ONLY, STATUS_NOT_TARGETED, EMAIL_NOT_VERIFIED
 *   Rule 8 — subscription restriction       → REQUIRES_SUBSCRIPTION
 *   Rule 9 — order count restrictions       → ORDER_COUNT_BELOW_MIN
 *   Rule 10 — DOTW delivery week match      → WRONG_DELIVERY_WEEK
 *   Success — happy path + savings previews + normalization
 *
 * Household limit (max_uses_per_household) is deliberately NOT covered
 * here — the rule is behind a null-default flag and the proper
 * normalization is tracked as a deferred item in
 * conner/deferred-decisions.md.
 *
 * NOTE on discriminant narrowing: `tsconfig.json` has `strictNullChecks:
 * false`, which prevents TypeScript from narrowing `CouponValidationResult`
 * via `if (result.valid)`. The `expectFailure` / `expectSuccess` helpers
 * below convert the union into an explicit type assertion via return-type
 * annotation, which DOES work in non-strict mode. They also throw with a
 * useful message if the actual result doesn't match the expected shape —
 * which helps failing tests report *why* they failed instead of a cryptic
 * "cannot read property 'reason' of undefined".
 */

// ─── Type-safe assertion helpers ──────────────────────────────────────────

type Failure = Extract<CouponValidationResult, { valid: false }>;
type Success = Extract<CouponValidationResult, { valid: true }>;

function expectFailure(r: CouponValidationResult): Failure {
  if ((r as Success).valid) {
    const s = r as Success;
    throw new Error(
      `Expected validation failure but got success: savings=${s.savings}, code=${s.coupon.code}`,
    );
  }
  return r as Failure;
}

function expectSuccess(r: CouponValidationResult): Success {
  if (!(r as Success).valid) {
    const f = r as Failure;
    throw new Error(
      `Expected validation success but got failure: reason=${f.reason}`,
    );
  }
  return r as Success;
}

// ─── Mock CommercePrismaService ────────────────────────────────────────────
// Builds a fresh mock with jest.fn() for every method the validator calls.
// Each test overrides only the return values it cares about. Anything the
// test doesn't override will return the default (null / 0 / []) — safe
// "no rows / no restrictions" defaults that don't accidentally trip rules
// not under test.

function createMockCommerce() {
  return {
    coupon: {
      findUnique: jest.fn(),
    },
    customer: {
      findUnique: jest.fn(),
    },
    customerCoupon: {
      count: jest.fn().mockResolvedValue(0),
    },
    customerOrder: {
      count: jest.fn().mockResolvedValue(0),
    },
    customerAddress: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

// ─── Fixture factories ────────────────────────────────────────────────────
// Each factory returns a "baseline valid" object where the default values
// pass every rule. Individual tests spread overrides to flip one field at a
// time, which makes the failure mode of each test unambiguous.

function makeCoupon(overrides: Partial<any> = {}): any {
  return {
    id: 'coupon-1',
    code: 'TEST10',
    name: 'Test 10% Off',
    description: null,
    display_message: null,

    purpose: 'manual',
    category: 'manual',
    tags: [],

    type: 'percentage',
    value: 10,
    max_discount_amount: null,
    includes_free_delivery: false,

    min_order_value: null,
    max_order_value: null,

    starts_at: null,
    expires_at: null,
    rolling_expiry_days: null,

    max_uses: null,
    max_uses_per_customer: null,
    max_uses_per_household: null,
    uses_count: 0,

    is_active: true,
    is_personal: false,
    new_customers_only: false,
    exclude_sale_items: false,
    auto_apply: false,
    stackable: true,
    show_as_clippable: false,
    show_in_order_confirmation: false,
    require_verified_email: false,

    subscription_restriction: 'none',
    min_order_count: null,
    max_order_count: null,

    allowed_emails: [],
    excluded_emails: [],

    product_include: [],
    product_exclude: [],
    category_include: [],
    category_exclude: [],

    target_customer_tags: [],
    exclude_customer_tags: [],
    min_lifetime_spend: null,
    max_lifetime_spend: null,
    min_member_since_days: null,
    max_member_since_days: null,
    target_customer_statuses: [],

    buy_qty: null,
    get_qty: null,
    get_discount_pct: null,

    delivery_week_sunday: null,

    referrer_customer_id: null,
    referrer_credit: null,
    referrer_credit_type: null,

    cost_per_redemption: null,
    customer_facing_error_override: null,

    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),

    // Relations loaded via include: { tiers: true }
    tiers: [],

    ...overrides,
  };
}

function makeCustomer(overrides: Partial<any> = {}): any {
  return {
    id: 'customer-1',
    display_id: 'BD-C-00001',
    email: 'test@example.com',
    phone: null,
    first_name: 'Test',
    last_name: 'Customer',
    birthday: null,
    member_since: new Date('2025-01-01'),

    status: 'active',
    source: 'signup',

    apple_id_sub: null,
    google_id_sub: null,

    email_verified: true,
    email_verified_at: new Date('2025-01-01'),
    phone_verified: false,
    phone_verified_at: null,

    helcim_customer_id: null,

    sms_opt_in: true,
    email_opt_in: true,

    allergens: [],
    diet_tags: [],
    disliked_meals: [],
    favorite_meals: [],

    points_balance: 0,

    internal_notes: null,
    tags: [],
    last_contacted_at: null,
    flagged: false,
    flagged_reason: null,

    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    last_login_at: null,

    // Relation loaded via include: { subscription: true }
    subscription: null,

    ...overrides,
  };
}

function makeContext(
  overrides: Partial<CouponValidationContext> = {},
): CouponValidationContext {
  return {
    code: 'TEST10',
    customer_id: 'customer-1',
    cart_items: [
      {
        meal_code: 'MEAL-A',
        meal_name: 'Grilled Chicken',
        category: 'entree',
        quantity: 2,
        price: 15,
      },
    ],
    cart_subtotal: 30,
    now: new Date('2026-04-09T12:00:00Z'),
    ...overrides,
  };
}

// ─── Test harness bootstrap ────────────────────────────────────────────────

function setup() {
  const mockCommerce = createMockCommerce();
  const service = new CouponValidationService(mockCommerce as any);
  return { service, mockCommerce };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('CouponValidationService', () => {
  describe('Rule 1 — code exists + is_active', () => {
    it('returns CODE_NOT_FOUND when findUnique returns null', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(null);

      const result = await service.validate(makeContext({ code: 'NOPE' }));

      expect(expectFailure(result).reason).toBe('CODE_NOT_FOUND');
      // The findUnique call should have received the normalized (uppercased, trimmed) code
      expect(mockCommerce.coupon.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'NOPE' } }),
      );
    });

    it('returns INACTIVE when is_active=false', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ is_active: false }),
      );

      const result = await service.validate(makeContext());

      expect(expectFailure(result).reason).toBe('INACTIVE');
    });
  });

  describe('Rule 2 — date range', () => {
    it('returns NOT_YET_ACTIVE when starts_at is in the future', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ starts_at: new Date('2026-05-01') }),
      );

      const result = await service.validate(
        makeContext({ now: new Date('2026-04-09') }),
      );

      const failure = expectFailure(result);
      expect(failure.reason).toBe('NOT_YET_ACTIVE');
      expect(failure.meta?.startsAt).toEqual(new Date('2026-05-01'));
    });

    it('returns EXPIRED when expires_at is in the past', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ expires_at: new Date('2026-01-01') }),
      );

      const result = await service.validate(
        makeContext({ now: new Date('2026-04-09') }),
      );

      const failure = expectFailure(result);
      expect(failure.reason).toBe('EXPIRED');
      expect(failure.meta?.expiredAt).toEqual(new Date('2026-01-01'));
    });
  });

  describe('Rule 3 — usage limits', () => {
    it('returns GLOBAL_LIMIT_REACHED when uses_count >= max_uses', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ max_uses: 100, uses_count: 100 }),
      );

      const result = await service.validate(makeContext());

      expect(expectFailure(result).reason).toBe('GLOBAL_LIMIT_REACHED');
    });

    it('returns CUSTOMER_LIMIT_REACHED when per-customer cap hit', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ max_uses_per_customer: 1 }),
      );
      mockCommerce.customerCoupon.count.mockResolvedValue(1);

      const result = await service.validate(makeContext());

      expect(expectFailure(result).reason).toBe('CUSTOMER_LIMIT_REACHED');
    });
  });

  describe('Rule 4 — order value thresholds', () => {
    it('returns MIN_ORDER_NOT_MET with shortfall meta', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ min_order_value: 50 }),
      );

      const result = await service.validate(
        makeContext({ cart_subtotal: 45.63 }),
      );

      const failure = expectFailure(result);
      expect(failure.reason).toBe('MIN_ORDER_NOT_MET');
      expect(failure.meta?.required).toBe(50);
      expect(failure.meta?.actual).toBe(45.63);
      expect(failure.meta?.shortfall).toBeCloseTo(4.37, 2);
    });

    it('returns MAX_ORDER_EXCEEDED when cart over max_order_value', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ max_order_value: 100 }),
      );

      const result = await service.validate(
        makeContext({ cart_subtotal: 150 }),
      );

      expect(expectFailure(result).reason).toBe('MAX_ORDER_EXCEEDED');
    });
  });

  describe('Rule 5 — product + category include/exclude', () => {
    it('returns PRODUCT_NOT_IN_CART when product_include has no match', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ product_include: ['MEAL-Z'] }),
      );

      const result = await service.validate(makeContext());

      expect(expectFailure(result).reason).toBe('PRODUCT_NOT_IN_CART');
    });

    it('returns PRODUCT_EXCLUDED when cart contains an excluded product', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ product_exclude: ['MEAL-A'] }),
      );

      const result = await service.validate(makeContext());

      const failure = expectFailure(result);
      expect(failure.reason).toBe('PRODUCT_EXCLUDED');
      expect(failure.meta?.excludedCode).toBe('MEAL-A');
    });

    it('returns CATEGORY_NOT_IN_CART when category_include has no match', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ category_include: ['dessert'] }),
      );

      const result = await service.validate(makeContext());

      expect(expectFailure(result).reason).toBe('CATEGORY_NOT_IN_CART');
    });

    it('returns CATEGORY_EXCLUDED when cart contains an excluded category', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ category_exclude: ['entree'] }),
      );

      const result = await service.validate(makeContext());

      expect(expectFailure(result).reason).toBe('CATEGORY_EXCLUDED');
    });
  });

  describe('Rule 6 — email allow/block', () => {
    it('returns EMAIL_NOT_ALLOWED when customer email not on allowed_emails', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ allowed_emails: ['vip@example.com'] }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(
        makeCustomer({ email: 'test@example.com' }),
      );

      const result = await service.validate(makeContext());

      expect(expectFailure(result).reason).toBe('EMAIL_NOT_ALLOWED');
    });

    it('returns EMAIL_BLOCKED when customer email on excluded_emails (case-insensitive)', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ excluded_emails: ['TEST@example.com'] }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(
        makeCustomer({ email: 'test@example.com' }),
      );

      const result = await service.validate(makeContext());

      expect(expectFailure(result).reason).toBe('EMAIL_BLOCKED');
    });
  });

  describe('Rule 7 — customer segment', () => {
    it('returns NEW_CUSTOMERS_ONLY when customer has prior orders', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ new_customers_only: true }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(makeCustomer());
      mockCommerce.customerOrder.count.mockResolvedValue(3);

      const result = await service.validate(makeContext());

      const failure = expectFailure(result);
      expect(failure.reason).toBe('NEW_CUSTOMERS_ONLY');
      expect(failure.meta?.actual).toBe(3);
    });

    it('returns STATUS_NOT_TARGETED when customer status not in target list', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ target_customer_statuses: ['paused_indefinite'] }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(
        makeCustomer({ status: 'active' }),
      );

      const result = await service.validate(makeContext());

      expect(expectFailure(result).reason).toBe('STATUS_NOT_TARGETED');
    });

    it('returns EMAIL_NOT_VERIFIED when require_verified_email=true and email_verified=false', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ require_verified_email: true }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(
        makeCustomer({ email_verified: false }),
      );

      const result = await service.validate(makeContext());

      expect(expectFailure(result).reason).toBe('EMAIL_NOT_VERIFIED');
    });
  });

  describe('Rule 8 — subscription restriction', () => {
    it('returns REQUIRES_SUBSCRIPTION when active_subscribers_only and customer has none', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ subscription_restriction: 'active_subscribers_only' }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(
        makeCustomer({ subscription: null }),
      );

      const result = await service.validate(makeContext());

      expect(expectFailure(result).reason).toBe('REQUIRES_SUBSCRIPTION');
    });
  });

  describe('Rule 9 — order count restrictions', () => {
    it('returns ORDER_COUNT_BELOW_MIN when customer has fewer than min_order_count orders', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ min_order_count: 5 }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(makeCustomer());
      mockCommerce.customerOrder.count.mockResolvedValue(2);

      const result = await service.validate(makeContext());

      const failure = expectFailure(result);
      expect(failure.reason).toBe('ORDER_COUNT_BELOW_MIN');
      expect(failure.meta?.required).toBe(5);
      expect(failure.meta?.actual).toBe(2);
    });
  });

  describe('Rule 10 — DOTW delivery week match', () => {
    it('returns WRONG_DELIVERY_WEEK when DOTW coupon week does not match cart week', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({
          purpose: 'deal_of_the_week',
          delivery_week_sunday: new Date('2026-04-12'),
        }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(makeCustomer());

      const result = await service.validate(
        makeContext({ delivery_week_sunday: new Date('2026-04-19') }),
      );

      const failure = expectFailure(result);
      expect(failure.reason).toBe('WRONG_DELIVERY_WEEK');
      expect(failure.meta?.requiredWeek).toEqual(new Date('2026-04-12'));
    });

    it('accepts a DOTW coupon when delivery weeks match', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({
          purpose: 'deal_of_the_week',
          delivery_week_sunday: new Date('2026-04-12'),
          value: 20,
        }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(makeCustomer());

      const result = await service.validate(
        makeContext({
          delivery_week_sunday: new Date('2026-04-12'),
          cart_subtotal: 100,
        }),
      );

      expect(expectSuccess(result).savings).toBe(20); // 20% of $100
    });
  });

  describe('Success path — savings preview', () => {
    it('computes percentage savings on full subtotal when coupon is unscoped', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ value: 10 }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(makeCustomer());

      const result = await service.validate(
        makeContext({ cart_subtotal: 80 }),
      );

      const success = expectSuccess(result);
      expect(success.savings).toBe(8); // 10% of $80
      expect(success.coupon.code).toBe('TEST10');
    });

    it('caps percentage savings at max_discount_amount', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ value: 50, max_discount_amount: 15 }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(makeCustomer());

      const result = await service.validate(
        makeContext({ cart_subtotal: 100 }),
      );

      expect(expectSuccess(result).savings).toBe(15); // capped, not 50
    });

    it('computes dollar_amount savings clamped to cart subtotal', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ type: 'dollar_amount', value: 20 }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(makeCustomer());

      const result = await service.validate(
        makeContext({ cart_subtotal: 12 }),
      );

      expect(expectSuccess(result).savings).toBe(12); // clamped to subtotal
    });

    it('uses the highest matching CouponTier override', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({
          type: 'percentage',
          value: 5, // base — should be ignored in favor of matching tier
          tiers: [
            {
              id: 't1',
              coupon_id: 'coupon-1',
              min_spend: 50,
              discount_type: 'percentage',
              discount_value: 10,
              includes_free_delivery: false,
              sort_order: 1,
              created_at: new Date(),
            },
            {
              id: 't2',
              coupon_id: 'coupon-1',
              min_spend: 100,
              discount_type: 'percentage',
              discount_value: 20,
              includes_free_delivery: false,
              sort_order: 2,
              created_at: new Date(),
            },
          ],
        }),
      );
      mockCommerce.customer.findUnique.mockResolvedValue(makeCustomer());

      const result = await service.validate(
        makeContext({ cart_subtotal: 120 }),
      );

      expect(expectSuccess(result).savings).toBe(24); // 20% tier matched, 5% base ignored
    });

    it('normalizes input code to uppercase+trimmed before lookup', async () => {
      const { service, mockCommerce } = setup();
      mockCommerce.coupon.findUnique.mockResolvedValue(makeCoupon());
      mockCommerce.customer.findUnique.mockResolvedValue(makeCustomer());

      await service.validate(makeContext({ code: '  test10  ' }));

      expect(mockCommerce.coupon.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'TEST10' } }),
      );
    });
  });
});
