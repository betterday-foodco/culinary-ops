/**
 * In-memory cost recalculation — loads everything in 3 queries, computes in JS.
 * Avoids Neon serverless connection timeouts from many sequential round-trips.
 */
const { PrismaClient } = require('../node_modules/.prisma/client');
const prisma = new PrismaClient();

function norm(qty, from, to) {
  const f = (from ?? '').trim().toLowerCase();
  const t = (to   ?? '').trim().toLowerCase();
  if (f === t) return qty;
  const toG = (q, u) => {
    switch (u) {
      case 'g': case 'gr': case 'gram': case 'grams': return q;
      case 'kg': case 'kgs': case 'kilo': case 'kilos': case 'kilogram': case 'kilograms': return q * 1000;
      case 'lb': case 'lbs': case 'pound': case 'pounds': return q * 453.592;
      case 'oz': case 'ounce': case 'ounces': return q * 28.3495;
      default: return null;
    }
  };
  const toMl = (q, u) => {
    switch (u) {
      case 'ml': case 'milliliter': case 'milliliters': return q;
      case 'l': case 'liter': case 'liters': case 'litre': case 'litres': return q * 1000;
      case 'cup': case 'cups': return q * 240;
      case 'tbsp': case 'tablespoon': case 'tablespoons': return q * 15;
      case 'tsp': case 'teaspoon': case 'teaspoons': return q * 5;
      default: return null;
    }
  };
  const fg = toG(qty, f); const tgt = fg !== null ? toG(1, t) : null;
  if (fg !== null && tgt !== null && tgt > 0) return fg / tgt;
  const fm = toMl(qty, f); const tgtm = fm !== null ? toMl(1, t) : null;
  if (fm !== null && tgtm !== null && tgtm > 0) return fm / tgtm;
  return qty;
}

async function main() {
  console.log('Loading all data into memory...');

  // Load ingredients
  const ingredients = await prisma.ingredient.findMany({
    select: { id: true, cost_per_unit: true, unit: true, trim_percentage: true }
  });
  const ingMap = Object.fromEntries(ingredients.map(i => [i.id, i]));

  // Load sub-recipes + their components
  const subRecipes = await prisma.subRecipe.findMany({
    select: {
      id: true, name: true, base_yield_weight: true, base_yield_unit: true,
      components: {
        select: {
          ingredient_id: true, child_sub_recipe_id: true,
          quantity: true, unit: true, trim_percentage: true
        }
      }
    }
  });
  const srMap = Object.fromEntries(subRecipes.map(s => [s.id, s]));
  const srCosts = {}; // will be populated

  // Load meals + their components
  const meals = await prisma.mealRecipe.findMany({
    select: {
      id: true, meal_code: true, display_name: true,
      components: {
        select: {
          ingredient_id: true, sub_recipe_id: true, quantity: true, unit: true
        }
      }
    }
  });

  console.log(`Loaded: ${ingredients.length} ingredients, ${subRecipes.length} sub-recipes, ${meals.length} meals\n`);

  // Compute sub-recipe costs (recursive, memoised)
  function calcSR(id, visited = new Set()) {
    if (visited.has(id)) return 0;
    if (srCosts[id] !== undefined) return srCosts[id];

    const sr = srMap[id];
    if (!sr) return 0;

    const v2 = new Set(visited);
    v2.add(id);

    let total = 0;
    for (const c of sr.components) {
      if (c.ingredient_id) {
        const ing = ingMap[c.ingredient_id];
        if (!ing) continue;
        const n = norm(c.quantity, c.unit, ing.unit);
        const trim = Math.min(c.trim_percentage ?? ing.trim_percentage, 99);
        const tf = trim > 0 ? 1 - trim / 100 : 1;
        total += (ing.cost_per_unit / tf) * n;
      } else if (c.child_sub_recipe_id) {
        const child = srMap[c.child_sub_recipe_id];
        if (!child) continue;
        const childCost = calcSR(c.child_sub_recipe_id, v2);
        const yld = norm(child.base_yield_weight, child.base_yield_unit, c.unit);
        total += childCost * (yld > 0 ? c.quantity / yld : 0);
      }
    }

    srCosts[id] = parseFloat(total.toFixed(4));
    return srCosts[id];
  }

  console.log('Computing sub-recipe costs...');
  for (const sr of subRecipes) calcSR(sr.id);
  console.log(`Done: ${Object.keys(srCosts).length} sub-recipes computed.\n`);

  // Compute meal costs
  const mealResults = [];
  for (const meal of meals) {
    let total = 0;
    for (const c of meal.components) {
      if (c.ingredient_id) {
        const ing = ingMap[c.ingredient_id];
        if (!ing) continue;
        const n = norm(c.quantity, c.unit, ing.unit);
        const tf = ing.trim_percentage > 0 ? 1 - Math.min(ing.trim_percentage, 99) / 100 : 1;
        total += (ing.cost_per_unit / tf) * n;
      } else if (c.sub_recipe_id) {
        const sr = srMap[c.sub_recipe_id];
        if (!sr) continue;
        const srCost = srCosts[c.sub_recipe_id] ?? 0;
        const b = norm(sr.base_yield_weight, sr.base_yield_unit, c.unit);
        total += srCost * (b > 0 ? c.quantity / b : 0);
      }
    }
    mealResults.push({ id: meal.id, cost: parseFloat(total.toFixed(4)), code: meal.meal_code, name: meal.display_name });
  }

  // Write sub-recipe costs in batches
  console.log('Writing sub-recipe costs to DB...');
  const srEntries = Object.entries(srCosts);
  for (let i = 0; i < srEntries.length; i += 50) {
    const batch = srEntries.slice(i, i + 50);
    await Promise.all(batch.map(([id, cost]) =>
      prisma.subRecipe.update({ where: { id }, data: { computed_cost: cost } })
    ));
    process.stdout.write(`  ${Math.min(i + 50, srEntries.length)}/${srEntries.length}\n`);
  }

  // Write meal costs in batches
  console.log('\nWriting meal costs to DB...');
  for (let i = 0; i < mealResults.length; i += 50) {
    const batch = mealResults.slice(i, i + 50);
    await Promise.all(batch.map(r =>
      prisma.mealRecipe.update({ where: { id: r.id }, data: { computed_cost: r.cost } })
    ));
  }
  console.log(`Done: ${mealResults.length} meals updated.\n`);

  // Stats
  const top5 = [...mealResults].sort((a, b) => b.cost - a.cost).slice(0, 5);
  console.log('=== Top 5 most expensive meals ===');
  top5.forEach(r => console.log(`  [${r.code}] ${r.name.substring(0, 45).padEnd(45)} $${r.cost.toFixed(2)}`));

  const avg = mealResults.reduce((s, r) => s + r.cost, 0) / mealResults.length;
  const zeroCost = mealResults.filter(r => r.cost === 0).length;
  console.log(`\nAverage meal cost: $${avg.toFixed(2)}`);
  console.log(`Meals with $0 cost: ${zeroCost}`);

  // Spot-check
  const spot = mealResults.filter(r => r.name.toLowerCase().includes('caesar') || r.name.toLowerCase().includes('chicken caesar'));
  console.log('\nCaesar meals:');
  spot.forEach(r => console.log(`  [${r.code}] ${r.name} -> $${r.cost}`));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
