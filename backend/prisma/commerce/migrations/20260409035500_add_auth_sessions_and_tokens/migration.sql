-- CreateEnum
CREATE TYPE "SessionRevokeReason" AS ENUM ('user_logout', 'user_logout_all', 'password_change', 'email_change', 'admin_force', 'expired', 'security_anomaly');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('password_reset', 'email_verification', 'phone_otp', 'magic_link', 'email_change', 'phone_change');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "phone_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CustomerSession" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "device_name" TEXT,
    "ip_address" TEXT,
    "ip_country" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" "SessionRevokeReason",

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAuthToken" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "type" "AuthTokenType" NOT NULL,
    "target_email" TEXT,
    "target_phone" TEXT,
    "token_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "CustomerAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_refresh_token_hash_key" ON "CustomerSession"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "CustomerSession_customer_id_idx" ON "CustomerSession"("customer_id");

-- CreateIndex
CREATE INDEX "CustomerSession_customer_id_revoked_at_idx" ON "CustomerSession"("customer_id", "revoked_at");

-- CreateIndex
CREATE INDEX "CustomerSession_expires_at_idx" ON "CustomerSession"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAuthToken_token_hash_key" ON "CustomerAuthToken"("token_hash");

-- CreateIndex
CREATE INDEX "CustomerAuthToken_customer_id_idx" ON "CustomerAuthToken"("customer_id");

-- CreateIndex
CREATE INDEX "CustomerAuthToken_type_target_email_idx" ON "CustomerAuthToken"("type", "target_email");

-- CreateIndex
CREATE INDEX "CustomerAuthToken_type_target_phone_idx" ON "CustomerAuthToken"("type", "target_phone");

-- CreateIndex
CREATE INDEX "CustomerAuthToken_expires_at_idx" ON "CustomerAuthToken"("expires_at");

-- CreateIndex
CREATE INDEX "Customer_email_verified_idx" ON "Customer"("email_verified");

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAuthToken" ADD CONSTRAINT "CustomerAuthToken_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
