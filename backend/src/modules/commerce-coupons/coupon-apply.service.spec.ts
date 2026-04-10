/**
 * NOTE: We cannot import CouponApplyService directly because it
 * transitively imports CommercePrismaService which imports from
 * @prisma/commerce-client — a generated package that may not exist
 * in fresh clones or CI. Instead we use jest.mock to stub the
 * commerce-prisma import, then require the service.
 */
jest.mock('../../prisma/commerce-prisma.service', () => ({
  CommercePrismaService: class MockCommercePrismaService {},
}));

import { CouponApplyService } from './coupon-apply.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Unit tests for CouponApplyService.
 *
 * Same approach as the validator tests: hand-rolled mocks, no DI container,
 * no real database. Each test covers one behavior path in the apply/remove
 * flow.
 *
 * Coverage:
 *   - Apply: happy path, validation failure passthrough, locked order rejection
 *   - Stacking: last-one-wins displaces non-stackable, stackable coexists
 *   - TOCTOU: coupon deactivated/expired/limit-hit between validate and apply
 *   - Remove: happy path, not-found, locked order
 *   - Validate preview: happy path, failure with error messages
 */

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<any> = {}): any {
  return {
    id: 'order-1',
    customer_id: 'cust-1',
    is_locked: false,
    subtotal: 100,
    subscriber_discount: 0,
    code_discount: 0,
    tax: 13,
    delivery_fee: 5,
    gift_card_amount: 0,
    points_redeemed: 0,
    total: 118,
    line_items: [
      { meal_code: 'CHKN-BOWL', name: 'Chicken Bowl', qty: 2, price_snapshot: 14.99, category: 'Entree' },
      { meal_code: 'SALM-RICE', name: 'Salmon Rice', qty: 1, price_snapshot: 16.99, category: 'Entree' },
    ],
    coupon_redemptions: [],
    subscription: null,
    ...overrides,
  };
}

function makeCoupon(overrides: Partial<any> = {}): any {
  return {
    id: 'coupon-1',
    code: 'SAVE10',
    name: '10% Off',
    type: 'percentage',
    value: 10,
    is_active: true,
    stackable: true,
    auto_apply: false,
    max_uses: null,
    uses_count: 0,
    expires_at: null,
    tiers: [],
    ...overrides,
  };
}

function makeCustomerCoupon(overrides: Partial<any> = {}): any {
  return {
    id: 'cc-1',
    customer_id: 'cust-1',
    coupon_id: 'coupon-1',
    status: 'applied',
    applied_at: new Date(),
    redeemed_order_id: 'order-1',
    coupon: makeCoupon(),
    ...overrides,
  };
}

// ─── Mock factories ──────────────────────────────────────────────────────────

function createMockCommerce() {
  const txFns: any = {};

  const mock = {
    customerOrder: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    customerCoupon: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ id: 'cc-new' }),
      update: jest.fn(),
    },
    coupon: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: any) => {
      // The transaction callback receives the same mock as `tx`.
      // This simplifies test setup — no need for a separate tx mock.
      return fn(mock);
    }),
  };

  return mock;
}

function createMockValidator() {
  return {
    validate: jest.fn(),
  };
}

