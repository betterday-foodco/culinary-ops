/**
 * import-sub-recipe-components.js
 *
 * Reads "NEW Culinary App Database - Sub-Recipe Masterlist (5).csv" and
 * populates sub_recipe_components for every sub-recipe in the DB that
 * currently has 0 components.
 *
 * Two component types handled:
 *   1. Raw ingredient  → ingredient_id set, child_sub_recipe_id null
 *   2. Child sub-recipe → child_sub_recipe_id set, ingredient_id null
 *      (detected by station suffix like "(Veg W)", "(Oven T)", "(Sauce F)" etc.)
 *
 * Ingredient name normalisation:
 *   Strips leading  "(digits) - " or "(digits+dash) - " prefixes
 *
 * Run:   node scripts/import-sub-recipe-components.js
 * Dry:   node scripts/import-sub-recipe-components.js --dry-run
 * Force: node scripts/import-sub-recipe-components.js --force  (re-import even if data exists)
 */

const { PrismaClient } = require('../node_modules/.prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

const DRY   = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const CSV   = process.argv.find(a => a.endsWith('.csv'))
  || 'D:/NEW Culinary App Database - Sub-Recipe Masterlist (5).csv';

// Station suffix pattern — these appear at end of child-sub-recipe names
// e.g.  "Blanched Corn (Veg W)",  "Salsa Roja (Sauce T)",  "Cooked GnG Chicken (Pro F)"
const STATION_SUFFIX = /\s*\((?:Veg|Oven|Sauce|Pro|Protein|Po|Breakfast|Brk|Break|Pack|Packing)[^)]*\)\s*$/i;

// Strip leading "(numbers) - " SKU prefix from ingredient names
function normaliseIngName(name) {
  return name.replace(/^\(\d[\d-]*\)\s*-\s*/, '').trim();
}

// Strip trailing station suffix to get clean sub-recipe name
function normaliseChildSR(name) {
  return name.replace(STATION_SUFFIX, '').trim();
}

// ── Minimal CSV parser (handles quoted multi-line fields) ─────────────────────
function parseCSV(raw) {
  const rows = [];
  let cur = [], field = '', inQ = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (inQ && raw[i + 1] === '"') { field += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      cur.push(field.trim()); field = '';
    } else if ((c === '\n' || c === '\r') && !inQ) {
      if (c === '\r' && raw[i + 1] === '\n') i++;
      cur.push(field.trim()); field = '';
      rows.push(cur); cur = [];
    } else {
      field += c;
    }
  }
  if (field || cur.length) { cur.push(field.trim()); rows.push(cur); }
  return rows;
}

