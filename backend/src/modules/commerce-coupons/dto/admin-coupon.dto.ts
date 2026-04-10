import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  IsEnum,
  IsArray,
  IsDateString,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';

// ─── Enums (mirror Prisma enums for DTO validation) ─────────────────────────
// We duplicate the enum values here rather than importing from
// @prisma/commerce-client so the DTOs work even when the client
// hasn't been generated (fresh clone / CI).

export enum CouponType {
  percentage = 'percentage',
  dollar_amount = 'dollar_amount',
  free_item = 'free_item',
  free_delivery = 'free_delivery',
}

export enum CouponPurpose {
  manual = 'manual',
  auto_applied = 'auto_applied',
  deal_of_the_week = 'deal_of_the_week',
  welcome = 'welcome',
  winback = 'winback',
  birthday = 'birthday',
  abandoned_cart = 'abandoned_cart',
  referral = 'referral',
}

export enum CouponCategory {
  intro = 'intro',
  email_flow = 'email_flow',
  influencer = 'influencer',
  partnership = 'partnership',
  flyer = 'flyer',
  seasonal = 'seasonal',
  loyalty = 'loyalty',
  referral = 'referral',
  manual = 'manual',
  other = 'other',
}

export enum SubscriptionRestriction {
  none = 'none',
  active_subscribers_only = 'active_subscribers_only',
  new_subscribers_only = 'new_subscribers_only',
  non_subscribers_only = 'non_subscribers_only',
}

// ─── List / filter DTO ──────────────────────────────────────────────────────

export class ListCouponsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;

  /** Text search across code + name */
  @IsOptional()
  @IsString()
  search?: string;

  /** Filter by active/inactive. Omit for both. */
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsEnum(CouponPurpose)
  purpose?: CouponPurpose;

  @IsOptional()
  @IsEnum(CouponCategory)
  category?: CouponCategory;

  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  /** Filter to coupons bound to a specific delivery week */
  @IsOptional()
  @IsDateString()
  delivery_week_sunday?: string;

  /** Sort field. Defaults to created_at. */
  @IsOptional()
  @IsString()
  sort_by?: 'created_at' | 'code' | 'uses_count' | 'expires_at' = 'created_at';

  /** Sort direction. Defaults to desc (newest first). */
  @IsOptional()
  @IsString()
  sort_dir?: 'asc' | 'desc' = 'desc';
}

// ─── Create DTO ─────────────────────────────────────────────────────────────

export class CreateCouponDto {
  // ── Required fields ──

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(CouponType)
  type: CouponType;

  @IsNumber()
  @Min(0.01)
  value: number;

  // ── Optional identity ──

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  display_message?: string;

  // ── Behavior ──

  @IsOptional()
  @IsEnum(CouponPurpose)
  purpose?: CouponPurpose;

  @IsOptional()
  @IsEnum(CouponCategory)
  category?: CouponCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // ── Discount modifiers ──

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_discount_amount?: number;

  @IsOptional()
  @IsBoolean()
  includes_free_delivery?: boolean;

  // ── Order value thresholds ──

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_order_value?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_order_value?: number;

  // ── Validity window ──

  @IsOptional()
  @IsDateString()
  starts_at?: string;

  @IsOptional()
  @IsDateString()
  expires_at?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rolling_expiry_days?: number;

  // ── Usage limits ──

  @IsOptional()
  @IsInt()
  @Min(1)
  max_uses?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_uses_per_customer?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_uses_per_household?: number;

  // ── Flags ──

  @IsOptional()
  @IsBoolean()
  is_personal?: boolean;

  @IsOptional()
  @IsBoolean()
  new_customers_only?: boolean;

  @IsOptional()
  @IsBoolean()
  exclude_sale_items?: boolean;

  @IsOptional()
  @IsBoolean()
  auto_apply?: boolean;

  @IsOptional()
  @IsBoolean()
  stackable?: boolean;

  @IsOptional()
  @IsBoolean()
  show_as_clippable?: boolean;

  @IsOptional()
  @IsBoolean()
  show_in_order_confirmation?: boolean;

  @IsOptional()
  @IsBoolean()
  require_verified_email?: boolean;

  // ── Subscription + order history ──

  @IsOptional()
  @IsEnum(SubscriptionRestriction)
  subscription_restriction?: SubscriptionRestriction;

  @IsOptional()
  @IsInt()
  @Min(0)
  min_order_count?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  max_order_count?: number;

