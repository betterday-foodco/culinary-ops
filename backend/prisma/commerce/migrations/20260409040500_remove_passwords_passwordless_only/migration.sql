-- BetterDay commerce is 100% passwordless. This migration strips the
-- password vestiges that slipped into migration 3 (add_auth_sessions_and_tokens):
--   - Removes Customer.password_hash column
--   - Removes 'password_reset' from the AuthTokenType enum
--
-- See memory: project_betterday_passwordless_auth.md
-- Safe to run: the dev branch has zero rows, no data loss possible.

-- AlterEnum
BEGIN;
CREATE TYPE "AuthTokenType_new" AS ENUM ('magic_link', 'phone_otp', 'email_verification', 'email_change', 'phone_change');
ALTER TABLE "CustomerAuthToken" ALTER COLUMN "type" TYPE "AuthTokenType_new" USING ("type"::text::"AuthTokenType_new");
ALTER TYPE "AuthTokenType" RENAME TO "AuthTokenType_old";
ALTER TYPE "AuthTokenType_new" RENAME TO "AuthTokenType";
DROP TYPE "AuthTokenType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "password_hash";
