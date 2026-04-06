/**
 * Import/Update Script — Ingredient Masterlist + Sub-Recipe Masterlist + Dish Masterlist
 *
 * Run from backend/: node scripts/import-new-csvs.js
 *
 * Strategy:
 *   Ingredients  — upsert by SKU "ING-{extId}"; fallback match by internal_name
 *   Sub-recipes  — upsert by sub_recipe_code "SR-{extId}"; sync components after
 *   Meals        — match by display_name; create if missing (auto BD-xxx code); sync SR components
 */

const fs     = require('fs');
const path   = require('path');
const { PrismaClient } = require('../node_modules/@prisma/client');

const prisma = new PrismaClient();

const INGREDIENT_CSV  = 'D:/NEW Culinary Inventory Sheet - Ingredient Masterlist (1).csv';
const SUB_RECIPE_CSV  = 'D:/NEW Culinary App Database - Sub-Recipe Masterlist (5).csv';
const DISH_CSV        = 'D:/NEW Culinary App Database - Dish Masterlist (4).csv';

// ─── CSV parser (handles multiline quoted fields) ────────────────────────────
function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''); // strip BOM
  const rows = [];
  let cur = '';
  let inQ = false;
  let fields = [];

  const flush = () => { fields.push(cur.replace(/\r/g, '').trim()); cur = ''; };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      if (inQ && content[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      flush();
    } else if (ch === '\n' && !inQ) {
      flush();
      if (fields.some(f => f)) rows.push(fields);
      fields = [];
    } else {
      cur += ch;
    }
  }
  flush();
  if (fields.some(f => f)) rows.push(fields);
  return rows;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const norm = (s) => (s || '').toLowerCase().trim();

