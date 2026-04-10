import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsDateString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Update basic profile fields. PATCH semantics — every field optional,
 * only the ones present in the request are updated.
 *
 * Fields NOT updatable via this endpoint (intentionally):
 *   - email: use the email_change flow with CustomerAuthToken verification
 *   - phone: same — use phone_change flow
 *   - display_id: system-generated, never mutable
 *   - status / source: admin-only via a separate admin endpoint
 *   - password_hash: doesn't exist (passwordless)
 *   - points_balance: managed by the rewards service
 *   - flagged / internal_notes / tags: admin-only
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /**
   * ISO date string (YYYY-MM-DD). Prisma @db.Date accepts Date instances;
   * the service layer parses this string before writing.
   */
  @IsOptional()
  @IsDateString()
  birthday?: string;
}

/**
 * Update customer preferences (diet plan, allergens, diet tags, meal
 * preferences). All array fields are replaced (not merged) on each
 * update — send the complete new list.
 *
 * These drive the auto-swap logic when the weekly menu rotates and
 * the build-a-cart "suggested meals" engine.
 *
 * diet_plan_id is a UUID referencing culinary.SystemTag.id where
 * type='diets' (the "Omnivore" or "Vegan" rows). It's a bare UUID on
 * the commerce side because the two schemas live in separate databases
 * — see the Customer.diet_plan_id block comment in the commerce
 * schema.prisma. The service validates the UUID against the culinary
 * DB before writing it. Explicit null clears the selection.
 *
 * Customer-facing label for the Vegan plan is "Plants Only" (via
 * DIET_LABELS in the client; see brand/site-info.seed.json's
 * public.diet.labels.vegan). Backend never emits or stores the label.
 */
export class UpdatePreferencesDto {
  /**
   * UUID of a SystemTag row in the culinary database with type='diets'.
   * Pass null to clear the customer's diet plan. Omit the field to
   * leave it unchanged.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  diet_plan_id?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  diet_tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disliked_meals?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  favorite_meals?: string[];
}

/**
 * Update notification opt-ins. Each channel is independent:
 *  - sms_opt_in: transactional SMS only (order status, delivery alerts)
 *  - email_opt_in: transactional email only (receipts, cutoff reminders)
 *
 * Marketing emails are a SEPARATE consent, not covered here. CASL
 * requires explicit opt-in for marketing which lives on a future
 * CustomerMarketingConsent table.
 */
export class UpdateNotificationsDto {
  @IsOptional()
  @IsBoolean()
  sms_opt_in?: boolean;

  @IsOptional()
  @IsBoolean()
  email_opt_in?: boolean;
}
