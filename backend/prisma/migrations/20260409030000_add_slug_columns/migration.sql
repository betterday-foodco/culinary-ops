-- Add slug columns to 5 tables for URL-safe, human-readable identifiers.
--
-- SystemTag uses a SCOPED unique index on (type, slug) because the same slug
-- can legitimately exist across different tag types (e.g. "shellfish" as both
-- an allergen and a protein). The other four tables use a GLOBAL unique index
-- on slug alone.
--
-- Existing rows are backfilled by slugifying the appropriate name field.
-- Collisions are resolved by appending "-2", "-3", … in creation order.

-- ── 1. Add nullable columns ────────────────────────────────────────────
ALTER TABLE "SystemTag"        ADD COLUMN "slug" TEXT;
ALTER TABLE "MealRecipe"       ADD COLUMN "slug" TEXT;
ALTER TABLE "SubRecipe"        ADD COLUMN "slug" TEXT;
ALTER TABLE "Ingredient"       ADD COLUMN "slug" TEXT;
ALTER TABLE "CorporateCompany" ADD COLUMN "slug" TEXT;

-- ── 2. Slugify from source name fields ────────────────────────────────
-- Pattern: lowercase → replace non-alphanumerics with hyphens → trim hyphens
UPDATE "SystemTag"
  SET "slug" = trim(both '-' from regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]+', '-', 'g'));

UPDATE "MealRecipe"
  SET "slug" = trim(both '-' from regexp_replace(lower(coalesce(NULLIF("display_name", ''), "name")), '[^a-z0-9]+', '-', 'g'));

UPDATE "SubRecipe"
  SET "slug" = trim(both '-' from regexp_replace(lower(coalesce(NULLIF("display_name", ''), "name")), '[^a-z0-9]+', '-', 'g'));

UPDATE "Ingredient"
  SET "slug" = trim(both '-' from regexp_replace(lower(coalesce(NULLIF("display_name", ''), "internal_name")), '[^a-z0-9]+', '-', 'g'));

UPDATE "CorporateCompany"
  SET "slug" = trim(both '-' from regexp_replace(lower(coalesce("name", "id")), '[^a-z0-9]+', '-', 'g'));

-- ── 3. Fallback for any rows that slugified to empty string ──────────
UPDATE "SystemTag"        SET "slug" = 'tag-'        || "id" WHERE "slug" IS NULL OR "slug" = '';
UPDATE "MealRecipe"       SET "slug" = 'meal-'       || "id" WHERE "slug" IS NULL OR "slug" = '';
UPDATE "SubRecipe"        SET "slug" = 'sub-recipe-' || "id" WHERE "slug" IS NULL OR "slug" = '';
UPDATE "Ingredient"       SET "slug" = 'ingredient-' || "id" WHERE "slug" IS NULL OR "slug" = '';
UPDATE "CorporateCompany" SET "slug" = 'company-'    || "id" WHERE "slug" IS NULL OR "slug" = '';

-- ── 4. De-duplicate collisions ─────────────────────────────────────────
-- For each duplicate (same slug within the scope), append "-2", "-3", …
-- ordered by created_at then id so the oldest row keeps the clean slug.

-- SystemTag: scoped dedupe per (type, slug)
WITH numbered AS (
  SELECT
    "id",
    "slug",
    ROW_NUMBER() OVER (PARTITION BY "type", "slug" ORDER BY "created_at", "id") AS rn
  FROM "SystemTag"
)
UPDATE "SystemTag" t
  SET "slug" = t."slug" || '-' || n.rn
  FROM numbered n
  WHERE t."id" = n."id" AND n.rn > 1;

-- MealRecipe: global dedupe
WITH numbered AS (
  SELECT "id", "slug", ROW_NUMBER() OVER (PARTITION BY "slug" ORDER BY "created_at", "id") AS rn
  FROM "MealRecipe"
)
UPDATE "MealRecipe" t
  SET "slug" = t."slug" || '-' || n.rn
  FROM numbered n
  WHERE t."id" = n."id" AND n.rn > 1;

-- SubRecipe: global dedupe
WITH numbered AS (
  SELECT "id", "slug", ROW_NUMBER() OVER (PARTITION BY "slug" ORDER BY "created_at", "id") AS rn
  FROM "SubRecipe"
)
UPDATE "SubRecipe" t
  SET "slug" = t."slug" || '-' || n.rn
  FROM numbered n
  WHERE t."id" = n."id" AND n.rn > 1;

-- Ingredient: global dedupe
WITH numbered AS (
  SELECT "id", "slug", ROW_NUMBER() OVER (PARTITION BY "slug" ORDER BY "created_at", "id") AS rn
  FROM "Ingredient"
)
UPDATE "Ingredient" t
  SET "slug" = t."slug" || '-' || n.rn
  FROM numbered n
  WHERE t."id" = n."id" AND n.rn > 1;

-- CorporateCompany: global dedupe
WITH numbered AS (
  SELECT "id", "slug", ROW_NUMBER() OVER (PARTITION BY "slug" ORDER BY "created_at", "id") AS rn
  FROM "CorporateCompany"
)
UPDATE "CorporateCompany" t
  SET "slug" = t."slug" || '-' || n.rn
  FROM numbered n
  WHERE t."id" = n."id" AND n.rn > 1;

-- ── 5. Enforce NOT NULL ────────────────────────────────────────────────
ALTER TABLE "SystemTag"        ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "MealRecipe"       ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "SubRecipe"        ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "Ingredient"       ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "CorporateCompany" ALTER COLUMN "slug" SET NOT NULL;

-- ── 6. Unique indexes ──────────────────────────────────────────────────
-- Scoped for SystemTag: same slug allowed across types
CREATE UNIQUE INDEX "SystemTag_type_slug_key" ON "SystemTag"("type", "slug");
CREATE INDEX        "SystemTag_type_idx"      ON "SystemTag"("type");

-- Global for the other four
CREATE UNIQUE INDEX "MealRecipe_slug_key"       ON "MealRecipe"("slug");
CREATE UNIQUE INDEX "SubRecipe_slug_key"        ON "SubRecipe"("slug");
CREATE UNIQUE INDEX "Ingredient_slug_key"       ON "Ingredient"("slug");
CREATE UNIQUE INDEX "CorporateCompany_slug_key" ON "CorporateCompany"("slug");
