const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function check() {
  const total    = await p.mealRecipe.count();
  const withImg  = await p.mealRecipe.count({ where: { image_url: { not: null } } });
  const withNut  = await p.mealRecipe.count({ where: { calories: { not: null } } });
  const withComp = await p.mealRecipe.count({ where: { components: { some: {} } } });
  const withCost = await p.mealRecipe.count({ where: { computed_cost: { gt: 0 } } });
  const cats     = await p.mealRecipe.groupBy({ by: ['category'], _count: true });
  console.log('Total meals:        ', total);
  console.log('With image:         ', withImg);
  console.log('With nutrition data:', withNut);
  console.log('With components:    ', withComp);
  console.log('With computed cost: ', withCost);
  console.log('\nBy category:');
  cats.forEach(c => console.log(' ', (c.category || '(none)').padEnd(24), c._count));
  await p.$disconnect();
}
check().catch(console.error);