// ── Parse sub-recipe masterlist ───────────────────────────────────────────────
function parseMasterlist(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(raw);

  // Skip header rows: find first row where col[3] is a positive integer
  let dataStart = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length >= 4 && !isNaN(Number(rows[i][3])) && Number(rows[i][3]) > 0) {
      dataStart = i; break;
    }
  }

  const subRecipes = {}; // oldId → { name, station, components[] }

  for (let i = dataStart; i < rows.length; i++) {
    const c = rows[i];
    if (!c || c.length < 4) continue;
    const srId   = c[3]?.trim();
    if (!srId || isNaN(Number(srId))) continue;

    const srName  = c[5]?.trim();   // set only on sub-recipe header rows
    const rawName = c[7]?.trim();   // ingredient / child-SR name
    const qty     = parseFloat(c[9]);
    const unit    = (c[10] || 'Kgs').trim();

    if (srName) {
      if (!subRecipes[srId]) {
        subRecipes[srId] = { oldId: srId, name: srName, station: c[0]?.trim(), components: [] };
      }
    }

    if (rawName && !isNaN(qty) && qty > 0) {
      if (!subRecipes[srId]) subRecipes[srId] = { oldId: srId, name: '', components: [] };

      if (STATION_SUFFIX.test(rawName)) {
        // Child sub-recipe reference
        subRecipes[srId].components.push({
          type: 'sub_recipe',
          name: normaliseChildSR(rawName),
          rawName,
          qty,
          unit,
        });
      } else {
        // Raw ingredient (strip SKU prefix)
        subRecipes[srId].components.push({
          type: 'ingredient',
          name: normaliseIngName(rawName),
          rawName,
          qty,
          unit,
        });
      }
    }
  }

  return Object.values(subRecipes).filter(sr => sr.name && sr.components.length > 0);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`=== Import Sub-Recipe Components ${DRY ? '(DRY RUN)' : ''} ===`);
  console.log(`CSV: ${CSV}\n`);

  if (!fs.existsSync(CSV)) { console.error('❌ CSV not found'); process.exit(1); }

  const csvSRs = parseMasterlist(CSV);
  console.log(`Parsed ${csvSRs.length} sub-recipes from CSV.\n`);

  // Load all DB sub-recipes and ingredients
  const [dbSRs, dbIngs] = await Promise.all([
    prisma.subRecipe.findMany({
      select: { id: true, name: true, _count: { select: { components: true } } },
    }),
    prisma.ingredient.findMany({
      select: { id: true, internal_name: true },
    }),
  ]);

  const srByName  = {};
  for (const sr of dbSRs)  srByName[sr.name.toLowerCase()] = sr;
  const ingByName = {};
  for (const ing of dbIngs) ingByName[ing.internal_name.toLowerCase()] = ing;

  // Stats
  let srMatched = 0, srNoMatch = 0, srSkipped = 0;
  let compCreated = 0;
  const noMatchSRs = [];
  const noMatchComps = [];   // { srName, compType, compName }
  const noMatchIngNames = new Set();
  const noMatchChildNames = new Set();

  for (const csvSR of csvSRs) {
    const dbSR = srByName[csvSR.name.toLowerCase()];
    if (!dbSR) { srNoMatch++; noMatchSRs.push(csvSR.name); continue; }

    if (dbSR._count.components > 0 && !FORCE) { srSkipped++; continue; }

    srMatched++;

    if (FORCE && dbSR._count.components > 0 && !DRY) {
      await prisma.subRecipeComponent.deleteMany({ where: { sub_recipe_id: dbSR.id } });
    }

    for (const comp of csvSR.components) {
      if (comp.type === 'ingredient') {
        const dbIng = ingByName[comp.name.toLowerCase()];
        if (!dbIng) {
          noMatchIngNames.add(comp.name);
          noMatchComps.push({ srName: csvSR.name, type: 'ingredient', name: comp.name, raw: comp.rawName });
          continue;
        }
        if (!DRY) {
          await prisma.subRecipeComponent.create({
            data: {
              sub_recipe_id: dbSR.id,
              ingredient_id: dbIng.id,
              quantity: comp.qty,
              unit: comp.unit,
              trim_percentage: 0,
            },
          });
        }
        compCreated++;

      } else {
        // Child sub-recipe — try stripped name first, then original raw name
        const dbChild = srByName[comp.name.toLowerCase()]
          || srByName[comp.rawName.toLowerCase()];
        if (!dbChild) {
          noMatchChildNames.add(comp.name);
          noMatchComps.push({ srName: csvSR.name, type: 'sub_recipe', name: comp.name, raw: comp.rawName });
          continue;
        }
        if (!DRY) {
          await prisma.subRecipeComponent.create({
            data: {
              sub_recipe_id:       dbSR.id,
              child_sub_recipe_id: dbChild.id,
              ingredient_id:       null,
              quantity: comp.qty,
              unit: comp.unit,
              trim_percentage: 0,
            },
          });
        }
        compCreated++;
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Sub-recipes in CSV:         ${csvSRs.length}`);
  console.log(`  ✓ Matched + imported:       ${srMatched}`);
  console.log(`  → Skipped (had data):       ${srSkipped}`);
  console.log(`  ✗ No DB match (name):       ${srNoMatch}`);
  console.log(`  Components ${DRY ? 'would be' : ''} created:      ${compCreated}`);
  console.log(`  Ingredient name misses:     ${noMatchIngNames.size} unique names`);
  console.log(`  Child SR name misses:       ${noMatchChildNames.size} unique names`);

  if (noMatchSRs.length) {
    console.log('\n── Sub-recipes not found in DB ──────────────────────');
    for (const n of noMatchSRs) console.log('  - ' + n);
  }

  if (noMatchIngNames.size > 0) {
    console.log('\n── Ingredient names not found in DB (unique) ────────');
    for (const n of [...noMatchIngNames].sort()) console.log('  - ' + n);
  }

  if (noMatchChildNames.size > 0) {
    console.log('\n── Child sub-recipe names not found in DB (unique) ──');
    for (const n of [...noMatchChildNames].sort()) console.log('  - ' + n);
  }

  if (DRY) {
    console.log('\n  DRY RUN — nothing written. Remove --dry-run to apply.');
  } else {
    console.log('\n  ✓ Done. Run recalculate-costs.js next to update all costs.');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
