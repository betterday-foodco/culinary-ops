-- Drop the orphan `net_weight_kg` column from MealRecipe.
--
-- This field was only ever written from one UI form and never consumed by any
-- report, cost engine, label, production plan, or integration. The real weight
-- field is `final_yield_weight`. See
-- conner/data-model/decisions/2026-04-08-mandatory-diet-plan-on-dishes.md
-- ("Bundled cleanup" section) for the full audit.
ALTER TABLE "MealRecipe" DROP COLUMN IF EXISTS "net_weight_kg";
