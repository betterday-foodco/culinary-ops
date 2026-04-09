/*
  Warnings:

  - You are about to drop the column `applies_to` on the `Coupon` table. All the data in the column will be lost.
  - You are about to drop the column `target_category` on the `Coupon` table. All the data in the column will be lost.
  - You are about to drop the column `target_meal_code` on the `Coupon` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "CouponPurpose" AS ENUM ('manual', 'auto_applied', 'deal_of_the_week', 'welcome', 'winback', 'birthday', 'abandoned_cart', 'referral');

-- CreateEnum
CREATE TYPE "CouponCategory" AS ENUM ('intro', 'email_flow', 'influencer', 'partnership', 'flyer', 'seasonal', 'loyalty', 'referral', 'manual', 'other');

-- CreateEnum
CREATE TYPE "SubscriptionRestriction" AS ENUM ('none', 'active_subscribers_only', 'new_subscribers_only', 'non_subscribers_only');

-- CreateEnum
CREATE TYPE "CouponSourceChannel" AS ENUM ('unknown', 'email', 'sms', 'landing_page', 'in_app', 'in_cart', 'direct', 'referral', 'partner', 'flyer', 'influencer');

-- AlterTable
ALTER TABLE "Coupon" DROP COLUMN "applies_to",
DROP COLUMN "target_category",
DROP COLUMN "target_meal_code",
ADD COLUMN     "allowed_emails" TEXT[],
ADD COLUMN     "auto_apply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "buy_qty" INTEGER,
ADD COLUMN     "category" "CouponCategory" NOT NULL DEFAULT 'manual',
ADD COLUMN     "category_exclude" TEXT[],
ADD COLUMN     "category_include" TEXT[],
ADD COLUMN     "cost_per_redemption" DECIMAL(10,2),
ADD COLUMN     "customer_facing_error_override" TEXT,
ADD COLUMN     "delivery_week_sunday" DATE,
ADD COLUMN     "display_message" TEXT,
ADD COLUMN     "exclude_customer_tags" TEXT[],
ADD COLUMN     "exclude_sale_items" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "excluded_emails" TEXT[],
ADD COLUMN     "get_discount_pct" INTEGER,
ADD COLUMN     "get_qty" INTEGER,
ADD COLUMN     "includes_free_delivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_discount_amount" DECIMAL(10,2),
ADD COLUMN     "max_lifetime_spend" DECIMAL(10,2),
ADD COLUMN     "max_member_since_days" INTEGER,
ADD COLUMN     "max_order_count" INTEGER,
ADD COLUMN     "max_order_value" DECIMAL(10,2),
ADD COLUMN     "max_uses_per_household" INTEGER,
ADD COLUMN     "min_lifetime_spend" DECIMAL(10,2),
ADD COLUMN     "min_member_since_days" INTEGER,
ADD COLUMN     "min_order_count" INTEGER,
ADD COLUMN     "new_customers_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "product_exclude" TEXT[],
ADD COLUMN     "product_include" TEXT[],
ADD COLUMN     "purpose" "CouponPurpose" NOT NULL DEFAULT 'manual',
ADD COLUMN     "referrer_credit" DECIMAL(10,2),
ADD COLUMN     "referrer_credit_type" "CouponType",
ADD COLUMN     "referrer_customer_id" TEXT,
ADD COLUMN     "require_verified_email" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rolling_expiry_days" INTEGER,
ADD COLUMN     "show_as_clippable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "show_in_order_confirmation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stackable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "starts_at" TIMESTAMP(3),
ADD COLUMN     "subscription_restriction" "SubscriptionRestriction" NOT NULL DEFAULT 'none',
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "target_customer_statuses" "CustomerStatus"[],
ADD COLUMN     "target_customer_tags" TEXT[];

-- AlterTable
ALTER TABLE "CustomerCoupon" ADD COLUMN     "referrer_url" TEXT,
ADD COLUMN     "source_campaign" TEXT,
ADD COLUMN     "source_channel" "CouponSourceChannel",
ADD COLUMN     "source_content" TEXT;

-- DropEnum
DROP TYPE "CouponAppliesTo";

-- CreateTable
CREATE TABLE "CouponTier" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "min_spend" DECIMAL(10,2) NOT NULL,
    "discount_type" "CouponType" NOT NULL,
    "discount_value" DECIMAL(10,2) NOT NULL,
    "includes_free_delivery" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponAttachedProduct" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "meal_code" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "discount_type" "CouponType" NOT NULL DEFAULT 'percentage',
    "discount_value" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponAttachedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CouponTier_coupon_id_sort_order_idx" ON "CouponTier"("coupon_id", "sort_order");

-- CreateIndex
CREATE INDEX "CouponAttachedProduct_coupon_id_idx" ON "CouponAttachedProduct"("coupon_id");

-- CreateIndex
CREATE INDEX "Coupon_purpose_idx" ON "Coupon"("purpose");

-- CreateIndex
CREATE INDEX "Coupon_category_idx" ON "Coupon"("category");

-- CreateIndex
CREATE INDEX "Coupon_delivery_week_sunday_idx" ON "Coupon"("delivery_week_sunday");

-- CreateIndex
CREATE INDEX "Coupon_auto_apply_is_active_idx" ON "Coupon"("auto_apply", "is_active");

-- CreateIndex
CREATE INDEX "Coupon_referrer_customer_id_idx" ON "Coupon"("referrer_customer_id");

-- CreateIndex
CREATE INDEX "CustomerCoupon_source_channel_idx" ON "CustomerCoupon"("source_channel");

-- CreateIndex
CREATE INDEX "CustomerCoupon_source_campaign_idx" ON "CustomerCoupon"("source_campaign");

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_referrer_customer_id_fkey" FOREIGN KEY ("referrer_customer_id") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponTier" ADD CONSTRAINT "CouponTier_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponAttachedProduct" ADD CONSTRAINT "CouponAttachedProduct_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
