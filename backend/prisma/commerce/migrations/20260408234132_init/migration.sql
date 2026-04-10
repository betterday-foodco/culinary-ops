-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'paused_indefinite', 'cancelled', 'unclaimed');

-- CreateEnum
CREATE TYPE "CustomerSource" AS ENUM ('signup', 'apple_pay_express', 'google_pay_express', 'gift_redeem', 'admin');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('delivery', 'pickup');

-- CreateEnum
CREATE TYPE "PaymentProcessor" AS ENUM ('helcim', 'apple_pay', 'google_pay');

-- CreateEnum
CREATE TYPE "CardBrand" AS ENUM ('visa', 'mc', 'amex', 'disc', 'other');

-- CreateEnum
CREATE TYPE "SubscriptionCadence" AS ENUM ('weekly', 'biweekly', 'monthly');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'paused', 'paused_indefinite', 'cancelled');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('scheduled', 'confirmed', 'skipped', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('one_time', 'subscription_first', 'subscription_renewal', 'add_on');

-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('delivery', 'pickup');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'confirmed', 'in_kitchen', 'out_for_delivery', 'delivered', 'cancelled', 'refunded');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "display_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "birthday" DATE,
    "member_since" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CustomerStatus" NOT NULL DEFAULT 'active',
    "source" "CustomerSource" NOT NULL DEFAULT 'signup',
    "password_hash" TEXT,
    "apple_id_sub" TEXT,
    "google_id_sub" TEXT,
    "helcim_customer_id" TEXT,
    "sms_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "email_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "allergens" TEXT[],
    "diet_tags" TEXT[],
    "disliked_meals" TEXT[],
    "favorite_meals" TEXT[],
    "internal_notes" TEXT,
    "tags" TEXT[],
    "last_contacted_at" TIMESTAMP(3),
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagged_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "AddressType" NOT NULL DEFAULT 'delivery',
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT,
    "company" TEXT,
    "street" TEXT NOT NULL,
    "street2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "delivery_instructions" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "processor" "PaymentProcessor" NOT NULL DEFAULT 'helcim',
    "processor_token" TEXT NOT NULL,
    "brand" "CardBrand" NOT NULL DEFAULT 'other',
    "last4" TEXT NOT NULL,
    "exp_month" INTEGER NOT NULL,
    "exp_year" INTEGER NOT NULL,
    "cardholder_name" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "cadence" "SubscriptionCadence" NOT NULL DEFAULT 'weekly',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "next_renewal_at" TIMESTAMP(3) NOT NULL,
    "default_payment_id" TEXT,
    "default_address_id" TEXT,
    "default_meal_count" INTEGER NOT NULL DEFAULT 9,
    "savings_tier" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "lifetime_orders" INTEGER NOT NULL DEFAULT 0,
    "lifetime_spend" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pickup_days" TEXT[],
    "pickup_hours" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrder" (
    "id" TEXT NOT NULL,
    "display_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "order_type" "OrderType" NOT NULL DEFAULT 'one_time',
    "billing_contact" JSONB NOT NULL,
    "payment_method_id" TEXT,
    "processor_charge_id" TEXT,
    "fulfillment_method" "FulfillmentMethod" NOT NULL DEFAULT 'delivery',
    "shipping_address_id" TEXT,
    "pickup_location_id" TEXT,
    "pickup_date" DATE,
    "estimated_delivery_date" DATE,
    "is_gift" BOOLEAN NOT NULL DEFAULT false,
    "gift_recipient" JSONB,
    "gift_sms_sent_at" TIMESTAMP(3),
    "line_items" JSONB NOT NULL,
    "meals_count" INTEGER NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "subscriber_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "savings_pct" INTEGER NOT NULL DEFAULT 0,
    "code_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "gift_card_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "points_redeemed" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "points_earned" INTEGER NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "admin_notes" TEXT,
    "edit_history" JSONB NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCartRecord" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "delivery_week" DATE NOT NULL,
    "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'scheduled',
    "cart_items" JSONB NOT NULL,
    "order_id" TEXT,
    "processed_at" TIMESTAMP(3),
    "last_reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyCartRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_display_id_key" ON "Customer"("display_id");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_apple_id_sub_idx" ON "Customer"("apple_id_sub");

-- CreateIndex
CREATE INDEX "Customer_google_id_sub_idx" ON "Customer"("google_id_sub");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_flagged_idx" ON "Customer"("flagged");

-- CreateIndex
CREATE INDEX "CustomerAddress_customer_id_idx" ON "CustomerAddress"("customer_id");

-- CreateIndex
CREATE INDEX "CustomerAddress_customer_id_type_is_default_idx" ON "CustomerAddress"("customer_id", "type", "is_default");

-- CreateIndex
CREATE INDEX "PaymentMethod_customer_id_idx" ON "PaymentMethod"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_customer_id_key" ON "Subscription"("customer_id");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_next_renewal_at_idx" ON "Subscription"("next_renewal_at");

-- CreateIndex
CREATE INDEX "PickupLocation_is_active_idx" ON "PickupLocation"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrder_display_id_key" ON "CustomerOrder"("display_id");

-- CreateIndex
CREATE INDEX "CustomerOrder_customer_id_idx" ON "CustomerOrder"("customer_id");

-- CreateIndex
CREATE INDEX "CustomerOrder_subscription_id_idx" ON "CustomerOrder"("subscription_id");

-- CreateIndex
CREATE INDEX "CustomerOrder_status_idx" ON "CustomerOrder"("status");

-- CreateIndex
CREATE INDEX "CustomerOrder_placed_at_idx" ON "CustomerOrder"("placed_at");

-- CreateIndex
CREATE INDEX "CustomerOrder_fulfillment_method_idx" ON "CustomerOrder"("fulfillment_method");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCartRecord_order_id_key" ON "WeeklyCartRecord"("order_id");

-- CreateIndex
CREATE INDEX "WeeklyCartRecord_delivery_week_delivery_status_idx" ON "WeeklyCartRecord"("delivery_week", "delivery_status");

-- CreateIndex
CREATE INDEX "WeeklyCartRecord_customer_id_idx" ON "WeeklyCartRecord"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCartRecord_subscription_id_delivery_week_key" ON "WeeklyCartRecord"("subscription_id", "delivery_week");

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_default_payment_id_fkey" FOREIGN KEY ("default_payment_id") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_default_address_id_fkey" FOREIGN KEY ("default_address_id") REFERENCES "CustomerAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "CustomerAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_pickup_location_id_fkey" FOREIGN KEY ("pickup_location_id") REFERENCES "PickupLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCartRecord" ADD CONSTRAINT "WeeklyCartRecord_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCartRecord" ADD CONSTRAINT "WeeklyCartRecord_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCartRecord" ADD CONSTRAINT "WeeklyCartRecord_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "CustomerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
