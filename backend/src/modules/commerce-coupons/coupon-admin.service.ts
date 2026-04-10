import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CommercePrismaService } from '../../prisma/commerce-prisma.service';
import {
  ListCouponsDto,
  CreateCouponDto,
  UpdateCouponDto,
} from './dto/admin-coupon.dto';

/**
 * Admin CRUD service for coupons.
 *
 * Provides list (paginated + filtered), create, update, and archive
 * operations. All mutations include input validation and return warnings
 * when editing live coupons that have already been used.
 *
 * This service is admin-only — no customer-facing logic. Customer
 * apply/remove/validate lives in CouponApplyService.
 *
 * Pagination follows the same page/limit + parallel count pattern used
 * in corp-admin.service.ts. The plan is to extract this into a shared
 * utility once proven here (see deferred-decisions.md).
 */
@Injectable()
export class CouponAdminService {
  constructor(private readonly commerce: any) {}

  // ─── LIST ───────────────────────────────────────────────────────────────────

  async list(dto: ListCouponsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 25;
    const skip = (page - 1) * limit;

    // Build the where clause from filters
    const where: any = {};

    if (dto.is_active !== undefined) {
      where.is_active = dto.is_active;
    }

    if (dto.purpose) {
      where.purpose = dto.purpose;
    }

    if (dto.category) {
      where.category = dto.category;
    }

    if (dto.type) {
      where.type = dto.type;
    }

    if (dto.delivery_week_sunday) {
      where.delivery_week_sunday = new Date(dto.delivery_week_sunday);
    }

    // Text search across code + name (case-insensitive)
    if (dto.search) {
      const term = dto.search.trim();
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
      ];
    }

    // Sort
    const sortBy = dto.sort_by ?? 'created_at';
    const sortDir = dto.sort_dir ?? 'desc';
    const orderBy = { [sortBy]: sortDir };