function parseMoney(s) {
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function parseFloat2(s) {
  const n = parseFloat((s || '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// ─── Map category names from CSV to our schema ────────────────────────────────
function mapCategory(cat) {
  if (!cat) return null;
  if (cat === 'Meat') return 'Meat';
  if (cat === 'Veg') return 'Vegan';
  if (cat === '*Breakie') return 'Breakfast';
  if (cat === '*Cookies') return 'Snacks';
  if (cat === '*Granola') return 'Snacks';
  if (cat === '*ProPack') return 'Snacks';
  if (cat === '*Snack') return 'Snacks';
  if (cat === 'Bulk Prep') return 'Bulk Prep';
  if (cat === 'Bulk Sauce') return 'Bulk Sauce';
  return cat;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {

// ─── 1. Parse CSVs ───────────────────────────────────────────────────────────
console.log('Parsing CSVs…');

// Ingredients: [ID, URL, Ingredient Name, Vendor, Vendor SKU, Case Price, Case Size, Case Unit, Storage, Last Used, Theo On Hand, On Order, Location, Trim %]
const ingRows = parseCsv(INGREDIENT_CSV);
const ingredients = ingRows.slice(1).map(r => ({
  extId:     r[0],
  name:      r[2],
  vendor:    r[3],
  casePrice: parseMoney(r[5]),
  caseSize:  parseFloat2(r[6]),
  caseUnit:  (r[7] || 'kg').trim(),
  storage:   (r[8] || '').trim(),
  location:  (r[12] || '').trim(),
  trim:      parseFloat2(r[13]),
})).filter(i => i.extId && i.name);

console.log(`  ${ingredients.length} ingredients`);

// Sub-recipes: [Station, Day, Priority, SR-ID, URL, SR Name, Ing-ID, Ing Name, Trim%, Qty, Unit, Instructions]
const srRows = parseCsv(SUB_RECIPE_CSV);
const srMap = new Map(); // extId → { data, components[] }

for (const row of srRows.slice(1)) {
  const srId   = row[3] ? row[3].trim() : '';
  const srName = row[5] ? row[5].trim() : '';
  if (!srId) continue;

  if (srName && !srMap.has(srId)) { // first time seeing this SR
    srMap.set(srId, {
      extId:        srId,
      name:         srName,
      station:      (row[0] || '').trim(),
      day:          (row[1] || '').trim(),
      priority:     parseInt(row[2]) || 3,
      instructions: (row[11] || '').trim(),
      qty:          parseFloat2(row[9]),
      unit:         (row[10] || 'Kgs').trim(),
      components:   [],
    });
  } else if (srMap.has(srId) && srName && !srMap.get(srId).instructions && row[11]) {
    srMap.get(srId).instructions = row[11].trim();
  }

  // ingredient component line
  const ingId = row[6] ? row[6].trim() : '';
  if (srId && ingId && srMap.has(srId)) {
    srMap.get(srId).components.push({
      ingExtId: ingId,
      qty:      parseFloat2(row[9]),
      unit:     (row[10] || 'Kgs').trim(),
      trim:     parseFloat2(row[8]),
    });
  }
}

console.log(`  ${srMap.size} sub-recipes`);

// Dishes: first col = extId; if col[2]=category → header row, else component row
const dishRows = parseCsv(DISH_CSV);
const dishMap = new Map(); // extId → { data, components[] }

for (const row of dishRows.slice(1)) {
  const extId = row[0] ? row[0].trim() : '';
  if (!extId) continue;

  if (row[2] && row[2].trim()) { // header row (has category)
    dishMap.set(extId, {
      extId,
      name:       row[3] ? row[3].trim() : '',
      category:   row[2].trim(),
      price:      parseMoney(row[8]),
      components: [],
    });
  } else if (row[4] && row[4].trim()) { // component row (has SR ID)
    const dish = dishMap.get(extId);
    if (dish) {
      dish.components.push({
        srExtId: row[4].trim(),
        srName:  row[5] ? row[5].trim() : '',
        qty:     parseFloat2(row[6]),
        unit:    (row[7] || 'gr').trim(),
      });
    }
  }
}

console.log(`  ${dishMap.size} dishes`);

// ─── 2. Upsert Ingredients ───────────────────────────────────────────────────
console.log('\nStep 1/3 — Upserting ingredients…');

const existingIngs = await prisma.ingredient.findMany({
  select: { id: true, internal_name: true, sku: true },
});
const ingByName = new Map(existingIngs.map(i => [norm(i.internal_name), i]));
const ingBySku  = new Map(existingIngs.map(i => [i.sku, i]));

const ingIdMap  = new Map(); // extId → prismaId
let ingCreated = 0, ingUpdated = 0;

for (const ing of ingredients) {
  const sku = `ING-${ing.extId}`;

  let existing = ingBySku.get(sku);
  if (!existing) existing = ingByName.get(norm(ing.name));

  if (existing) {
    const updateData = {};
    if (ing.location) updateData.location = ing.location;
    if (ing.trim) updateData.trim_percentage = ing.trim;
    if (ing.casePrice && ing.caseSize > 0) updateData.cost_per_unit = +(ing.casePrice / ing.caseSize).toFixed(4);
    if (ing.vendor) updateData.supplier_name = ing.vendor;
    if (Object.keys(updateData).length) {
      await prisma.ingredient.update({ where: { id: existing.id }, data: updateData });
    }
    ingIdMap.set(ing.extId, existing.id);
    ingUpdated++;
  } else {
    const catGuess = ing.storage.includes('Freezer') ? 'Frozen'
      : ing.storage.includes('Dry') ? 'Dry' : 'Produce';
    const newIng = await prisma.ingredient.create({
      data: {
        sku:             sku,
        internal_name:   ing.name,
        display_name:    ing.name,
        category:        catGuess,
        supplier_name:   ing.vendor || null,
        location:        ing.location || null,
        trim_percentage: ing.trim,
        cost_per_unit:   ing.casePrice && ing.caseSize > 0 ? +(ing.casePrice / ing.caseSize).toFixed(4) : 0,
        unit:            ing.caseUnit.toLowerCase().includes('kg') ? 'Kgs' : ing.caseUnit,
        base_weight:     ing.caseSize || 1,
        is_active:       true,
      },
    });
    ingIdMap.set(ing.extId, newIng.id);
    ingCreated++;
  }
}

console.log(`  Created: ${ingCreated}  Updated: ${ingUpdated}`);

// ─── 3. Upsert Sub-Recipes ───────────────────────────────────────────────────
console.log('\nStep 2/3 — Upserting sub-recipes…');

const existingSrs = await prisma.subRecipe.findMany({
  select: { id: true, sub_recipe_code: true },
});
const srBySku = new Map(existingSrs.map(s => [s.sub_recipe_code, s]));
const srIdMap = new Map(); // extId → prismaId
let srCreated = 0, srUpdated = 0;

for (const [extId, sr] of srMap) {
  const code = `SR-${extId}`;
  const existing = srBySku.get(code);

  const stationRaw = sr.station.split('-')[0].trim();
  const stationTag = stationRaw ? `${stationRaw} Station` : null;

  if (existing) {
    const updateData = {
      name:           sr.name,
      display_name:   sr.name,
      priority:       sr.priority,
    };
    if (sr.instructions) updateData.instructions = sr.instructions;
    if (stationTag) updateData.station_tag = stationTag;
    if (sr.day) updateData.production_day = sr.day;
    if (sr.qty) updateData.base_yield_weight = sr.qty;
    if (sr.unit) updateData.base_yield_unit = sr.unit;
    await prisma.subRecipe.update({ where: { id: existing.id }, data: updateData });
    srIdMap.set(extId, existing.id);
    srUpdated++;
  } else {
    const newSr = await prisma.subRecipe.create({
      data: {
        sub_recipe_code:   code,
        name:              sr.name,
        display_name:      sr.name,
        instructions:      sr.instructions || null,
        station_tag:       stationTag,
        production_day:    sr.day || null,
        priority:          sr.priority,
        base_yield_weight: sr.qty || 1,
        base_yield_unit:   sr.unit || 'Kgs',
        is_active:         true,
      },
    });
    srIdMap.set(extId, newSr.id);
    srCreated++;
  }
}

console.log(`  Created: ${srCreated}  Updated: ${srUpdated}`);

console.log('  Syncing sub-recipe components…');
let srCompSynced = 0;

for (const [extId, sr] of srMap) {
  const srPrismaId = srIdMap.get(extId);
  if (!srPrismaId || !sr.components.length) continue;

  await prisma.subRecipeComponent.deleteMany({ where: { sub_recipe_id: srPrismaId } });

  const compData = sr.components
    .map(c => {
      const ingPrismaId = ingIdMap.get(c.ingExtId);
      if (!ingPrismaId) return null;
      return {
        sub_recipe_id:   srPrismaId,
        ingredient_id:   ingPrismaId,
        quantity:        c.qty,
        unit:            c.unit,
        trim_percentage: c.trim,
      };
    })
    .filter(Boolean);

  if (compData.length) {
    await prisma.subRecipeComponent.createMany({ data: compData });
    srCompSynced++;
  }
}

console.log(`  SR components synced for ${srCompSynced} sub-recipes`);

// ─── 4. Upsert Meals ─────────────────────────────────────────────────────────
console.log('\nStep 3/3 — Upserting meals…');

const existingMeals = await prisma.mealRecipe.findMany({
  select: { id: true, display_name: true, meal_code: true, name: true },
});
const mealByName = new Map(existingMeals.map(m => [norm(m.display_name), m]));

let maxCode = 0;
for (const m of existingMeals) {
  if (m.meal_code && m.meal_code.startsWith('BD-')) {
    const n = parseInt(m.meal_code.replace('BD-', ''), 10);
    if (!isNaN(n) && n > maxCode) maxCode = n;
  }
}

let mealCreated = 0, mealUpdated = 0, mealCompSynced = 0;

for (const [extId, dish] of dishMap) {
  if (!dish.name) continue;
  const categoryMapped = mapCategory(dish.category);
  let meal = mealByName.get(norm(dish.name));

  if (meal) {
    const updateData = {
      display_name: dish.name,
      name:         dish.name,
    };
    if (categoryMapped) updateData.category = categoryMapped;
    if (dish.price) updateData.pricing_override = dish.price;
    await prisma.mealRecipe.update({ where: { id: meal.id }, data: updateData });
    mealUpdated++;
  } else {
    maxCode++;
    const meal_code = `BD-${String(maxCode).padStart(3, '0')}`;
    meal = await prisma.mealRecipe.create({
      data: {
        meal_code,
        name:             dish.name,
        display_name:     dish.name,
        category:         categoryMapped,
        pricing_override: dish.price || null,
        is_active:        true,
      },
    });
    mealByName.set(norm(dish.name), meal);
    mealCreated++;
  }

  if (dish.components.length) {
    await prisma.mealComponent.deleteMany({ where: { meal_id: meal.id } });

    const compData = dish.components
      .map(c => {
        const srPrismaId = srIdMap.get(c.srExtId);
        if (!srPrismaId) return null;
        const unitNorm = c.unit === 'gr' ? 'g' : c.unit === 'un' ? 'units' : c.unit;
        return {
          meal_id:       meal.id,
          sub_recipe_id: srPrismaId,
          quantity:      c.qty,
          unit:          unitNorm,
        };
      })
      .filter(Boolean);

    if (compData.length) {
      await prisma.mealComponent.createMany({ data: compData });
      mealCompSynced++;
    }
  }
}

console.log(`  Created: ${mealCreated}  Updated: ${mealUpdated}  Components synced: ${mealCompSynced}`);

console.log('\n✓ Done! Summary:');
console.log(`  Ingredients: ${ingCreated} created, ${ingUpdated} updated`);
console.log(`  Sub-recipes: ${srCreated} created, ${srUpdated} updated, ${srCompSynced} components synced`);
console.log(`  Meals:       ${mealCreated} created, ${mealUpdated} updated, ${mealCompSynced} components synced`);
console.log('\nRun recalculate-costs.js next to refresh computed_cost values.');

} // end main

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
