-- Flip MealRecipe.diet_plan_id to NOT NULL. Every dish was backfilled from
-- the Dish Masterlist CSV on 2026-04-08 and the manual Phase 2 assignments
-- from the ADR. 159 meals classified, 0 nulls. From now on, no meal can be
-- created or saved without an explicit Omnivore or Plant-Based designation.
--
-- See conner/data-model/decisions/2026-04-08-mandatory-diet-plan-on-dishes.md
ALTER TABLE "MealRecipe" ALTER COLUMN "diet_plan_id" SET NOT NULL;
