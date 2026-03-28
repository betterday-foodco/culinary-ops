/**
 * Meal Migration Script — reads Dish Masterlist + Buffer/Labels CSVs
 * Run: node scripts/migrate-meals-from-csv.js
 */
const fs   = require('fs');
const path = require('path');
const { PrismaClient } = require('../node_modules/@prisma/client');
const prisma = new PrismaClient();

const DISH_CSV   = 'D:/NEW Culinary App Database - Dish Masterlist (2).csv';
const BUFFER_CSV = 'D:/Buffer + Weekly Labels - 7.1 Dish Masterlist (2).csv';

// ─── Generic CSV line parser (handles quoted fields) ─────────────────────────
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

// ─── Parse Dish Masterlist ────────────────────────────────────────────────────
// Header spans lines 0-8 (quoted fields with embedded newlines).
// Data rows start at line 9. Positional:
//   0=dish_id, 1=url, 2=category, 3=dish_name, 4=sub_recipe_id,
//   5=sub_recipe_name, 6=per_portion, 7=unit, 8=price, 9=sku
function parseDishMasterlist() {
  const raw = fs.readFileSync(DISH_CSV, 'utf8').replace(/\r/g, '');
  const lines = raw.split('\n');

  const meals = {};
  let currentMealId = null;

  // Data starts at line 9 (header is 9 lines due to embedded newlines)
  for (let i = 9; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCsvLine(line);
    const dishId     = (cols[0] || '').replace(/[^0-9]/g, '');
    const category   = (cols[2] || '').trim();
    const dishName   = (cols[3] || '').trim();
    const subRecId   = (cols[4] || '').replace(/[^0-9]/g, '');
    const subRecName = (cols[5] || '').trim();
    const perPortion = parseFloat(cols[6]) || 0;
    const unit       = (cols[7] || 'gr').trim() || 'gr';
    const price      = (cols[8] || '').replace(/[^0-9.]/g, '');
    const sku        = (cols[9] || '').trim();

    if (dishId && dishName) {
      // Meal header row (has dish name)
      currentMealId = dishId;
      meals[dishId] = {
        id: dishId,
        name: dishName,
        category: category,
        price: parseFloat(price) || null,
        sku: sku,
        components: [],
      };
    }

    if (currentMealId && subRecId) {
      meals[currentMealId].components.push({
        sub_recipe_id_external: subRecId,
        sub_recipe_name: subRecName,
        quantity: perPortion,
        unit: unit,
      });
    }
  }

  return meals;
}

// ─── Parse Buffer / Labels file ───────────────────────────────────────────────
// Header: ID,URL,Name,Diet,Active,New Dish Tag,Type,ID for Vegan Version,
//         Chicken,Turkey,Beef,Pork,Seafood,Dairy,Gluten,Starch,Portion Score,
//         Container Type,Changes Made,Family friendly,Photo Status,Photo URL Link,
//         Sprwt URL,Description,Cal,Pro,Carb,Fat,Freezable,Family Friendly,
//         Gluten Friendly,Dairy Free,Tags,Type
function parseBufferFile() {
  const raw = fs.readFileSync(BUFFER_CSV, 'utf8').replace(/\r/g, '');
  const lines = raw.split('\n').filter(l => l.trim());

  const headerLine = lines[0];
  const headers    = parseCsvLine(headerLine).map(h => h.trim().toLowerCase());

  const meta = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row  = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });

    const rawId = row['id'].replace(/[^0-9]/g, '');
    if (!rawId) continue;

    // Protein types (only if cell equals that protein name, case-insensitive)
    const proteins = [];
    if (row['chicken'] && row['chicken'].toLowerCase() === 'chicken') proteins.push('Chicken');
    if (row['turkey']  && row['turkey'].toLowerCase()  === 'turkey')  proteins.push('Turkey');
    if (row['beef']    && row['beef'].toLowerCase()    === 'beef')    proteins.push('Beef');
    if (row['pork']    && row['pork'].toLowerCase()    === 'pork')    proteins.push('Pork');
    if (row['seafood'] && row['seafood'].toLowerCase() === 'seafood') proteins.push('Seafood');

    // Allergens
    const allergens = [];
    if (row['dairy']  && row['dairy']  !== '') allergens.push('Dairy');
    if (row['gluten'] && row['gluten'] !== '') allergens.push('Gluten');

    // Dietary tags — parse from individual columns + Tags column
    const dietarySet = new Set();
    if (row['freezable']       && row['freezable'].toLowerCase().includes('freezable'))        dietarySet.add('Freezable');
    if (row['family friendly'] && row['family friendly'].toLowerCase().includes('family'))     dietarySet.add('Family Friendly');
    if (row['gluten friendly'] && row['gluten friendly'].toLowerCase().includes('gluten'))     dietarySet.add('Gluten Friendly');
    if (row['dairy free']      && row['dairy free'].toLowerCase().includes('dairy'))           dietarySet.add('Dairy Free');
    // Also from Tags column (e.g. "Freezable, Family Friendly, Gluten Free")
    (row['tags'] || '').split(',').map(t => t.trim()).filter(Boolean).forEach(t => dietarySet.add(t));

    const containerMap = {
      'regular': 'Meal Tray', 'meal tray': 'Meal Tray',
      'salad': 'Salad Container', 'salad container': 'Salad Container',
    };
    const containerKey = (row['container type'] || '').toLowerCase().trim();

    meta[rawId] = {
      display_name: row['name'] || '',
      description:  row['description'] || null,
      image_url:    row['photo url link'] || null,
      calories:     parseInt(row['cal'])  || null,
      protein_g:    parseFloat(row['pro']) || null,
      carbs_g:      parseFloat(row['carb']) || null,
      fat_g:        parseFloat(row['fat'])  || null,
      is_active:    (row['active'] || '').toLowerCase() === 'active',
      protein_types: proteins,
      allergen_tags: allergens,
      dietary_tags:  Array.from(dietarySet),
      starch_type:   row['starch'] || null,
      container_type: containerMap[containerKey] || null,
      portion_score: parseInt(row['portion score']) || null,
    };
  }

  return meta;
}

