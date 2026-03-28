/**
 * Exports all active meals to two files:
 * 1. meals-export.csv  — spreadsheet-friendly for sharing
 * 2. meals-export.json — developer-friendly for API integration
 */
const { PrismaClient } = require('../node_modules/.prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const s = Array.isArray(val) ? val.join(', ') : String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const meals = await prisma.mealRecipe.findMany({
    where: { is_active: true },
    select: {
      meal_code: true,
      display_name: true,
      category: true,
      pricing_override: true,
      computed_cost: true,
      description: true,
      short_description: true,
      image_url: true,
      calories: true,
      protein_g: true,
      carbs_g: true,
      fat_g: true,
      fiber_g: true,
      net_weight_kg: true,
      shelf_life_days: true,
      allergen_tags: true,
      dietary_tags: true,
      protein_types: true,
      starch_type: true,
      container_type: true,
      label_ingredients: true,
      heating_instructions: true,
      packaging_instructions: true,
    },
    orderBy: { meal_code: 'asc' }
  });

  const outDir = path.join(__dirname, '../exports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // ── CSV ───────────────────────────────────────────────────────────────────
  const csvHeaders = [
    'BD Code', 'Display Name', 'Category',
    'Sell Price ($)', 'Production Cost ($)',
    'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Fiber (g)',
    'Net Weight (kg)', 'Shelf Life (days)',
    'Allergens', 'Dietary Tags', 'Protein Types',
    'Starch Type', 'Container Type',
    'Description', 'Short Description',
    'Heating Instructions',
    'Image URL', 'Label Ingredients',
  ];

  const csvRows = meals.map(m => [
    m.meal_code,
    m.display_name,
    m.category ?? '',
    m.pricing_override ?? '',
    m.computed_cost?.toFixed(2) ?? '',
    m.calories ?? '',
    m.protein_g ?? '',
    m.carbs_g ?? '',
    m.fat_g ?? '',
    m.fiber_g ?? '',
    m.net_weight_kg ?? '',
    m.shelf_life_days ?? '',
    (m.allergen_tags ?? []).join(', '),
    (m.dietary_tags ?? []).join(', '),
    (m.protein_types ?? []).join(', '),
    m.starch_type ?? '',
    m.container_type ?? '',
    m.description ?? '',
    m.short_description ?? '',
    m.heating_instructions ?? '',
    m.image_url ?? '',
    m.label_ingredients ?? '',
  ].map(escapeCsv).join(','));

  const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
  const csvPath = path.join(outDir, 'meals-export.csv');
  fs.writeFileSync(csvPath, csvContent, 'utf8');

  // ── JSON ──────────────────────────────────────────────────────────────────
  const jsonData = meals.map(m => ({
    bd_code: m.meal_code,
    display_name: m.display_name,
    category: m.category,
    price: m.pricing_override,
    production_cost: parseFloat((m.computed_cost ?? 0).toFixed(2)),
    image_url: m.image_url,
    description: m.description,
    short_description: m.short_description,
    heating_instructions: m.heating_instructions,
    macros: {
      calories: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      fiber_g: m.fiber_g,
    },
    net_weight_kg: m.net_weight_kg,
    shelf_life_days: m.shelf_life_days,
    allergen_tags: m.allergen_tags ?? [],
    dietary_tags: m.dietary_tags ?? [],
    protein_types: m.protein_types ?? [],
    starch_type: m.starch_type,
    container_type: m.container_type,
    label_ingredients: m.label_ingredients,
  }));

  const jsonPath = path.join(outDir, 'meals-export.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('=== Meal Export Complete ===\n');
  console.log('Total active meals:', meals.length);
  console.log('CSV →', csvPath);
  console.log('JSON →', jsonPath);
  console.log('\n=== Data Completeness ===');
  console.log('Has sell price:    ', meals.filter(m => m.pricing_override).length + '/' + meals.length);
  console.log('Has image URL:     ', meals.filter(m => m.image_url).length + '/' + meals.length);
  console.log('Has description:   ', meals.filter(m => m.description).length + '/' + meals.length);
  console.log('Has macros:        ', meals.filter(m => m.calories).length + '/' + meals.length);
  console.log('Has allergens:     ', meals.filter(m => m.allergen_tags?.length > 0).length + '/' + meals.length);
  console.log('Has dietary tags:  ', meals.filter(m => m.dietary_tags?.length > 0).length + '/' + meals.length);
  console.log('Has heating instr: ', meals.filter(m => m.heating_instructions).length + '/' + meals.length);

  console.log('\n=== Sample (first 5 BD codes + names) ===');
  meals.slice(0, 5).forEach(m =>
    console.log(' ', m.meal_code?.padEnd(8), m.display_name, m.pricing_override ? '  $' + m.pricing_override : '  (no price)')
  );
  console.log('  ...');
  meals.slice(-3).forEach(m =>
    console.log(' ', m.meal_code?.padEnd(8), m.display_name, m.pricing_override ? '  $' + m.pricing_override : '  (no price)')
  );
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
