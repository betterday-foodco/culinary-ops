/*
  Warnings:

  - You are about to drop the column `recipient_name` on the `CustomerAddress` table. All the data in the column will be lost.
  - Added the required column `recipient_email` to the `CustomerAddress` table without a default value. This is not possible if the table is not empty.
  - Added the required column `recipient_first_name` to the `CustomerAddress` table without a default value. This is not possible if the table is not empty.
  - Added the required column `recipient_last_name` to the `CustomerAddress` table without a default value. This is not possible if the table is not empty.
  - Made the column `recipient_phone` on table `CustomerAddress` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "PointsTxnType" AS ENUM ('earned', 'spent', 'expired', 'admin_adjust');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('percentage', 'dollar_amount', 'free_item', 'free_delivery');

-- CreateEnum
CREATE TYPE "CouponAppliesTo" AS ENUM ('order', 'category', 'specific_meal');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('available', 'applied', 'redeemed', 'expired', 'revoked');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "points_balance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CustomerAddress" DROP COLUMN "recipient_name",
ADD COLUMN     "recipient_email" TEXT NOT NULL,
ADD COLUMN     "recipient_first_name" TEXT NOT NULL,
ADD COLUMN     "recipient_last_name" TEXT NOT NULL,
ALTER COLUMN "recipient_phone" SET NOT NULL;

-- CreateTable
CREATE TABLE "RewardPointsTransaction" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "type" "PointsTxnType" NOT NULL,
    "points" INTEGER NOT NULL,
    "dollar_value" DECIMAL(10,2) NOT NULL,
    "order_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardPointsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CouponType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "applies_to" "CouponAppliesTo" NOT NULL DEFAULT 'order',
    "target_category" TEXT,
    "target_meal_code" TEXT,
    "min_order_value" DECIMAL(10,2),
    "max_uses" INTEGER,
    "max_uses_per_customer" INTEGER,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_personal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCoupon" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "status" "CouponStatus" NOT NULL DEFAULT 'available',
    "applied_at" TIMESTAMP(3),
    "redeemed_at" TIMESTAMP(3),
    "redeemed_order_id" TEXT,
    "amount_discounted" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardPointsTransaction_customer_id_created_at_idx" ON "RewardPointsTransaction"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "RewardPointsTransaction_order_id_idx" ON "RewardPointsTransaction"("order_id");

-- CreateIndex
CREATE INDEX "RewardPointsTransaction_type_idx" ON "RewardPointsTransaction"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_is_active_expires_at_idx" ON "Coupon"("is_active", "expires_at");

-- CreateIndex
CREATE INDEX "Coupon_is_personal_idx" ON "Coupon"("is_personal");

-- CreateIndex
CREATE INDEX "CustomerCoupon_customer_id_idx" ON "CustomerCoupon"("customer_id");

-- CreateIndex
CREATE INDEX "CustomerCoupon_coupon_id_idx" ON "CustomerCoupon"("coupon_id");

-- CreateIndex
CREATE INDEX "CustomerCoupon_status_idx" ON "CustomerCoupon"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCoupon_customer_id_coupon_id_key" ON "CustomerCoupon"("customer_id", "coupon_id");

-- AddForeignKey
ALTER TABLE "RewardPointsTransaction" ADD CONSTRAINT "RewardPointsTransaction_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPointsTransaction" ADD CONSTRAINT "RewardPointsTransaction_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "CustomerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCoupon" ADD CONSTRAINT "CustomerCoupon_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCoupon" ADD CONSTRAINT "CustomerCoupon_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCoupon" ADD CONSTRAINT "CustomerCoupon_redeemed_order_id_fkey" FOREIGN KEY ("redeemed_order_id") REFERENCES "CustomerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
