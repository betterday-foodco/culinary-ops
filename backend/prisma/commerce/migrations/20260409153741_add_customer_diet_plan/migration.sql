-- Migration #6: add_customer_diet_plan
--
-- Adds `Customer.diet_plan_id` — a nullable UUID that references the
-- culinary database's `SystemTag.id` where `type = 'diets'` (Omnivore
-- or Plant-Based). Mirrors the MealRecipe.diet_plan_id rule so catalog
-- filtering can do plan→plan matching at query time.
--
-- NOTE: this is NOT a Postgres foreign key. Postgres cannot enforce
-- referential integrity across separate databases, and SystemTag lives
-- in the culinary DB (rapid-lake-47793035), not the commerce DB
-- (spring-fire-44871408). The commerce service layer
-- (CommerceCustomersService) validates the UUID against
-- CulinaryPrismaService.systemTag.findUnique before writing. See the
-- block comment on Customer.diet_plan_id in schema.prisma for details.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "diet_plan_id" TEXT;

-- CreateIndex
CREATE INDEX "Customer_diet_plan_id_idx" ON "Customer"("diet_plan_id");
