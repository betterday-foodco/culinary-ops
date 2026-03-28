/**
 * Fix duplicate ingredient records.
 *
 * Pattern discovered: sub-recipes point to ING-XXX versions (cost $0),
 * while the real-priced EBD-XXX / supplier-code versions are unused.
 *
 * Fix: for each duplicate name group, update all component references to point
 * to the version with the highest cost (the real priced one), then delete the orphans.
 */
const { PrismaClient } = require('../node_modules/.prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Fix Duplicate Ingredients ===\n');

  // 1. Load all ingredients grouped by normalised name
  const all = await prisma.ingredient.findMany({
    select: {
      id: true, internal_name: true, sku: true, cost_per_unit: true, unit: true,
      _count: { select: { sub_recipe_components: true, meal_components: true } }
    }
  });

  const groups = {};
  for (const i of all) {
    const key = i.internal_name.toLowerCase().trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(i);
  }

  const dupes = Object.entries(groups).filter(([, v]) => v.length > 1);
  console.log(`Found ${dupes.length} duplicate name groups.\n`);

  let totalRelinked = 0;
  let totalDeleted = 0;
  const skipped = [];

  for (const [name, variants] of dupes) {
    // Pick the "winner": the variant with the highest cost_per_unit
    // (if tie at 0, pick the one with actual supplier SKU — not ING- prefix)
    variants.sort((a, b) => {
      if (b.cost_per_unit !== a.cost_per_unit) return b.cost_per_unit - a.cost_per_unit;
      // Prefer non-ING- SKUs when costs are equal
      const aIsIng = a.sku.startsWith('ING-');
      const bIsIng = b.sku.startsWith('ING-');
      if (aIsIng && !bIsIng) return 1;
      if (!aIsIng && bIsIng) return -1;
      return 0;
    });

    const winner = variants[0];
    const losers = variants.slice(1);

    for (const loser of losers) {
      const srUses = loser._count.sub_recipe_components;
      const mealUses = loser._count.meal_components;

      if (srUses === 0 && mealUses === 0) {
        // Safe to just delete — no references
        await prisma.ingredient.delete({ where: { id: loser.id } });
        totalDeleted++;
        continue;
      }

      // Relink sub-recipe components
      if (srUses > 0) {
        const relinked = await prisma.subRecipeComponent.updateMany({
          where: { ingredient_id: loser.id },
          data: { ingredient_id: winner.id }
        });
        console.log(`  Relinked ${relinked.count} SR components: "${variants[0].internal_name}" [${loser.sku}→${winner.sku}]`);
        totalRelinked += relinked.count;
      }

      // Relink meal components
      if (mealUses > 0) {
        const relinked = await prisma.mealComponent.updateMany({
          where: { ingredient_id: loser.id },
          data: { ingredient_id: winner.id }
        });
        console.log(`  Relinked ${relinked.count} meal components: "${variants[0].internal_name}" [${loser.sku}→${winner.sku}]`);
        totalRelinked += relinked.count;
      }

      // Now safe to delete the loser
      try {
        await prisma.ingredient.delete({ where: { id: loser.id } });
        totalDeleted++;
      } catch (e) {
        skipped.push({ name, loserId: loser.id, error: e.message });
      }
    }
  }

  console.log(`\n✅ Relinked ${totalRelinked} component references`);
  console.log(`✅ Deleted ${totalDeleted} duplicate ingredient records`);
  if (skipped.length > 0) {
    console.log(`\n⚠️  Skipped ${skipped.length} (still have references):`);
    skipped.forEach(s => console.log('  ' + s.name + ': ' + s.error));
  }

  // Verify
  const remaining = await prisma.ingredient.count();
  const zeroCostWithUses = await prisma.subRecipeComponent.count({
    where: { ingredient: { cost_per_unit: 0, internal_name: { not: { in: ['Water', 'Gochujang', 'Frozen Lime Leaves', 'Frozen Minced Lemongrass'] } } } }
  });
  console.log(`\nIngredients remaining: ${remaining}`);
  console.log(`SR components still pointing to non-water $0 ingredients: ${zeroCostWithUses}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
