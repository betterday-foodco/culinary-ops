-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('admin_goodwill', 'admin_quality_issue', 'admin_cancelled_delivery', 'dispute', 'system_error', 'other');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'partially_refunded';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "last_login_ip" TEXT;

-- AlterTable
ALTER TABLE "CustomerOrder" ADD COLUMN     "charge_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "charge_initiated_by" TEXT,
ADD COLUMN     "charge_ip_address" TEXT,
ADD COLUMN     "last_charge_attempt_at" TIMESTAMP(3),
ADD COLUMN     "last_charge_error" TEXT,
ADD COLUMN     "mit_indicator" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "next_charge_retry_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PaymentMethod" ADD COLUMN     "cof_agreement_at" TIMESTAMP(3),
ADD COLUMN     "cof_agreement_text_version" TEXT,
ADD COLUMN     "disputed_at" TIMESTAMP(3),
ADD COLUMN     "is_disputed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_expiry_warning_sent_at" TIMESTAMP(3),
ADD COLUMN     "saved_from_ip" TEXT;

-- CreateTable
CREATE TABLE "HelcimCheckoutSession" (
    "id" TEXT NOT NULL,
    "secret_token" TEXT NOT NULL,
    "customer_id" TEXT,
    "payment_type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_order_id" TEXT,

    CONSTRAINT "HelcimCheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "signature_valid" BOOLEAN NOT NULL,
    "raw_body" TEXT NOT NULL,
    "result" TEXT,
    "error_detail" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationLog" (
    "id" TEXT NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "transactions_fetched" INTEGER NOT NULL DEFAULT 0,
    "matched_ok" INTEGER NOT NULL DEFAULT 0,
    "discrepancies_found" INTEGER NOT NULL DEFAULT 0,
    "disputes_found" INTEGER NOT NULL DEFAULT 0,
    "refunds_found" INTEGER NOT NULL DEFAULT 0,
    "unknown_transactions" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,
    "duration_ms" INTEGER,

    CONSTRAINT "ReconciliationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRefund" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "processor_refund_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" "RefundReason" NOT NULL DEFAULT 'other',
    "reason_note" TEXT,
    "initiated_by" TEXT NOT NULL,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "OrderRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelcimCheckoutSession_confirmed_order_id_key" ON "HelcimCheckoutSession"("confirmed_order_id");

-- CreateIndex
CREATE INDEX "HelcimCheckoutSession_customer_id_idx" ON "HelcimCheckoutSession"("customer_id");

-- CreateIndex
CREATE INDEX "HelcimCheckoutSession_expires_at_idx" ON "HelcimCheckoutSession"("expires_at");

-- CreateIndex
CREATE INDEX "WebhookEvent_type_received_at_idx" ON "WebhookEvent"("type", "received_at");

-- CreateIndex
CREATE INDEX "WebhookEvent_processed_at_idx" ON "WebhookEvent"("processed_at");

-- CreateIndex
CREATE INDEX "ReconciliationLog_run_at_idx" ON "ReconciliationLog"("run_at");

-- CreateIndex
CREATE INDEX "OrderRefund_order_id_idx" ON "OrderRefund"("order_id");

-- CreateIndex
CREATE INDEX "OrderRefund_processor_refund_id_idx" ON "OrderRefund"("processor_refund_id");

-- CreateIndex
CREATE INDEX "OrderRefund_reason_idx" ON "OrderRefund"("reason");

-- CreateIndex
CREATE INDEX "CustomerOrder_processor_charge_id_idx" ON "CustomerOrder"("processor_charge_id");

-- CreateIndex
CREATE INDEX "CustomerOrder_next_charge_retry_at_idx" ON "CustomerOrder"("next_charge_retry_at");

-- CreateIndex
CREATE INDEX "PaymentMethod_is_disputed_idx" ON "PaymentMethod"("is_disputed");

-- AddForeignKey
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "CustomerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

