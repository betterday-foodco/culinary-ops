/**
 * Standalone cost recalculation script.
 * Mirrors the logic in cost-engine.service.ts exactly.
 * Run with: node scripts/recalculate-costs.js
 */
const { PrismaClient } = require('../node_modules/.prisma/client');
const prisma = new PrismaClient();

// ── Unit normalisation ────────────────────────────────────────────────────────
function normalizeQuantity(quantity, fromUnit, toUnit) {
  const from = (fromUnit ?? '').trim().toLowerCase();
  const to   = (toUnit   ?? '').trim().toLowerCase();
  if (from === to) return quantity;

  const toGrams = (qty, u) => {
    switch (u) {
      case 'g': case 'gr': case 'gram': case 'grams': return qty;
      case 'kg': case 'kgs': case 'kilo': case 'kilos': case 'kilogram': case 'kilograms': return qty * 1000;
      case 'lb': case 'lbs': case 'pound': case 'pounds': return qty * 453.592;
      case 'oz': case 'ounce': case 'ounces': return qty * 28.3495;
      default: return null;
    }
  };

  const toMl = (qty, u) => {
    switch (u) {
      case 'ml': case 'milliliter': case 'milliliters': return qty;
      case 'l': case 'liter': case 'liters': case 'litre': case 'litres': return qty * 1000;
      case 'cup': case 'cups': return qty * 240;
      case 'tbsp': case 'tablespoon': case 'tablespoons': return qty * 15;
      case 'tsp': case 'teaspoon': case 'teaspoons': return qty * 5;
      default: return null;
    }
  };

  const fromGrams     = toGrams(quantity, from);
  const toGramsTarget = fromGrams !== null ? toGrams(1, to) : null;
  if (fromGrams !== null && toGramsTarget !== null && toGramsTarget > 0) {
    return fromGrams / toGramsTarget;
  }

  const fromMl     = toMl(quantity, from);
  const toMlTarget = fromMl !== null ? toMl(1, to) : null;
  if (fromMl !== null && toMlTarget !== null && toMlTarget > 0) {
    return fromMl / toMlTarget;
  }

  return quantity; // count units or unknown
}

function calculateIngredientCost(costPerUnit, ingredientUnit, trimPercentage, componentQuantity, componentUnit) {
  const normalizedQty = normalizeQuantity(componentQuantity, componentUnit, ingredientUnit);
  const safeTrim = Math.min(trimPercentage, 99);
  const trimFactor = safeTrim > 0 ? 1 - safeTrim / 100 : 1;
  return (costPerUnit / trimFactor) * normalizedQty;
}

// ── Sub-recipe cost (recursive) ───────────────────────────────────────────────
async function calculateSubRecipeCost(subRecipeId, visited = new Set()) {
  if (visited.has(subRecipeId)) {
    console.warn(`  [CIRCULAR] sub-recipe ${subRecipeId}`);
    return 0;
  }
  visited.add(subRecipeId);

  const subRecipe = await prisma.subRecipe.findUnique({
    where: { id: subRecipeId },
    include: {
      components: {
        include: {
          ingredient: true,
          child_sub_recipe: {
            select: { id: true, base_yield_weight: true, base_yield_unit: true },
          },
        },
      },
    },
  });
  if (!subRecipe) return 0;

  let totalCost = 0;

  for (const comp of subRecipe.components) {
    if (comp.ingredient) {
      totalCost += calculateIngredientCost(
        comp.ingredient.cost_per_unit,
        comp.ingredient.unit,
        comp.ingredient.trim_percentage,
        comp.quantity,
        comp.unit,
      );
    } else if (comp.child_sub_recipe_id && comp.child_sub_recipe) {
      const childCost = await calculateSubRecipeCost(comp.child_sub_recipe_id, new Set(visited));
      const childYieldInCompUnit = normalizeQuantity(
        comp.child_sub_recipe.base_yield_weight,
        comp.child_sub_recipe.base_yield_unit,
        comp.unit,
      );
      const fraction = childYieldInCompUnit > 0 ? comp.quantity / childYieldInCompUnit : 0;
      totalCost += childCost * fraction;
    }
  }

  return parseFloat(totalCost.toFixed(4));
}

// ── Meal cost ─────────────────────────────────────────────────────────────────
async function calculateMealCost(mealId) {
  const meal = await prisma.mealRecipe.findUnique({
    where: { id: mealId },
    include: {
      components: {
        include: {
          ingredient: true,
          sub_recipe: {
            select: { id: true, base_yield_weight: true, base_yield_unit: true },
          },
        },
      },
    },
  });
  if (!meal) return 0;

  let totalCost = 0;

  for (const comp of meal.components) {
    if (comp.ingredient) {
      totalCost += calculateIngredientCost(
        comp.ingredient.cost_per_unit,
        comp.ingredient.unit,
        comp.ingredient.trim_percentage,
        comp.quantity,
        comp.unit,
      );
    } else if (comp.sub_recipe_id && comp.sub_recipe) {
      const srCost = await calculateSubRecipeCost(comp.sub_recipe_id);
      const batchInCompUnit = normalizeQuantity(
        comp.sub_recipe.base_yield_weight,
        comp.sub_recipe.base_yield_unit,
        comp.unit,
      );
      const fraction = batchInCompUnit > 0 ? comp.quantity / batchInCompUnit : 0;
      totalCost += srCost * fraction;
    }
  }

  return parseFloat(totalCost.toFixed(4));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Cost Recalculation ===\n');

  // 1. Sub-recipes first
  const allSR = await prisma.subRecipe.findMany({ select: { id: true, name: true, computed_cost: true } });
  console.log(`Recalculating ${allSR.length} sub-recipes...`);
  let srDone = 0;
  for (const sr of allSR) {
    const cost = await calculateSubRecipeCost(sr.id);
    await prisma.subRecipe.update({ where: { id: sr.id }, data: { computed_cost: cost } });
    srDone++;
    if (srDone % 50 === 0) process.stdout.write(`  ${srDone}/${allSR.length}...\n`);
  }
  console.log(`  Done — ${allSR.length} sub-recipes updated.\n`);

  // 2. Meals
  const allMeals = await prisma.mealRecipe.findMany({ select: { id: true, display_name: true, meal_code: true } });
  console.log(`Recalculating ${allMeals.length} meals...`);
  const samples = [];
  for (const meal of allMeals) {
    const cost = await calculateMealCost(meal.id);
    await prisma.mealRecipe.update({ where: { id: meal.id }, data: { computed_cost: cost } });
    if (samples.length < 10) samples.push({ code: meal.meal_code, name: meal.display_name, cost });
  }
  console.log(`  Done — ${allMeals.length} meals updated.\n`);

  console.log('=== Sample meal costs (first 10) ===');
  for (const s of samples) {
    console.log(`  [${s.code}] ${s.name.substring(0, 45).padEnd(45)} $${s.cost.toFixed(2)}`);
  }

  // 3. Show top 5 most expensive after fix
  const top5 = await prisma.mealRecipe.findMany({
    orderBy: { computed_cost: 'desc' },
    take: 5,
    select: { meal_code: true, display_name: true, computed_cost: true },
  });
  console.log('\n=== Top 5 most expensive meals (after fix) ===');
  for (const m of top5) {
    console.log(`  [${m.meal_code}] ${m.display_name.substring(0, 45).padEnd(45)} $${m.computed_cost.toFixed(2)}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
