// import-sub-recipe-components.js
// Imports sub-recipe components (ingredients + quantities) from the Sub-Recipe Masterlist CSV.
// Also updates station_tag, production_day, priority, and prep instructions on each sub-recipe.
//
// CSV structure:
//   Sub-recipe header row: Station, Day, Priority, SR_ID, URL, SR_Name, '', '', '', Total_Qty, Unit, Instructions
//   Ingredient rows:       '', '', '', SR_ID, '', '', Ing_ID, Ing_Name, Trim%, Qty, Unit, ''
//
// Run from backend/ directory:
//   node prisma/import-sub-recipe-components.js

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

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
  if (curRow.some(c => c.length > 0)) rows.push(curRow);
  return rows;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeUnit(raw) {
  const u = (raw || '').toLowerCase().trim();
  if (u === 'kgs' || u === 'kg') return 'Kgs';
  if (u === 'gr' || u === 'g' || u === 'grams') return 'g';
  if (u === 'ml') return 'mL';
  if (u === 'l') return 'L';
  if (u === 'un' || u === 'each') return 'each';
  if (u === 'oz') return 'oz';
  return raw || 'Kgs';
}

function normalizeStation(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('veg')) return 'Veg Station';
  if (s.includes('hot') || s.includes('oven')) return 'Hot Kitchen';
  if (s.includes('batch') || s.includes('sauce')) return 'Batch Station';
  if (s.includes('cold') || s.includes('salad')) return 'Cold Prep';
  if (s.includes('pack')) return 'Packaging Station';
  if (s.includes('protein') || s.includes('meat')) return 'Protein Station';
  return raw.replace(/\s*-\s*\d+$/, '').trim(); // strip trailing "- 017" etc.
}

