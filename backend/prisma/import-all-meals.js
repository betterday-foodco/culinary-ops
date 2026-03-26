// import-all-meals.js
// Comprehensive meal import combining all three data sources:
//   1. menu_items.csv        — 40 meals with proper marketing names + allergens + categories
//   2. Dish Masterlist.csv   — 63 meals (current week) with names + sub-recipe assignments
//   3. WooCommerce export    — 136 published MEAL-* products with nutrition/images/prices
//
// What this script does:
//   • Upserts all meals found in WC into MealRecipe (creates new rows for the ~70+ missing ones)
//   • Names come from: menu_items > Dish Masterlist > extracted from WC description
//   • Updates allergens/categories from menu_items when available
//   • Creates MealComponent links from Dish Masterlist sub-recipe assignments
//   • Triggers cost recalculation at the end

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

// ─── CSV parser (handles multi-line quoted fields) ────────────────────────────
function parseCSV(text) {
  const rows = [];
  let cur = '', inQ = false, curRow = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\r') continue;
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) {
      curRow.push(cur.trim());
      cur = '';
    } else if (ch === '\n' && !inQ) {
      curRow.push(cur.trim());
      cur = '';
      if (curRow.some(c => c.length > 0)) rows.push(curRow);
      curRow = [];
    } else {
      cur += ch;
    }
  }
  curRow.push(cur.trim());
  if (curRow.some(c => c.length > 0)) rows.push(curRow);
  return rows;
}

