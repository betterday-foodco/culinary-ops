/**
 * Stub the commerce-prisma import so we don't need a generated
 * @prisma/commerce-client to run these tests.
 */
jest.mock('../../prisma/commerce-prisma.service', () => ({
  CommercePrismaService: class MockCommercePrismaService {},
}));

import { CouponAdminService } from './coupon-admin.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

/**
 * Unit tests for CouponAdminService.
 *
 * Hand-rolled mocks, no DI container, no database. Same pattern as the
 * coupon-apply and coupon-validation test suites.
 *
 * Coverage:
 *   - List: pagination, filters, search, sorting
 *   - Create: happy path, duplicate code, validation rules
 *   - Update: happy path, code conflict, warnings on used coupons
 *   - Archive: happy path, already archived, revokes applied coupons
 *   - GetById: happy path, not found
 */

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeCoupon(overrides: Partial<any> = {}): any {
  return {
    id: 'coupon-1',
    code: 'SAVE10',
    name: '10% Off',
    type: 'percentage',
    value: 10,
    is_active: true,
    uses_count: 0,
    purpose: 'manual',
    category: 'manual',
    created_at: new Date('2026-04-01'),
    tiers: [],
    ...overrides,
  };
}

// ─── Mock factory ────────────────────────────────────────────────────────────

function createMockCommerce() {
  return {
    coupon: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'new-coupon',
        ...data,
        uses_count: 0,
        is_active: true,
        created_at: new Date(),
      })),
      update: jest.fn().mockImplementation(({ where, data }) => ({
        id: where.id,
        ...makeCoupon(),
        ...data,
      })),
    },
    customerCoupon: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(async (args: any) => {
      // Support both callback and array transaction styles
      if (Array.isArray(args)) {
        return Promise.all(args);
      }
      return args;
    }),
  };
}