function cleanIngredientName(raw) {
  // "(1282605) - Ready-Set-Serve Parsley" → "Ready-Set-Serve Parsley"
  return raw.replace(/^\(\d+\)\s*-\s*/, '').trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const candidates = [
    path.join('D:\\', 'NEW Culinary App Database - Sub-Recipe Masterlist (2).csv'),
    path.join(__dirname, '..', '..', '..', 'NEW Culinary App Database - Sub-Recipe Masterlist (2).csv'),
    path.join(__dirname, 'Sub-Recipe Masterlist.csv'),
  ];

  let csvPath = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { csvPath = c; break; }
  }
  if (!csvPath) {
    console.error('❌ CSV not found. Copy it next to this script or update the path.');
    process.exit(1);
  }

  console.log(`📂 Reading: ${csvPath}`);
  const text = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(text);

  // Skip header row(s) — find first data row (col 3 is a number)
  const dataRows = rows.filter(r => /^\d+$/.test(r[3]));
  console.log(`📋 Found ${dataRows.length} data rows`);

  // ── Build ingredient lookup cache (SKU patterns + name) ──────────────────
  console.log('🔍 Building ingredient cache...');
  const allIngredients = await prisma.ingredient.findMany({
    select: { id: true, internal_name: true, sku: true },
  });

  // Map: "ING-256" → id, "EBD-256" → id, "256" → id (vendor sku), name → id
  const ingBySkuNum = new Map(); // csv ing_id → db ingredient id
  const ingByName = new Map();   // lowercase name → db ingredient id

  for (const ing of allIngredients) {
    // Extract numeric part from SKU
    const m = ing.sku.match(/^(?:ING-|EBD-)?(\d+)$/);
    if (m) ingBySkuNum.set(m[1], ing.id);
    else ingBySkuNum.set(ing.sku, ing.id); // vendor sku (numeric-only)
    ingByName.set(ing.internal_name.toLowerCase().trim(), ing.id);
  }

  function findIngredient(ingId, ingName) {
    // 1. Try by ID
    const byId = ingBySkuNum.get(String(ingId));
    if (byId) return byId;
    // 2. Try cleaned name
    const cleanName = cleanIngredientName(ingName).toLowerCase().trim();
    const byName = ingByName.get(cleanName);
    if (byName) return byName;
    // 3. Partial name match (last resort)
    for (const [k, v] of ingByName) {
      if (k.includes(cleanName) || cleanName.includes(k)) return v;
    }
    return null;
  }

  // ── Parse into sub-recipe groups ─────────────────────────────────────────
  // A "header" row has col[0] (station) non-empty AND col[5] (sr name) non-empty
  // An "ingredient" row has col[0] empty AND col[6] (ing id) non-empty

  const subRecipeMap = new Map(); // sr_id → { station, day, priority, name, instructions, ingredients[] }

  let currentSrId = null;

  for (const row of dataRows) {
    const station   = row[0];
    const day       = row[1];
    const priority  = row[2];
    const srId      = row[3];
    const srName    = row[5];
    const ingId     = row[6];
    const ingName   = row[7];
    const trimPct   = parseFloat(row[8]) || 0;
    const qty       = parseFloat(row[9]) || 0;
    const unit      = row[10];
    const instrText = row[11];

    if (station && srName) {
      // Sub-recipe header row
      currentSrId = srId;
      subRecipeMap.set(srId, {
        station: normalizeStation(station),
        day: day || null,
        priority: parseInt(priority) || 3,
        name: srName,
        instructions: instrText || null,
        ingredients: [],
      });
    } else if (!station && ingId && currentSrId) {
      // Ingredient row
      const sr = subRecipeMap.get(currentSrId);
      if (sr) {
        sr.ingredients.push({ ingId, ingName, trimPct, qty, unit });
      }
    }
  }

  console.log(`📦 Parsed ${subRecipeMap.size} sub-recipes from CSV`);

  // ── Pre-load ALL sub-recipes into memory (avoids per-row DB queries) ──────
  console.log('🔍 Building sub-recipe cache...');
  const allSubRecipes = await prisma.subRecipe.findMany({ select: { id: true, sub_recipe_code: true } });
  const srByCode = new Map(allSubRecipes.map(s => [s.sub_recipe_code, s.id]));

  // ── Clear all existing components in one shot ─────────────────────────────
  console.log('🗑️  Clearing existing components...');
  await prisma.subRecipeComponent.deleteMany({});

  // ── Build batches entirely in memory ─────────────────────────────────────
  let srUpdated = 0, srNotFound = 0, compCreated = 0, compSkipped = 0;
  const notFoundSRs = [], notFoundIngs = [];
  const componentsBatch = [];
  const srUpdates = []; // { id, station, day, priority, instructions }

  for (const [srId, data] of subRecipeMap) {
    const srCode = `SR-${srId}`;
    const srDbId = srByCode.get(srCode);
    if (!srDbId) { srNotFound++; notFoundSRs.push(`${srCode} — ${data.name}`); continue; }

    srUpdates.push({ id: srDbId, station: data.station, day: data.day, priority: data.priority, instructions: data.instructions });

    for (const ing of data.ingredients) {
      const ingDbId = findIngredient(ing.ingId, ing.ingName);
      if (ingDbId) {
        componentsBatch.push({ sub_recipe_id: srDbId, ingredient_id: ingDbId, child_sub_recipe_id: null, quantity: ing.qty, unit: normalizeUnit(ing.unit), trim_percentage: ing.trimPct });
        compCreated++;
      } else {
        const childId = srByCode.get(`SR-${ing.ingId}`);
        if (childId) {
          componentsBatch.push({ sub_recipe_id: srDbId, ingredient_id: null, child_sub_recipe_id: childId, quantity: ing.qty, unit: normalizeUnit(ing.unit), trim_percentage: ing.trimPct });
          compCreated++;
        } else {
          notFoundIngs.push(`  Ing ${ing.ingId} "${ing.ingName}" in SR ${srCode}`);
          compSkipped++;
        }
      }
    }
    srUpdated++;
  }

  // ── Batch insert components (500 per chunk) ───────────────────────────────
  console.log(`💾 Inserting ${componentsBatch.length} components in chunks...`);
  const CHUNK = 500;
  for (let i = 0; i < componentsBatch.length; i += CHUNK) {
    await prisma.subRecipeComponent.createMany({ data: componentsBatch.slice(i, i + CHUNK) });
    process.stdout.write(`\r   ${Math.min(i + CHUNK, componentsBatch.length)}/${componentsBatch.length}`);
  }
  console.log('');

  // ── Update sub-recipe metadata (station, day, priority, instructions) ─────
  console.log(`🔄 Updating metadata for ${srUpdates.length} sub-recipes...`);
  for (let i = 0; i < srUpdates.length; i++) {
    const u = srUpdates[i];
    await prisma.subRecipe.update({ where: { id: u.id }, data: { station_tag: u.station, production_day: u.day, priority: u.priority, instructions: u.instructions } });
    if (i % 50 === 0) process.stdout.write(`\r   ${i}/${srUpdates.length}`);
  }
  console.log(`\r   ${srUpdates.length}/${srUpdates.length}`);

  console.log('\n✅ Done!');
  console.log(`   Sub-recipes updated : ${srUpdated}`);
  console.log(`   Sub-recipes not found: ${srNotFound}`);
  console.log(`   Components created  : ${compCreated}`);
  console.log(`   Components skipped  : ${compSkipped} (ingredient not found in DB)`);

  if (notFoundSRs.length > 0) {
    console.log(`\n⚠️  Sub-recipes in CSV but not in DB (${notFoundSRs.length}):`);
    notFoundSRs.slice(0, 20).forEach(s => console.log(' ', s));
    if (notFoundSRs.length > 20) console.log(`  ... and ${notFoundSRs.length - 20} more`);
  }

  if (notFoundIngs.length > 0) {
    console.log(`\n⚠️  Ingredients not matched (${notFoundIngs.length}):`);
    notFoundIngs.slice(0, 20).forEach(s => console.log(s));
    if (notFoundIngs.length > 20) console.log(`  ... and ${notFoundIngs.length - 20} more`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
