/**
 * Seeds PortionSpec + PortionSpecComponent records from extracted JSON.
 * Matches meal names fuzzy-first, then exact. Skips unmatched.
 */
const { PrismaClient } = require('../node_modules/.prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 '&-]/g, '')
    .trim();
}

function parseWeight(wt) {
  if (!wt || wt.includes('____')) return [null, null];
  // e.g. "425 - 460g" or "448-478g" or "370g - 425g"
  const clean = wt.replace(/g\s*/gi, '').replace(/\s/g, '');
  const parts = clean.split(/[-–|]/);
  const nums = parts.map(p => parseFloat(p)).filter(n => !isNaN(n));
  if (nums.length >= 2) return [nums[0], nums[nums.length - 1]];
  if (nums.length === 1) return [nums[0], nums[0]];
  return [null, null];
}

function parsePortionRange(range) {
  if (!range) return [null, null, 'g'];
  // e.g. "300-310g", "2.5 oz. Portion Cup", "1 un", "5-8g", "2oz"
  const clean = range.trim();

  // Check for unit-only strings (e.g. "2.5 oz. Portion Cup", "1 oz", "2oz")
  const ozMatch = clean.match(/^([\d.]+)\s*oz/i);
  if (ozMatch) return [parseFloat(ozMatch[1]), null, 'oz'];

  const unMatch = clean.match(/^([\d.]+)\s*(un|pc|pcs|pieces?)/i);
  if (unMatch) return [parseFloat(unMatch[1]), null, 'un'];

  const gMatch = clean.match(/^([\d.]+)\s*-\s*([\d.]+)\s*g/i);
  if (gMatch) return [parseFloat(gMatch[1]), parseFloat(gMatch[2]), 'g'];

  const gSingle = clean.match(/^([\d.]+)\s*g/i);
  if (gSingle) return [parseFloat(gSingle[1]), null, 'g'];

  const rangeOnly = clean.match(/^([\d.]+)\s*-\s*([\d.]+)/);
  if (rangeOnly) return [parseFloat(rangeOnly[1]), parseFloat(rangeOnly[2]), 'g'];

  const numOnly = clean.match(/^([\d.]+)/);
  if (numOnly) return [parseFloat(numOnly[1]), null, null];

  return [null, null, null];
}

function normalizeContainer(ct) {
  if (!ct) return null;
  const l = ct.toLowerCase().trim();
  if (l.includes('salad') || l.includes('bowl')) return 'Salad Container';
  if (l.includes('soup')) return 'Soup Container';
  if (l.includes('regular') || l.includes('meal')) return 'Regular Meal Container';
  if (l.trim()) return ct.trim();
  return null;
}

async function main() {
  const specsData = JSON.parse(fs.readFileSync('D:/portion_specs_extracted.json', 'utf-8'));

  // Load all meals
  const meals = await prisma.mealRecipe.findMany({
    select: { id: true, meal_code: true, display_name: true, name: true }
  });

  // Build lookup maps
  const byNormName = new Map();
  for (const m of meals) {
    byNormName.set(normalize(m.display_name), m);
    if (m.name) byNormName.set(normalize(m.name), m);
  }

  let created = 0, updated = 0, skipped = 0;
  const skipLog = [];

  for (const spec of specsData) {
    const normSpecName = normalize(spec.name);

    // Try exact match first
    let meal = byNormName.get(normSpecName);

    // Fuzzy fallback: try removing trailing words or common suffixes
    if (!meal) {
      for (const [key, m] of byNormName.entries()) {
        if (key.includes(normSpecName) || normSpecName.includes(key)) {
          meal = m;
          break;
        }
      }
    }

    if (!meal) {
      skipLog.push(spec.name);
      skipped++;
      continue;
    }

    const [weightMin, weightMax] = parseWeight(spec.total_weight);
    const containerType = normalizeContainer(spec.container_type);

    // Build components
    const components = (spec.components || [])
      .filter(c => c.ingredient_name && c.ingredient_name !== 'Ingredient Name')
      .map((c, idx) => {
        const [pMin, pMax, pUnit] = parsePortionRange(c.portion_range);
        return {
          ingredient_name: c.ingredient_name,
          portion_min: pMin,
          portion_max: pMax,
          portion_unit: pUnit || 'g',
          tool: c.tool || null,
          notes: c.notes || null,
          sort_order: idx,
        };
      });

    // Check if spec already exists
    const existing = await prisma.portionSpec.findUnique({ where: { meal_id: meal.id } });

    if (existing) {
      // Delete old components and update
      await prisma.portionSpecComponent.deleteMany({ where: { spec_id: existing.id } });
      await prisma.portionSpec.update({
        where: { id: existing.id },
        data: {
          container_type: containerType,
          total_weight_min: weightMin,
          total_weight_max: weightMax,
          components: { createMany: { data: components } },
        },
      });
      updated++;
    } else {
      await prisma.portionSpec.create({
        data: {
          meal_id: meal.id,
          container_type: containerType,
          total_weight_min: weightMin,
          total_weight_max: weightMax,
          components: { createMany: { data: components } },
        },
      });
      created++;
    }
  }

  console.log(`\n=== Portion Specs Seed Complete ===`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no meal match): ${skipped}`);
  if (skipLog.length > 0) {
    console.log('\nUnmatched meal names:');
    skipLog.forEach(n => console.log('  -', n));
  }

  const total = await prisma.portionSpec.count();
  console.log(`\nTotal portion specs in DB: ${total}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