function createService(commerce: any) {
  return new CouponAdminService(commerce);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CouponAdminService', () => {
  let commerce: ReturnType<typeof createMockCommerce>;
  let service: CouponAdminService;

  beforeEach(() => {
    commerce = createMockCommerce();
    service = createService(commerce as any);
  });

  // ─── LIST ──────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns paginated results with defaults', async () => {
      const coupons = [makeCoupon(), makeCoupon({ id: 'coupon-2', code: 'SAVE20' })];
      commerce.coupon.findMany.mockResolvedValue(coupons);
      commerce.coupon.count.mockResolvedValue(2);

      const result = await service.list({});

      expect(result.ok).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
      expect(result.total_pages).toBe(1);

      // Check skip/take was called correctly
      expect(commerce.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 25 }),
      );
    });

    it('applies page and limit correctly', async () => {
      commerce.coupon.findMany.mockResolvedValue([]);
      commerce.coupon.count.mockResolvedValue(75);

      const result = await service.list({ page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.total_pages).toBe(8);
      expect(commerce.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('filters by is_active', async () => {
      commerce.coupon.findMany.mockResolvedValue([]);
      commerce.coupon.count.mockResolvedValue(0);

      await service.list({ is_active: true });

      expect(commerce.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ is_active: true }),
        }),
      );
    });

    it('filters by purpose', async () => {
      commerce.coupon.findMany.mockResolvedValue([]);
      commerce.coupon.count.mockResolvedValue(0);

      await service.list({ purpose: 'deal_of_the_week' as any });

      expect(commerce.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ purpose: 'deal_of_the_week' }),
        }),
      );
    });

    it('applies text search across code + name', async () => {
      commerce.coupon.findMany.mockResolvedValue([]);
      commerce.coupon.count.mockResolvedValue(0);

      await service.list({ search: 'summer' });

      const call = commerce.coupon.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { code: { contains: 'summer', mode: 'insensitive' } },
        { name: { contains: 'summer', mode: 'insensitive' } },
      ]);
    });

    it('applies sorting', async () => {
      commerce.coupon.findMany.mockResolvedValue([]);
      commerce.coupon.count.mockResolvedValue(0);

      await service.list({ sort_by: 'uses_count', sort_dir: 'asc' });

      expect(commerce.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { uses_count: 'asc' },
        }),
      );
    });
  });

  // ─── GET BY ID ─────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns a coupon by id', async () => {
      commerce.coupon.findUnique.mockResolvedValue(makeCoupon());

      const result = await service.getById('coupon-1');

      expect(result.ok).toBe(true);
      expect(result.coupon.code).toBe('SAVE10');
    });

    it('throws NotFoundException for missing coupon', async () => {
      commerce.coupon.findUnique.mockResolvedValue(null);

      await expect(service.getById('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── CREATE ────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a coupon with normalized uppercase code', async () => {
      commerce.coupon.findUnique.mockResolvedValue(null); // no conflict

      const result = await service.create({
        code: '  summer20  ',
        name: 'Summer Sale',
        type: 'percentage' as any,
        value: 20,
      });

      expect(result.ok).toBe(true);
      expect(commerce.coupon.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'SUMMER20',
            name: 'Summer Sale',
            type: 'percentage',
            value: 20,
          }),
        }),
      );
    });

    it('rejects duplicate code', async () => {
      commerce.coupon.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({
          code: 'SAVE10',
          name: 'Duplicate',
          type: 'percentage' as any,
          value: 10,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects percentage value over 100', async () => {
      commerce.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          code: 'BAD',
          name: 'Bad Pct',
          type: 'percentage' as any,
          value: 150,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects percentage value under 1', async () => {
      commerce.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          code: 'BAD',
          name: 'Bad Pct',
          type: 'percentage' as any,
          value: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects past expiry date', async () => {
      commerce.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          code: 'OLD',
          name: 'Old',
          type: 'dollar_amount' as any,
          value: 5,
          expires_at: '2020-01-01T00:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects start date after expiry', async () => {
      commerce.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          code: 'BACKWARD',
          name: 'Backward Dates',
          type: 'dollar_amount' as any,
          value: 5,
          starts_at: '2027-06-01T00:00:00Z',
          expires_at: '2027-01-01T00:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects incomplete BOGO fields', async () => {
      commerce.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          code: 'BOGO',
          name: 'Bad BOGO',
          type: 'free_item' as any,
          value: 1,
          buy_qty: 2,
          // missing get_qty and get_discount_pct
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-Sunday delivery_week_sunday', async () => {
      commerce.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          code: 'DOTW1',
          name: 'Deal',
          type: 'percentage' as any,
          value: 15,
          delivery_week_sunday: '2026-04-14T00:00:00Z', // Tuesday
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a full-featured coupon with all optional fields', async () => {
      commerce.coupon.findUnique.mockResolvedValue(null);

      await service.create({
        code: 'FULL',
        name: 'Full Coupon',
        type: 'dollar_amount' as any,
        value: 10,
        description: 'Internal desc',
        display_message: 'Save $10!',
        purpose: 'welcome' as any,
        category: 'intro' as any,
        tags: ['spring2026'],
        max_discount_amount: 50,
        min_order_value: 25,
        max_uses: 500,
        max_uses_per_customer: 1,
        starts_at: '2026-05-01T00:00:00Z',
        expires_at: '2026-07-01T00:00:00Z',
        new_customers_only: true,
        stackable: false,
        product_include: ['CHKN-BOWL'],
      });

      expect(commerce.coupon.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'FULL',
            description: 'Internal desc',
            purpose: 'welcome',
            tags: ['spring2026'],
            min_order_value: 25,
            new_customers_only: true,
            stackable: false,
            product_include: ['CHKN-BOWL'],
          }),
        }),
      );
    });
  });

  // ─── UPDATE ────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates a coupon and returns no warnings if unused', async () => {
      commerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ uses_count: 0 }),
      );

      const result = await service.update('coupon-1', {
        name: 'Updated Name',
        value: 15,
      });

      expect(result.ok).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(commerce.coupon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'coupon-1' },
          data: expect.objectContaining({ name: 'Updated Name', value: 15 }),
        }),
      );
    });

    it('returns warnings when changing value on a used coupon', async () => {
      commerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ uses_count: 42 }),
      );

      const result = await service.update('coupon-1', { value: 20 });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('42');
    });

    it('returns warnings when changing type on a used coupon', async () => {
      commerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ uses_count: 10 }),
      );

      const result = await service.update('coupon-1', {
        type: 'dollar_amount' as any,
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('discount type');
    });

    it('returns warnings when changing code on a used coupon', async () => {
      commerce.coupon.findUnique
        .mockResolvedValueOnce(makeCoupon({ uses_count: 5 })) // existing lookup
        .mockResolvedValueOnce(null); // code uniqueness check

      const result = await service.update('coupon-1', { code: 'NEWCODE' });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('bookmarked');
    });

    it('rejects code conflict on update', async () => {
      commerce.coupon.findUnique
        .mockResolvedValueOnce(makeCoupon()) // existing lookup
        .mockResolvedValueOnce({ id: 'other-coupon' }); // conflict

      await expect(
        service.update('coupon-1', { code: 'TAKEN' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException for missing coupon', async () => {
      commerce.coupon.findUnique.mockResolvedValue(null);

      await expect(
        service.update('bad-id', { name: 'Nope' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects non-Sunday delivery_week_sunday', async () => {
      commerce.coupon.findUnique.mockResolvedValue(makeCoupon());

      await expect(
        service.update('coupon-1', {
          delivery_week_sunday: '2026-04-14T00:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('locks delivery_week_sunday on a used DOTW coupon', async () => {
      commerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({
          uses_count: 50,
          delivery_week_sunday: new Date('2026-04-19T00:00:00Z'),
        }),
      );

      await expect(
        service.update('coupon-1', {
          delivery_week_sunday: '2026-04-26T00:00:00Z', // Different Sunday
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows setting delivery_week_sunday on unused coupon', async () => {
      commerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({
          uses_count: 0,
          delivery_week_sunday: new Date('2026-04-19T00:00:00Z'),
        }),
      );

      const result = await service.update('coupon-1', {
        delivery_week_sunday: '2026-04-26T00:00:00Z',
      });

      expect(result.ok).toBe(true);
    });
  });

  // ─── ARCHIVE ───────────────────────────────────────────────────────────

  describe('archive', () => {
    it('deactivates a coupon and revokes applied CustomerCoupons', async () => {
      commerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ is_active: true, uses_count: 10 }),
      );
      commerce.$transaction.mockResolvedValue([
        makeCoupon({ is_active: false }),
        { count: 3 },
      ]);

      const result = await service.archive('coupon-1');

      expect(result.ok).toBe(true);
      expect(result.revoked_count).toBe(3);
      expect(result.message).toContain('archived');
    });

    it('returns early if already archived', async () => {
      commerce.coupon.findUnique.mockResolvedValue(
        makeCoupon({ is_active: false }),
      );

      const result = await service.archive('coupon-1');

      expect(result.ok).toBe(true);
      expect(result.message).toContain('already archived');
      expect(result.revoked_count).toBe(0);
      expect(commerce.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for missing coupon', async () => {
      commerce.coupon.findUnique.mockResolvedValue(null);

      await expect(service.archive('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