// ─── Category mapping ─────────────────────────────────────────────────────────
function mapCategory(raw) {
  switch ((raw || '').trim()) {
    case 'Meat':       return 'Meat';
    case 'Veg':        return 'Vegan';
    case '*Breakie':   return 'Breakfast';
    case '*Cookies':   return 'Snack';
    case '*Snack':     return 'Snack';
    case '*Granola':   return 'Granola';
    case '*ProPack':   return 'Protein Pack';
    case '*Soup':      return 'Soup';
    case '*Salad':     return 'Salad';
    default:           return (raw || 'Other').trim();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('📖 Parsing CSV files...');
  const dishMeals  = parseDishMasterlist();
  const bufferMeta = parseBufferFile();

  const mealIds = Object.keys(dishMeals);
  console.log(`✅ Found ${mealIds.length} meals in Dish Masterlist`);
  console.log(`✅ Found ${Object.keys(bufferMeta).length} meals in Buffer/Labels file`);

  // Log the first few for verification
  const sample = mealIds.slice(0, 3).map(id => ({
    id, name: dishMeals[id].name, components: dishMeals[id].components.length
  }));
  console.log('Sample meals:', JSON.stringify(sample, null, 2));

  // ── Load sub-recipes keyed by numeric ID ─────────────────────────────────
  console.log('\n📦 Loading sub-recipes from DB...');
  const allSubs = await prisma.subRecipe.findMany({ select: { id: true, sub_recipe_code: true } });
  const subByNum = {};
  for (const s of allSubs) subByNum[s.sub_recipe_code.replace('SR-', '')] = s.id;
  console.log(`✅ Loaded ${allSubs.length} sub-recipes`);

  // ── Delete existing meals (need to clear FK dependencies first) ───────────
  console.log('\n🗑️  Clearing existing meal data...');
  await prisma.mealComponent.deleteMany({});
  // Clear production plan items referencing meals
  await prisma.productionPlanItem.deleteMany({});
  await prisma.menuQueueItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.mealRecipe.deleteMany({});
  console.log('✅ All existing meals cleared');

  // ── Create new meals ──────────────────────────────────────────────────────
  console.log('\n🍽️  Creating meals...');
  let created = 0;
  let compSkipped = 0;

  for (const externalId of mealIds) {
    const dish = dishMeals[externalId];
    const meta = bufferMeta[externalId] || {};

    const components = [];
    for (const comp of dish.components) {
      const subId = subByNum[comp.sub_recipe_id_external];
      if (!subId) {
        console.warn(`  ⚠️  SR-${comp.sub_recipe_id_external} (${comp.sub_recipe_name}) not found — skipped`);
        compSkipped++;
        continue;
      }
      components.push({ sub_recipe_id: subId, quantity: comp.quantity, unit: comp.unit });
    }

    try {
      await prisma.mealRecipe.create({
        data: {
          meal_code:       `BD-${externalId}`,
          name:             dish.name,
          display_name:     meta.display_name || dish.name,
          category:         mapCategory(dish.category),
          pricing_override: dish.price,
          is_active:        meta.is_active ?? true,
          description:      meta.description   || null,
          image_url:        meta.image_url      || null,
          calories:         meta.calories       || null,
          protein_g:        meta.protein_g      || null,
          carbs_g:          meta.carbs_g        || null,
          fat_g:            meta.fat_g          || null,
          protein_types:    meta.protein_types  || [],
          allergen_tags:    meta.allergen_tags  || [],
          dietary_tags:     meta.dietary_tags   || [],
          starch_type:      meta.starch_type    || null,
          container_type:   meta.container_type || null,
          portion_score:    meta.portion_score  || null,
          components: { create: components },
        },
      });
      created++;
    } catch (err) {
      console.error(`  ❌ BD-${externalId} (${dish.name}): ${err.message}`);
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Meals created: ${created}/${mealIds.length}`);
  console.log(`   Components skipped: ${compSkipped}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