function createService(commerce: any, validator: any) {
  return new CouponApplyService(commerce, validator);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CouponApplyService', () => {
  let commerce: ReturnType<typeof createMockCommerce>;
  let validator: ReturnType<typeof createMockValidator>;
  let service: CouponApplyService;

  beforeEach(() => {
    commerce = createMockCommerce();
    validator = createMockValidator();
    service = createService(commerce as any, validator as any);
  });

  // ─── Apply: happy path ──────────────────────────────────────────────────

  describe('applyCoupon', () => {
    it('applies a valid coupon and returns success with savings', async () => {
      const order = makeOrder();
      const coupon = makeCoupon();

      commerce.customerOrder.findUnique.mockResolvedValue(order);
      commerce.coupon.findUnique.mockResolvedValue(coupon);
      commerce.customerCoupon.findMany.mockResolvedValue([
        { id: 'cc-new', coupon: coupon, status: 'applied' },
      ]);
      validator.validate.mockResolvedValue({
        valid: true,
        coupon,
        savings: 10,
      });

      const result = await service.applyCoupon('cust-1', 'order-1', 'SAVE10');

      expect((result as any).success).toBe(true);
      expect((result as any).coupon_code).toBe('SAVE10');
      expect((result as any).savings).toBe(10);
      expect(commerce.customerCoupon.upsert).toHaveBeenCalled();
      expect(commerce.coupon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { uses_count: { increment: 1 } },
        }),
      );
    });

    // ─── Apply: validation failure passthrough ────────────────────────────

    it('returns structured error when validation fails', async () => {
      const order = makeOrder();
      commerce.customerOrder.findUnique.mockResolvedValue(order);
      validator.validate.mockResolvedValue({
        valid: false,
        reason: 'EXPIRED',
        meta: { expiredAt: new Date('2026-03-01') },
      });

      const result = await service.applyCoupon('cust-1', 'order-1', 'OLDCODE');

      expect((result as any).success).toBe(false);
      expect((result as any).reason).toBe('EXPIRED');
      expect((result as any).title).toBeDefined();
      expect((result as any).detail).toBeDefined();
    });

    // ─── Apply: order not found ───────────────────────────────────────────

    it('throws NotFoundException for missing order', async () => {
      commerce.customerOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.applyCoupon('cust-1', 'bad-order', 'SAVE10'),
      ).rejects.toThrow(NotFoundException);
    });

    // ─── Apply: wrong customer ────────────────────────────────────────────

    it('throws NotFoundException when order belongs to another customer', async () => {
      const order = makeOrder({ customer_id: 'cust-other' });
      commerce.customerOrder.findUnique.mockResolvedValue(order);

      await expect(
        service.applyCoupon('cust-1', 'order-1', 'SAVE10'),
      ).rejects.toThrow(NotFoundException);
    });

    // ─── Apply: locked order ──────────────────────────────────────────────

    it('throws BadRequestException for locked orders', async () => {
      const order = makeOrder({ is_locked: true });
      commerce.customerOrder.findUnique.mockResolvedValue(order);

      await expect(
        service.applyCoupon('cust-1', 'order-1', 'SAVE10'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Stacking ──────────────────────────────────────────────────────────

  describe('stacking — last one wins', () => {
    it('displaces a non-stackable existing coupon when new one is applied', async () => {
      const existingCoupon = makeCoupon({
        id: 'coupon-old',
        code: 'OLD20',
        stackable: false,
      });
      const existingCC = makeCustomerCoupon({
        id: 'cc-old',
        coupon_id: 'coupon-old',
        coupon: existingCoupon,
      });
      const order = makeOrder({ coupon_redemptions: [existingCC] });
      const newCoupon = makeCoupon({
        id: 'coupon-new',
        code: 'NEW15',
        stackable: false,
      });

      commerce.customerOrder.findUnique.mockResolvedValue(order);
      commerce.coupon.findUnique.mockResolvedValue(newCoupon);
      commerce.customerCoupon.findMany.mockResolvedValue([
        { id: 'cc-new', coupon: newCoupon, status: 'applied' },
      ]);
      validator.validate.mockResolvedValue({
        valid: true,
        coupon: newCoupon,
        savings: 15,
      });

      const result = await service.applyCoupon('cust-1', 'order-1', 'NEW15');

      expect((result as any).success).toBe(true);
      expect((result as any).displaced_coupons).toBe(1);
      // The old coupon should be reverted to 'available'
      expect(commerce.customerCoupon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cc-old' },
          data: expect.objectContaining({ status: 'available' }),
        }),
      );
    });

    it('allows stackable coupons to coexist', async () => {
      const existingCoupon = makeCoupon({
        id: 'coupon-old',
        code: 'STACK5',
        stackable: true,
      });
      const existingCC = makeCustomerCoupon({
        id: 'cc-old',
        coupon_id: 'coupon-old',
        coupon: existingCoupon,
      });
      const order = makeOrder({ coupon_redemptions: [existingCC] });
      const newCoupon = makeCoupon({
        id: 'coupon-new',
        code: 'STACK10',
        stackable: true,
      });

      commerce.customerOrder.findUnique.mockResolvedValue(order);
      commerce.coupon.findUnique.mockResolvedValue(newCoupon);
      commerce.customerCoupon.findMany.mockResolvedValue([
        { id: 'cc-old', coupon: existingCoupon, status: 'applied' },
        { id: 'cc-new', coupon: newCoupon, status: 'applied' },
      ]);
      validator.validate.mockResolvedValue({
        valid: true,
        coupon: newCoupon,
        savings: 10,
      });

      const result = await service.applyCoupon('cust-1', 'order-1', 'STACK10');

      expect((result as any).success).toBe(true);
      expect((result as any).displaced_coupons).toBe(0);
    });
  });

  // ─── TOCTOU ─────────────────────────────────────────────────────────────

  describe('TOCTOU protection', () => {
    it('rejects when coupon is deactivated between validate and apply', async () => {
      const order = makeOrder();
      const coupon = makeCoupon();

      commerce.customerOrder.findUnique.mockResolvedValue(order);
      validator.validate.mockResolvedValue({
        valid: true,
        coupon,
        savings: 10,
      });
      // Inside transaction, coupon is now deactivated
      commerce.coupon.findUnique.mockResolvedValue({
        ...coupon,
        is_active: false,
      });

      await expect(
        service.applyCoupon('cust-1', 'order-1', 'SAVE10'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when coupon hits global limit between validate and apply', async () => {
      const order = makeOrder();
      const coupon = makeCoupon({ max_uses: 100, uses_count: 99 });

      commerce.customerOrder.findUnique.mockResolvedValue(order);
      validator.validate.mockResolvedValue({
        valid: true,
        coupon,
        savings: 10,
      });
      // Inside transaction, someone else used the last slot
      commerce.coupon.findUnique.mockResolvedValue({
        ...coupon,
        uses_count: 100,
      });

      await expect(
        service.applyCoupon('cust-1', 'order-1', 'SAVE10'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when coupon expires between validate and apply', async () => {
      const order = makeOrder();
      const coupon = makeCoupon();

      commerce.customerOrder.findUnique.mockResolvedValue(order);
      validator.validate.mockResolvedValue({
        valid: true,
        coupon,
        savings: 10,
      });
      // Inside transaction, coupon has expired
      commerce.coupon.findUnique.mockResolvedValue({
        ...coupon,
        expires_at: new Date('2025-01-01'),
      });

      await expect(
        service.applyCoupon('cust-1', 'order-1', 'SAVE10'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── Remove ─────────────────────────────────────────────────────────────

  describe('removeCoupon', () => {
    it('removes an applied coupon and decrements uses_count', async () => {
      const coupon = makeCoupon();
      const cc = makeCustomerCoupon({ coupon });
      const order = makeOrder({ coupon_redemptions: [cc] });

      commerce.customerOrder.findUnique.mockResolvedValue(order);

      const result = await service.removeCoupon('cust-1', 'order-1', 'cc-1');

      expect(result.success).toBe(true);
      expect(result.removed_code).toBe('SAVE10');
      expect(commerce.customerCoupon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cc-1' },
          data: expect.objectContaining({ status: 'available' }),
        }),
      );
      expect(commerce.coupon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { uses_count: { decrement: 1 } },
        }),
      );
    });

    it('throws NotFoundException when CustomerCoupon is not on the order', async () => {
      const order = makeOrder({ coupon_redemptions: [] });
      commerce.customerOrder.findUnique.mockResolvedValue(order);

      await expect(
        service.removeCoupon('cust-1', 'order-1', 'cc-nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for locked orders', async () => {
      const order = makeOrder({ is_locked: true });
      commerce.customerOrder.findUnique.mockResolvedValue(order);

      await expect(
        service.removeCoupon('cust-1', 'order-1', 'cc-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Validate preview ──────────────────────────────────────────────────

  describe('validatePreview', () => {
    it('returns savings preview without mutating anything', async () => {
      const order = makeOrder();
      const coupon = makeCoupon();

      commerce.customerOrder.findUnique.mockResolvedValue(order);
      validator.validate.mockResolvedValue({
        valid: true,
        coupon,
        savings: 10,
      });

      const result = await service.validatePreview(
        'cust-1',
        'order-1',
        'SAVE10',
      );

      expect((result as any).valid).toBe(true);
      expect((result as any).savings).toBe(10);
      // No mutations should have happened
      expect(commerce.customerCoupon.upsert).not.toHaveBeenCalled();
      expect(commerce.coupon.update).not.toHaveBeenCalled();
    });

    it('returns customer-facing error messages on failure', async () => {
      const order = makeOrder();
      commerce.customerOrder.findUnique.mockResolvedValue(order);
      validator.validate.mockResolvedValue({
        valid: false,
        reason: 'MIN_ORDER_NOT_MET',
        meta: { required: 50, actual: 30, shortfall: 20 },
      });

      const result = await service.validatePreview(
        'cust-1',
        'order-1',
        'BIG50',
      );

      expect((result as any).valid).toBe(false);
      expect((result as any).reason).toBe('MIN_ORDER_NOT_MET');
      expect((result as any).title).toBeDefined();
      expect((result as any).detail).toContain('20.00');
    });
  });
});