    const [data, total] = await Promise.all([
      this.commerce.coupon.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          tiers: true,
          _count: { select: { customer_coupons: true } },
        },
      }),
      this.commerce.coupon.count({ where }),
    ]);

    return {
      ok: true,
      data,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  // ─── GET ONE ────────────────────────────────────────────────────────────────

  async getById(id: string) {
    const coupon = await this.commerce.coupon.findUnique({
      where: { id },
      include: {
        tiers: true,
        attached_products: true,
        _count: {
          select: {
            customer_coupons: {
              where: { status: 'redeemed' },
            },
          },
        },
      },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon ${id} not found`);
    }

    return { ok: true, coupon };
  }

  // ─── CREATE ─────────────────────────────────────────────────────────────────

  async create(dto: CreateCouponDto) {
    // Normalize code to uppercase, trimmed
    const code = dto.code.trim().toUpperCase();

    // ── Input validation ──

    // Code uniqueness
    const existing = await this.commerce.coupon.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Coupon code "${code}" already exists`);
    }

    // Percentage value must be 1–100
    if (dto.type === 'percentage' && (dto.value < 1 || dto.value > 100)) {
      throw new BadRequestException(
        'Percentage coupon value must be between 1 and 100',
      );
    }

    // Date sanity
    if (dto.expires_at && new Date(dto.expires_at) <= new Date()) {
      throw new BadRequestException('Expiry date must be in the future');
    }
    if (dto.starts_at && dto.expires_at) {
      if (new Date(dto.starts_at) >= new Date(dto.expires_at)) {
        throw new BadRequestException(
          'Start date must be before expiry date',
        );
      }
    }

    // BOGO fields must come as a group
    const bogoFields = [dto.buy_qty, dto.get_qty, dto.get_discount_pct];
    const bogoSet = bogoFields.filter((f) => f !== undefined);
    if (bogoSet.length > 0 && bogoSet.length < 3) {
      throw new BadRequestException(
        'BOGO coupons require all three fields: buy_qty, get_qty, get_discount_pct',
      );
    }

    // delivery_week_sunday must be a Sunday
    if (dto.delivery_week_sunday) {
      const d = new Date(dto.delivery_week_sunday);
      if (d.getUTCDay() !== 0) {
        throw new BadRequestException(
          'delivery_week_sunday must fall on a Sunday',
        );
      }
    }

    // ── Build the create payload ──

    const data: any = {
      code,
      name: dto.name.trim(),
      type: dto.type,
      value: dto.value,
    };

    // Optional string fields
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.display_message !== undefined) data.display_message = dto.display_message;
    if (dto.customer_facing_error_override !== undefined)
      data.customer_facing_error_override = dto.customer_facing_error_override;

    // Enums
    if (dto.purpose !== undefined) data.purpose = dto.purpose;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.subscription_restriction !== undefined)
      data.subscription_restriction = dto.subscription_restriction;

    // Arrays
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.allowed_emails !== undefined) data.allowed_emails = dto.allowed_emails;
    if (dto.excluded_emails !== undefined) data.excluded_emails = dto.excluded_emails;
    if (dto.product_include !== undefined) data.product_include = dto.product_include;
    if (dto.product_exclude !== undefined) data.product_exclude = dto.product_exclude;
    if (dto.category_include !== undefined) data.category_include = dto.category_include;
    if (dto.category_exclude !== undefined) data.category_exclude = dto.category_exclude;
    if (dto.target_customer_tags !== undefined) data.target_customer_tags = dto.target_customer_tags;
    if (dto.exclude_customer_tags !== undefined) data.exclude_customer_tags = dto.exclude_customer_tags;

    // Numbers
    if (dto.max_discount_amount !== undefined) data.max_discount_amount = dto.max_discount_amount;
    if (dto.min_order_value !== undefined) data.min_order_value = dto.min_order_value;
    if (dto.max_order_value !== undefined) data.max_order_value = dto.max_order_value;
    if (dto.max_uses !== undefined) data.max_uses = dto.max_uses;
    if (dto.max_uses_per_customer !== undefined) data.max_uses_per_customer = dto.max_uses_per_customer;
    if (dto.max_uses_per_household !== undefined) data.max_uses_per_household = dto.max_uses_per_household;
    if (dto.rolling_expiry_days !== undefined) data.rolling_expiry_days = dto.rolling_expiry_days;
    if (dto.min_order_count !== undefined) data.min_order_count = dto.min_order_count;
    if (dto.max_order_count !== undefined) data.max_order_count = dto.max_order_count;
    if (dto.min_lifetime_spend !== undefined) data.min_lifetime_spend = dto.min_lifetime_spend;
    if (dto.max_lifetime_spend !== undefined) data.max_lifetime_spend = dto.max_lifetime_spend;
    if (dto.min_member_since_days !== undefined) data.min_member_since_days = dto.min_member_since_days;
    if (dto.max_member_since_days !== undefined) data.max_member_since_days = dto.max_member_since_days;
    if (dto.cost_per_redemption !== undefined) data.cost_per_redemption = dto.cost_per_redemption;
    if (dto.referrer_credit !== undefined) data.referrer_credit = dto.referrer_credit;

    // Booleans (only set if explicitly provided — schema defaults handle the rest)
    if (dto.includes_free_delivery !== undefined) data.includes_free_delivery = dto.includes_free_delivery;
    if (dto.is_personal !== undefined) data.is_personal = dto.is_personal;
    if (dto.new_customers_only !== undefined) data.new_customers_only = dto.new_customers_only;
    if (dto.exclude_sale_items !== undefined) data.exclude_sale_items = dto.exclude_sale_items;
    if (dto.auto_apply !== undefined) data.auto_apply = dto.auto_apply;
    if (dto.stackable !== undefined) data.stackable = dto.stackable;
    if (dto.show_as_clippable !== undefined) data.show_as_clippable = dto.show_as_clippable;
    if (dto.show_in_order_confirmation !== undefined) data.show_in_order_confirmation = dto.show_in_order_confirmation;
    if (dto.require_verified_email !== undefined) data.require_verified_email = dto.require_verified_email;

    // Dates
    if (dto.starts_at !== undefined) data.starts_at = new Date(dto.starts_at);
    if (dto.expires_at !== undefined) data.expires_at = new Date(dto.expires_at);
    if (dto.delivery_week_sunday !== undefined)
      data.delivery_week_sunday = new Date(dto.delivery_week_sunday);

    // BOGO
    if (dto.buy_qty !== undefined) data.buy_qty = dto.buy_qty;
    if (dto.get_qty !== undefined) data.get_qty = dto.get_qty;
    if (dto.get_discount_pct !== undefined) data.get_discount_pct = dto.get_discount_pct;

    // Referral
    if (dto.referrer_customer_id !== undefined) data.referrer_customer_id = dto.referrer_customer_id;
    if (dto.referrer_credit_type !== undefined) data.referrer_credit_type = dto.referrer_credit_type;

    const coupon = await this.commerce.coupon.create({ data });

    return { ok: true, coupon };
  }

  // ─── UPDATE ─────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateCouponDto) {
    // Fetch existing coupon
    const existing = await this.commerce.coupon.findUnique({
      where: { id },
      select: { id: true, code: true, uses_count: true, is_active: true, delivery_week_sunday: true },
    });
    if (!existing) {
      throw new NotFoundException(`Coupon ${id} not found`);
    }

    const warnings: string[] = [];

    // ── Validation ──

    // If changing code, check uniqueness
    if (dto.code !== undefined) {
      const normalized = dto.code.trim().toUpperCase();
      if (normalized !== existing.code) {
        const conflict = await this.commerce.coupon.findUnique({
          where: { code: normalized },
          select: { id: true },
        });
        if (conflict) {
          throw new ConflictException(
            `Coupon code "${normalized}" already exists`,
          );
        }
        if (existing.uses_count > 0) {
          warnings.push(
            `This coupon has been used ${existing.uses_count} time(s). Changing the code won't affect past redemptions, but customers with the old code bookmarked won't be able to use it.`,
          );
        }
      }
      dto.code = normalized;
    }

    // Percentage validation
    if (dto.type === 'percentage' || (dto.value !== undefined && !dto.type)) {
      const checkType = dto.type ?? 'percentage';
      const checkVal = dto.value;
      if (
        checkType === 'percentage' &&
        checkVal !== undefined &&
        (checkVal < 1 || checkVal > 100)
      ) {
        throw new BadRequestException(
          'Percentage coupon value must be between 1 and 100',
        );
      }
    }

    // Date sanity
    if (dto.starts_at && dto.expires_at) {
      if (new Date(dto.starts_at) >= new Date(dto.expires_at)) {
        throw new BadRequestException(
          'Start date must be before expiry date',
        );
      }
    }

    // delivery_week_sunday must be a Sunday
    if (dto.delivery_week_sunday) {
      const d = new Date(dto.delivery_week_sunday);
      if (d.getUTCDay() !== 0) {
        throw new BadRequestException(
          'delivery_week_sunday must fall on a Sunday',
        );
      }
    }

    // Lock delivery_week_sunday once coupon has been used — prevents
    // historical data corruption. Admin must create a new coupon instead.
    if (
      dto.delivery_week_sunday !== undefined &&
      existing.uses_count > 0 &&
      existing.delivery_week_sunday
    ) {
      const oldDate = new Date(existing.delivery_week_sunday).toISOString();
      const newDate = new Date(dto.delivery_week_sunday).toISOString();
      if (oldDate !== newDate) {
        throw new BadRequestException(
          `Cannot change delivery week on a coupon that has been used ${existing.uses_count} time(s). Create a new coupon for the new delivery week instead.`,
        );
      }
    }

    // Warn on dangerous field changes for used coupons
    if (existing.uses_count > 0) {
      if (dto.value !== undefined) {
        warnings.push(
          `Changing the discount value. This coupon has ${existing.uses_count} use(s) — the new value applies to future uses only, not past redemptions.`,
        );
      }
      if (dto.type !== undefined) {
        warnings.push(
          `Changing the discount type. Past redemptions keep their original discount calculation.`,
        );
      }
      if (dto.min_order_value !== undefined) {
        warnings.push(
          `Changing the minimum order value. Customers with this coupon already applied to a draft cart may see it rejected at checkout if their cart is below the new minimum.`,
        );
      }
    }

    // ── Build update payload ──

    const data: any = {};

    // Convert dates
    if (dto.starts_at !== undefined) {
      data.starts_at = dto.starts_at ? new Date(dto.starts_at) : null;
    }
    if (dto.expires_at !== undefined) {
      data.expires_at = dto.expires_at ? new Date(dto.expires_at) : null;
    }
    if (dto.delivery_week_sunday !== undefined) {
      data.delivery_week_sunday = dto.delivery_week_sunday
        ? new Date(dto.delivery_week_sunday)
        : null;
    }

    // Copy all other defined fields directly
    const directFields = [
      'code', 'name', 'description', 'display_message', 'type', 'value',
      'max_discount_amount', 'includes_free_delivery',
      'min_order_value', 'max_order_value',
      'rolling_expiry_days', 'max_uses', 'max_uses_per_customer',
      'max_uses_per_household', 'is_active', 'is_personal',
      'new_customers_only', 'exclude_sale_items', 'auto_apply',
      'stackable', 'show_as_clippable', 'show_in_order_confirmation',
      'require_verified_email', 'subscription_restriction',
      'purpose', 'category', 'min_order_count', 'max_order_count',
      'tags', 'allowed_emails', 'excluded_emails',
      'product_include', 'product_exclude',
      'category_include', 'category_exclude',
      'target_customer_tags', 'exclude_customer_tags',
      'min_lifetime_spend', 'max_lifetime_spend',
      'min_member_since_days', 'max_member_since_days',
      'buy_qty', 'get_qty', 'get_discount_pct',
      'referrer_customer_id', 'referrer_credit', 'referrer_credit_type',
      'cost_per_redemption', 'customer_facing_error_override',
    ] as const;

    for (const field of directFields) {
      if ((dto as any)[field] !== undefined && !(field in data)) {
        data[field] = (dto as any)[field];
      }
    }

    const coupon = await this.commerce.coupon.update({
      where: { id },
      data,
    });

    return { ok: true, coupon, warnings };
  }

  // ─── ARCHIVE ────────────────────────────────────────────────────────────────

  async archive(id: string) {
    const existing = await this.commerce.coupon.findUnique({
      where: { id },
      select: { id: true, code: true, is_active: true, uses_count: true },
    });
    if (!existing) {
      throw new NotFoundException(`Coupon ${id} not found`);
    }

    if (!existing.is_active) {
      return {
        ok: true,
        message: `Coupon "${existing.code}" is already archived`,
        coupon: existing,
        revoked_count: 0,
      };
    }

    // Deactivate the coupon and revoke any 'applied' (not yet redeemed)
    // CustomerCoupon records in a single transaction.
    const [coupon, revokeResult] = await this.commerce.$transaction([
      this.commerce.coupon.update({
        where: { id },
        data: { is_active: false },
      }),
      this.commerce.customerCoupon.updateMany({
        where: {
          coupon_id: id,
          status: 'applied',
        },
        data: {
          status: 'revoked',
        },
      }),
    ]);

    return {
      ok: true,
      message: `Coupon "${existing.code}" archived`,
      coupon,
      revoked_count: revokeResult.count,
    };
  }
}
