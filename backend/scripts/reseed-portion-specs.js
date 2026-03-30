const { PrismaClient } = require('../node_modules/@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Load extracted Word doc data
// Try multiple locations
let specData = [];
const locations = [
  'D:/portion_specs_extracted.json',
  path.join(__dirname, '../portion_specs_extracted.json'),
  path.join(__dirname, 'portion_specs_extracted.json'),
];
for (const loc of locations) {
  if (fs.existsSync(loc)) {
    specData = JSON.parse(fs.readFileSync(loc, 'utf8'));
    console.log(`Loaded ${specData.length} specs from ${loc}`);
    break;
  }
}
if (!specData.length) {
  console.log('No extracted spec data found — will create empty components from meal ingredients only');
}

function normalize(s) {
  return (s || '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  // word overlap
  const wa = new Set(na.split(' ').filter(w => w.length > 2));
  const wb = new Set(nb.split(' ').filter(w => w.length > 2));
  const intersection = [...wa].filter(w => wb.has(w));
  if (wa.size === 0 || wb.size === 0) return 0;
  return intersection.length / Math.max(wa.size, wb.size);
}

function findDocSpec(mealName) {
  let best = null, bestScore = 0;
  for (const spec of specData) {
    const score = similarity(mealName, spec.meal_name || spec.name || '');
    if (score > bestScore) { bestScore = score; best = spec; }
  }
  return bestScore >= 0.5 ? best : null;
}

function findDocComponent(ingredientName, docComponents) {
  if (!docComponents || !docComponents.length) return null;
  let best = null, bestScore = 0;
  for (const c of docComponents) {
    const score = similarity(ingredientName, c.ingredient_name || c.name || '');
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 0.4 ? best : null;
}

async function main() {
  // Get all meals with their components and existing portion specs
  const meals = await prisma.mealRecipe.findMany({
    where: { is_active: true },
    select: {
      id: true,
      display_name: true,
      meal_code: true,
      components: {
        select: {
          id: true,
          quantity: true,
          unit: true,
          portioning_notes: true,
          ingredient: { select: { id: true, internal_name: true } },
          sub_recipe: { select: { id: true, name: true } },
        },
        orderBy: { sort_order: 'asc' }
      },
      portion_spec: {
        select: { id: true }
      }
    }
  });

  console.log(`Processing ${meals.length} meals...`);
  let updated = 0, skipped = 0, noSpec = 0;

  for (const meal of meals) {
    if (!meal.portion_spec) { noSpec++; continue; }
    if (!meal.components.length) { skipped++; continue; }

    const specId = meal.portion_spec.id;
    const docSpec = findDocSpec(meal.display_name);
    const docComponents = docSpec?.components || docSpec?.items || [];

    if (docSpec) {
      console.log(`✓ ${meal.display_name} → matched "${docSpec.meal_name || docSpec.name}" (${docComponents.length} doc components, ${meal.components.length} actual ingredients)`);
    } else {
      console.log(`○ ${meal.display_name} → no doc match, using ingredients only`);
    }

    // Delete existing spec components
    await prisma.portionSpecComponent.deleteMany({ where: { spec_id: specId } });

    // Recreate from actual meal components
    const newComponents = [];
    for (let i = 0; i < meal.components.length; i++) {
      const comp = meal.components[i];
      const ingredientName = comp.ingredient?.internal_name || comp.sub_recipe?.name || 'Unknown';

      // Try to find matching doc component
      const docComp = findDocComponent(ingredientName, docComponents);

      newComponents.push({
        spec_id: specId,
        ingredient_name: ingredientName,
        portion_min: docComp?.portion_min ?? null,
        portion_max: docComp?.portion_max ?? null,
        portion_unit: docComp?.portion_unit ?? 'g',
        tool: docComp?.tool ?? null,
        notes: docComp?.notes ?? comp.portioning_notes ?? null,
        sort_order: i,
      });
    }

    await prisma.portionSpecComponent.createMany({ data: newComponents });
    updated++;
  }

  console.log(`\nDone: ${updated} specs updated, ${skipped} skipped (no components), ${noSpec} meals without spec`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
