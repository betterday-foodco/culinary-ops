/**
 * Fast meal cost recalculation using pre-computed sub-recipe costs.
 * Sub-recipes must already have correct computed_cost values before running this.
 */
const { PrismaClient } = require('../node_modules/.prisma/client');
const prisma = new PrismaClient();

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

  const fromGrams = toGrams(quantity, from);
  const toGramsT  = fromGrams !== null ? toGrams(1, to) : null;
  if (fromGrams !== null && toGramsT !== null && toGramsT > 0) return fromGrams / toGramsT;

  const fromMl  = toMl(quantity, from);
  const toMlT   = fromMl !== null ? toMl(1, to) : null;
  if (fromMl !== null && toMlT !== null && toMlT > 0) return fromMl / toMlT;

  return quantity;
}

function calculateIngredientCost(costPerUnit, ingredientUnit, trimPercentage, qty, unit) {
  const nqty = normalizeQuantity(qty, unit, ingredientUnit);
  const safeTrim = Math.min(trimPercentage, 99);
  const trimFactor = safeTrim > 0 ? 1 - safeTrim / 100 : 1;
  return (costPerUnit / trimFactor) * nqty;
}

async function main() {
  console.log('=== Fast Meal Cost Recalculation ===\n');
  console.log('Loading all meals with components...');

  const meals = await prisma.mealRecipe.findMany({
    select: {
      id: true,
      meal_code: true,
      display_name: true,
      components: {
        select: {
          quantity: true,
          unit: true,
          ingredient: {
            select: { cost_per_unit: true, unit: true, trim_percentage: true },
          },
          sub_recipe: {
            select: { id: true, computed_cost: true, base_yield_weight: true, base_yield_unit: true },
          },
        },
      },
    },
  });

  console.log(`Processing ${meals.length} meals...\n`);

  const results = [];
  for (const meal of meals) {
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
      } else if (comp.sub_recipe) {
        const sr = comp.sub_recipe;
        const batchInCompUnit = normalizeQuantity(sr.base_yield_weight, sr.base_yield_unit, comp.unit);
        const fraction = batchInCompUnit > 0 ? comp.quantity / batchInCompUnit : 0;
        totalCost += sr.computed_cost * fraction;
      }
    }
    const cost = parseFloat(totalCost.toFixed(4));
    results.push({ id: meal.id, cost, code: meal.meal_code, name: meal.display_name });
  }

  // Bulk update
  console.log('Writing to DB...');
  for (const r of results) {
    await prisma.mealRecipe.update({ where: { id: r.id }, data: { computed_cost: r.cost } });
  }

  console.log(`Updated ${results.length} meals.\n`);

  // Show sample + top 5
  console.log('=== Sample costs (first 15) ===');
  results.slice(0, 15).forEach(r => {
    console.log(`  [${(r.code ?? '?').padEnd(8)}] ${r.name.substring(0, 45).padEnd(45)} $${r.cost.toFixed(2)}`);
  });

  const top5 = [...results].sort((a, b) => b.cost - a.cost).slice(0, 5);
  console.log('\n=== Top 5 most expensive ===');
  top5.forEach(r => {
    console.log(`  [${(r.code ?? '?').padEnd(8)}] ${r.name.substring(0, 45).padEnd(45)} $${r.cost.toFixed(2)}`);
  });

  const avg = results.reduce((s, r) => s + r.cost, 0) / results.length;
  const zeroCost = results.filter(r => r.cost === 0).length;
  console.log(`\nAverage meal cost: $${avg.toFixed(2)}`);
  console.log(`Meals with $0 cost (no components or missing data): ${zeroCost}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