  // ── Targeting arrays ──

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_emails?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excluded_emails?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  product_include?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  product_exclude?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  category_include?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  category_exclude?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  target_customer_tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exclude_customer_tags?: string[];

  // ── Spend / tenure targeting ──

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_lifetime_spend?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_lifetime_spend?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  min_member_since_days?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  max_member_since_days?: number;

  // ── BOGO ──

  @IsOptional()
  @IsInt()
  @Min(1)
  buy_qty?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  get_qty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  get_discount_pct?: number;

  // ── DOTW ──

  @IsOptional()
  @IsDateString()
  delivery_week_sunday?: string;

  // ── Referral ──

  @IsOptional()
  @IsString()
  referrer_customer_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  referrer_credit?: number;

  @IsOptional()
  @IsEnum(CouponType)
  referrer_credit_type?: CouponType;

  // ── Reporting ──

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost_per_redemption?: number;

  @IsOptional()
  @IsString()
  customer_facing_error_override?: string;
}

// ─── Update DTO ─────────────────────────────────────────────────────────────
// Same fields as Create, but everything is optional (partial update).

export class UpdateCouponDto {
  @IsOptional() @IsString() @IsNotEmpty() code?: string;
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() display_message?: string;

  @IsOptional() @IsEnum(CouponType) type?: CouponType;
  @IsOptional() @IsNumber() @Min(0.01) value?: number;
  @IsOptional() @IsNumber() @Min(0) max_discount_amount?: number;
  @IsOptional() @IsBoolean() includes_free_delivery?: boolean;

  @IsOptional() @IsNumber() @Min(0) min_order_value?: number;
  @IsOptional() @IsNumber() @Min(0) max_order_value?: number;

  @IsOptional() @IsDateString() starts_at?: string;
  @IsOptional() @IsDateString() expires_at?: string;
  @IsOptional() @IsInt() @Min(1) rolling_expiry_days?: number;

  @IsOptional() @IsInt() @Min(1) max_uses?: number;
  @IsOptional() @IsInt() @Min(1) max_uses_per_customer?: number;
  @IsOptional() @IsInt() @Min(1) max_uses_per_household?: number;

  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsBoolean() is_personal?: boolean;
  @IsOptional() @IsBoolean() new_customers_only?: boolean;
  @IsOptional() @IsBoolean() exclude_sale_items?: boolean;
  @IsOptional() @IsBoolean() auto_apply?: boolean;
  @IsOptional() @IsBoolean() stackable?: boolean;
  @IsOptional() @IsBoolean() show_as_clippable?: boolean;
  @IsOptional() @IsBoolean() show_in_order_confirmation?: boolean;
  @IsOptional() @IsBoolean() require_verified_email?: boolean;

  @IsOptional() @IsEnum(SubscriptionRestriction) subscription_restriction?: SubscriptionRestriction;
  @IsOptional() @IsEnum(CouponPurpose) purpose?: CouponPurpose;
  @IsOptional() @IsEnum(CouponCategory) category?: CouponCategory;

  @IsOptional() @IsInt() @Min(0) min_order_count?: number;
  @IsOptional() @IsInt() @Min(0) max_order_count?: number;

  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) allowed_emails?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) excluded_emails?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) product_include?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) product_exclude?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) category_include?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) category_exclude?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) target_customer_tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) exclude_customer_tags?: string[];

  @IsOptional() @IsNumber() @Min(0) min_lifetime_spend?: number;
  @IsOptional() @IsNumber() @Min(0) max_lifetime_spend?: number;
  @IsOptional() @IsInt() @Min(0) min_member_since_days?: number;
  @IsOptional() @IsInt() @Min(0) max_member_since_days?: number;

  @IsOptional() @IsInt() @Min(1) buy_qty?: number;
  @IsOptional() @IsInt() @Min(1) get_qty?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) get_discount_pct?: number;

  @IsOptional() @IsDateString() delivery_week_sunday?: string;

  @IsOptional() @IsString() referrer_customer_id?: string;
  @IsOptional() @IsNumber() @Min(0) referrer_credit?: number;
  @IsOptional() @IsEnum(CouponType) referrer_credit_type?: CouponType;

  @IsOptional() @IsNumber() @Min(0) cost_per_redemption?: number;
  @IsOptional() @IsString() customer_facing_error_override?: string;
}
