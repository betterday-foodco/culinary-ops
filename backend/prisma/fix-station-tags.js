const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  const r1 = await prisma.subRecipe.updateMany({ where: { station_tag: 'Hot Kitchen' }, data: { station_tag: 'Oven Station' } });
  console.log(`Hot Kitchen → Oven Station: ${r1.count} records`);
  const r2 = await prisma.subRecipe.updateMany({ where: { station_tag: 'Oven' }, data: { station_tag: 'Oven Station' } });
  console.log(`Oven → Oven Station: ${r2.count} records`);
  // Merge Breakfast variants
  const r3 = await prisma.subRecipe.updateMany({ where: { station_tag: 'Breakfast' }, data: { station_tag: 'Breakfast + Sides Station' } });
  console.log(`Breakfast → Breakfast + Sides Station: ${r3.count} records`);
  const r4 = await prisma.subRecipe.updateMany({ where: { station_tag: 'Breakfast Station' }, data: { station_tag: 'Breakfast + Sides Station' } });
  console.log(`Breakfast Station → Breakfast + Sides Station: ${r4.count} records`);
  // Show remaining distinct station tags
  const tags = await prisma.subRecipe.groupBy({ by: ['station_tag'], _count: { station_tag: true } });
  console.log('Current station tags:', tags.map(t => `${t.station_tag}(${t._count.station_tag})`).join(', '));
}
main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