// ─── Extract a short name from WC description (fallback for unknown meals) ────
function extractNameFromDesc(shortDesc, fullDesc) {
  const text = (fullDesc || shortDesc || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  // Split into sentences
  const sentences = text.split(/\.\s+/).filter(s => s.length > 0);

  // Skip very short taglines (< 40 chars), use the next sentence
  let mainSentence = sentences[0] || '';
  if (mainSentence.length < 40 && sentences.length > 1) {
    mainSentence = sentences[1];
  }

  // Truncate to ≤ 60 chars at a word boundary
  if (mainSentence.length > 60) {
    const truncated = mainSentence.substring(0, 60);
    const lastSpace = truncated.lastIndexOf(' ');
    mainSentence = lastSpace > 30 ? truncated.substring(0, lastSpace) : truncated;
  }

  // Strip common leading marketing fluff
  mainSentence = mainSentence
    .replace(/^(A |An |The |This |We're |We |Our |You'll |Your |It's )/i, '')
    .replace(/^(Juicy |Tender |Rich |Creamy |Bold |Fresh |Warm |Hearty |Savory )/i, '');

  // Capitalize
  return mainSentence.charAt(0).toUpperCase() + mainSentence.slice(1) || null;
}

// ─── Map WC category string to short internal category ───────────────────────
function parseCategoryFromWC(catStr) {
  if (!catStr) return null;
  if (catStr.includes('> Veg') || catStr.includes('> Plant-Based')) return 'Veg';
  if (catStr.includes('> Meat')) return 'Meat';
  if (catStr.includes('Breakfast')) return '*Breakie';
  if (catStr.includes('Marketplace') || catStr.includes('Snack')) return 'Marketplace';
  return null;
}

// ─── Map menu_items category string to internal category ─────────────────────
function parseCategoryFromMenuItems(catStr) {
  if (!catStr) return null;
  if (catStr.includes('Breakfast')) return '*Breakie';
  if (catStr.includes('Power Snacks') || catStr.includes('Marketplace')) return 'Marketplace';
  if (catStr.includes('Plant-Based') || catStr.includes('Vegan')) return 'Veg';
  if (catStr.includes('Meat')) return 'Meat';
  return null;
}

// ─── MAIN IMPORT ─────────────────────────────────────────────────────────────
async function importAllMeals() {
  console.log('📋 Loading source files...\n');

  // ── 1. Parse menu_items.csv ──────────────────────────────────────────────────
  const menuRows = parseCSV(fs.readFileSync('D:\\menu_items.csv', 'utf-8'));
  // Columns: MealID, SKU, Name, Orders, Categories, Allergens, Dislikes, Macros
  const menuMap = new Map(); // dishId → {name, category, allergens}
  for (let i = 1; i < menuRows.length; i++) {
    const r = menuRows[i];
    const dishId = parseInt(r[0]);
    if (!dishId) continue;
    menuMap.set(dishId, {
      name: r[2].trim(),
      category: parseCategoryFromMenuItems(r[4] || ''),
      allergens: (r[5] || '').split(',').map(s => s.trim()).filter(Boolean),
    });
  }
  console.log(`  menu_items.csv: ${menuMap.size} entries`);

  // ── 2. Parse Dish Masterlist ─────────────────────────────────────────────────
  const dishRows = parseCSV(fs.readFileSync('D:\\NEW Culinary App Database - Dish Masterlist (1).csv', 'utf-8'));
  // Columns: DishID, URL, Category, DishName, SubRecipeID, SubRecipeName, PortionQty, Unit, Price
  const dishMealMap  = new Map(); // dishId → {name, category, price}
  const dishSRMap    = new Map(); // dishId → [{srNumId, qty, unit}]

  for (const row of dishRows) {
    const dishId = parseInt((row[0] || '').trim());
    if (!dishId || isNaN(dishId)) continue;

    const name     = (row[3] || '').trim();
    const category = (row[2] || '').trim();
    const srNumId  = (row[4] || '').trim();
    const qty      = parseFloat(row[6]) || 0;
    const unit     = (row[7] || 'gr').trim();
    const priceStr = (row[8] || '').replace('$', '').trim();

    if (name && /^[A-Za-z"']/.test(name) && !dishMealMap.has(dishId)) {
      // This is a meal header row
      const price = priceStr ? parseFloat(priceStr) || null : null;
      dishMealMap.set(dishId, { name, category, price });
    }

    if (srNumId && !isNaN(parseInt(srNumId))) {
      // This is a sub-recipe assignment row
      const assignments = dishSRMap.get(dishId) || [];
      assignments.push({ srNumId, qty, unit });
      dishSRMap.set(dishId, assignments);
    }
  }
  console.log(`  Dish Masterlist: ${dishMealMap.size} meals, ${dishSRMap.size} with SR assignments`);

  // ── 3. Parse WooCommerce export ──────────────────────────────────────────────
  const wcRows = parseCSV(fs.readFileSync(
    'D:\\NEW Culinary App Database - wc-product-export-26-2-2026-1772144598463.csv', 'utf-8'
  ));
  // Relevant columns: 2=SKU, 5=Published, 8=ShortDesc, 9=Desc, 26=Price, 27=Categories, 28=Tags, 30=Images
  // Attributes: 47=Attr1Name, 48=Attr1Val, 51=Attr2Name, 52=Attr2Val, 55=Attr3Name, 56=Attr3Val, 59=Attr4Name, 60=Attr4Val

  const wcMap = new Map(); // dishId → WC data
  for (let i = 1; i < wcRows.length; i++) {
    const row = wcRows[i];
    const sku = (row[2] || '').trim();
    if (!sku.startsWith('MEAL-')) continue;

    const dishId    = parseInt(sku.replace('MEAL-', ''));
    if (isNaN(dishId)) continue;

    const published = (row[5] || '').trim() !== '-1';
    if (!published) continue; // skip unpublished

    // Parse up to 4 nutrition attributes
    const attrs = {};
    for (let a = 0; a < 4; a++) {
      const nIdx = 47 + a * 4;
      const vIdx = 48 + a * 4;
      const attrName  = (row[nIdx] || '').toLowerCase().trim();
      const attrValue = (row[vIdx] || '').trim();
      if (attrName) attrs[attrName] = attrValue;
    }

    wcMap.set(dishId, {
      shortDesc: (row[8]  || '').trim() || null,
      desc:      (row[9]  || '').trim() || null,
      price:     parseFloat((row[26] || '').replace(/[$,]/g, '')) || null,
      catStr:    (row[27] || '').trim(),
      imageUrl:  (row[30] || '').split('|')[0].trim() || null,
      calories:  attrs['calories'] ? parseInt(attrs['calories'])   || null : null,
      protein:   attrs['protein']  ? parseFloat(attrs['protein'])  || null : null,
      carbs:     attrs['carbs']    ? parseFloat(attrs['carbs'])    || null : null,
      fat:       attrs['fat']      ? parseFloat(attrs['fat'])      || null : null,
    });
  }
  console.log(`  WooCommerce: ${wcMap.size} published MEAL-* products\n`);

  // ── 4. Load existing meals from DB ───────────────────────────────────────────
  const existingMeals = await prisma.mealRecipe.findMany({ select: { id: true, name: true } });
  const existingByName = new Map(existingMeals.map(m => [m.name.toLowerCase().trim(), m.id]));
  console.log(`  DB currently: ${existingMeals.length} meals\n`);

  // ── 5. Upsert meals ───────────────────────────────────────────────────────────
  // Combine all known dishIds (WC has the most complete set)
  const allDishIds = new Set([
    ...wcMap.keys(),
    ...menuMap.keys(),
    ...dishMealMap.keys(),
  ]);
  console.log(`  Total unique dish IDs across all sources: ${allDishIds.size}\n`);

  // dishId → DB meal uuid (for MealComponent linking)
  const dishIdToDbId = new Map();
  let created = 0, updated = 0, errCount = 0;

  for (const dishId of allDishIds) {
    const menuEntry = menuMap.get(dishId);
    const dishEntry = dishMealMap.get(dishId);
    const wcEntry   = wcMap.get(dishId);

    // Determine best name
    const name = (menuEntry?.name) ||
                 (dishEntry?.name) ||
                 (wcEntry ? extractNameFromDesc(wcEntry.shortDesc, wcEntry.desc) : null) ||
                 `Meal #${dishId}`;

    // Determine category
    const category = (menuEntry?.category) ||
                     (dishEntry?.category) ||
                     (wcEntry ? parseCategoryFromWC(wcEntry.catStr) : null);

    // Allergens
    const allergens = menuEntry?.allergens || [];

    // Price (prefer DM price as it's verified, fallback to WC)
    const price = dishEntry?.price || wcEntry?.price || null;

    const mealData = {
      category:          category  || undefined,
      short_description: wcEntry?.shortDesc || null,
      description:       wcEntry?.desc      || null,
      image_url:         wcEntry?.imageUrl  || null,
      pricing_override:  price,
      calories:          wcEntry?.calories  || null,
      protein_g:         wcEntry?.protein   || null,
      carbs_g:           wcEntry?.carbs     || null,
      fat_g:             wcEntry?.fat       || null,
      allergen_tags:     allergens,
      is_active:         true,
    };

    // Find existing record — try current best name first, then DM name if different
    let existingId = existingByName.get(name.toLowerCase().trim());
    if (!existingId && dishEntry?.name && dishEntry.name !== name) {
      existingId = existingByName.get(dishEntry.name.toLowerCase().trim());
    }

    try {
      let dbId;
      if (existingId) {
        await prisma.mealRecipe.update({
          where: { id: existingId },
          data: { name, display_name: name, ...mealData },
        });
        dbId = existingId;
        updated++;
      } else {
        const created_meal = await prisma.mealRecipe.create({
          data: { name, display_name: name, ...mealData },
        });
        dbId = created_meal.id;
        // Add to name cache to avoid duplicates within this run
        existingByName.set(name.toLowerCase().trim(), dbId);
        created++;
      }
      dishIdToDbId.set(dishId, dbId);
    } catch (e) {
      console.error(`  ✗ Meal #${dishId} "${name}": ${e.message}`);
      errCount++;
    }
  }

  console.log(`\n  ✅ Meals — Created: ${created}, Updated: ${updated}, Errors: ${errCount}`);
  console.log(`  Total meals in DB now: ${existingMeals.length + created}`);

  // ── 6. Create MealComponent links from Dish Masterlist ───────────────────────
  console.log('\n🔗 Linking meal sub-recipe components from Dish Masterlist...');

  // Load all sub-recipes that exist in DB (by code SR-{numId})
  const allSrCodes = new Set();
  for (const assignments of dishSRMap.values()) {
    for (const { srNumId } of assignments) {
      allSrCodes.add(`SR-${srNumId}`);
    }
  }
  const srRecords = await prisma.subRecipe.findMany({
    where: { sub_recipe_code: { in: Array.from(allSrCodes) } },
    select: { id: true, sub_recipe_code: true },
  });
  const srCodeToId = new Map(srRecords.map(s => [s.sub_recipe_code, s.id]));
  console.log(`  Found ${srCodeToId.size}/${allSrCodes.size} sub-recipes in DB`);

  let compCreated = 0, compSkipped = 0;

  for (const [dishId, assignments] of dishSRMap.entries()) {
    const mealDbId = dishIdToDbId.get(dishId);
    if (!mealDbId || typeof mealDbId !== 'string') { compSkipped += assignments.length; continue; }

    // Delete existing components for this meal (fresh import)
    await prisma.mealComponent.deleteMany({ where: { meal_id: mealDbId } });

    for (const { srNumId, qty, unit } of assignments) {
      const srDbId = srCodeToId.get(`SR-${srNumId}`);
      if (!srDbId || qty === 0) { compSkipped++; continue; }

      try {
        await prisma.mealComponent.create({
          data: {
            meal_id:       mealDbId,
            sub_recipe_id: srDbId,
            quantity:      qty,
            unit,
          },
        });
        compCreated++;
      } catch (e) {
        // ignore duplicates
        compSkipped++;
      }
    }
  }

  console.log(`  ✅ MealComponents — Created: ${compCreated}, Skipped: ${compSkipped}`);
}

// ─── Trigger cost recalculation ───────────────────────────────────────────────
async function recalculateCosts() {
  console.log('\n💰 Triggering cost recalculation...');
  try {
    const res = await fetch('http://localhost:3002/api/production/recalculate-costs', {
      method: 'POST',
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`  ✅ Costs: ${JSON.stringify(data)}`);
    } else {
      console.log(`  ⚠️  API returned ${res.status} — run recalculation manually if needed`);
    }
  } catch {
    console.log('  ⚠️  Backend not reachable — run POST /api/production/recalculate-costs manually');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starting comprehensive meal import...\n');
  try {
    await importAllMeals();
    await recalculateCosts();
    console.log('\n🎉 Done! Refresh your dashboard to see all meals.');
  } catch (e) {
    console.error('❌ Import failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
