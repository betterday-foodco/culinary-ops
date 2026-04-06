/**
 * fix-ingredient-costs.js
 * Updates ingredient cost_per_unit and base_weight from the masterlist CSV.
 *
 * Matching strategy:
 *   1. Exact name match (case-insensitive)
 *   2. When multiple masterlist rows share a name, picks the one with
 *      case_price closest to what the DB already has (to avoid wrong overwrites)
 *
 * cost_per_unit = case_price / case_size   (price per kg or per unit)
 * base_weight   = case_size                (cases = ceil(needed / base_weight))
 *
 * Run from backend/:  node scripts/fix-ingredient-costs.js
 * Dry run:            node scripts/fix-ingredient-costs.js --dry-run
 * Custom CSV:         node scripts/fix-ingredient-costs.js "path/to/file.csv"
 */
const { PrismaClient } = require('../node_modules/.prisma/client');
const fs   = require('fs');

const prisma = new PrismaClient();
const DRY   = process.argv.includes('--dry-run');
const CSV_PATH = process.argv.find(a => a.endsWith('.csv'))
  || 'D:/NEW Culinary Inventory Sheet - Ingredient Masterlist (2).csv';

// ── Minimal quoted-CSV row parser ─────────────────────────────────────────────
function parseCSVRow(line) {
  const f = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1]==='"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { f.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  f.push(cur.trim());
  return f;
}

function readMasterlist(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split('\n').map(l => l.replace(/\r$/, ''));
  const dataLines = lines.slice(3).filter(l => l.trim()); // skip 3-line header
  const rows = [];
  for (const line of dataLines) {
    const c = parseCSVRow(line);
    if (c.length < 8 || isNaN(Number(c[0]))) continue;
    const casePrice = parseFloat(c[5].replace(/[$,\s]/g, ''));
    const caseSize  = parseFloat(c[6]);
    if (!casePrice || casePrice <= 0 || !caseSize || caseSize <= 0) continue;
    rows.push({
      id:        c[0].trim(),
      name:      c[2].trim().toLowerCase(),
      nameOrig:  c[2].trim(),
      casePrice,
      caseSize,
      caseUnit:  (c[7] || '').trim().toLowerCase(),
      costPerUnit: parseFloat((casePrice / caseSize).toFixed(6)),
    });
  }
  return rows;
}

async function main() {
  console.log(`=== Fix Ingredient Costs ${DRY ? '(DRY RUN)' : ''} ===`);
  console.log(`CSV: ${CSV_PATH}\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const masterlist = readMasterlist(CSV_PATH);
  console.log(`Parsed ${masterlist.length} priced rows from masterlist.\n`);

  // Build name → [rows] map from masterlist (there may be duplicates by name)
  const csvByName = {};
  for (const row of masterlist) {
    if (!csvByName[row.name]) csvByName[row.name] = [];
    csvByName[row.name].push(row);
  }

  const dbRows = await prisma.ingredient.findMany({
    select: { id: true, internal_name: true, sku: true, cost_per_unit: true, base_weight: true, unit: true },
  });

  let updated = 0, skipped = 0, noMatch = 0;
  const changes = [];

  for (const db of dbRows) {
    const key = db.internal_name.toLowerCase();
    const candidates = csvByName[key];
    if (!candidates || candidates.length === 0) { noMatch++; continue; }

    // When multiple candidates, pick the one whose cost_per_unit is closest to current DB value
    // (preserves intent — avoids blindly overwriting with wrong price)
    let best = candidates[0];
    if (candidates.length > 1) {
      const cur = db.cost_per_unit || 0;
      best = candidates.reduce((a, b) =>
        Math.abs(a.costPerUnit - cur) <= Math.abs(b.costPerUnit - cur) ? a : b
      );
    }

    const newCost = best.costPerUnit;
    const newBw   = best.caseSize;
    const oldCost = db.cost_per_unit || 0;
    const oldBw   = db.base_weight   || 0;

    const costDiff = Math.abs(newCost - oldCost);
    const bwDiff   = Math.abs(newBw   - oldBw);

    if (costDiff < 0.001 && bwDiff < 0.01) { skipped++; continue; }

    changes.push({
      id: db.id,
      name: db.internal_name,
      oldCost, newCost, oldBw, newBw,
      casePrice: best.casePrice,
      flag: costDiff > 0.01 ? '⚠ PRICE' : '',
    });

    if (!DRY) {
      await prisma.ingredient.update({
        where: { id: db.id },
        data: { cost_per_unit: newCost, base_weight: newBw },
      });
    }
    updated++;
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const priceChanges = changes.filter(c => Math.abs(c.newCost - c.oldCost) > 0.01);
  const bwOnlyChanges = changes.filter(c => Math.abs(c.newCost - c.oldCost) <= 0.01);

  if (priceChanges.length > 0) {
    console.log('── PRICE changes (' + priceChanges.length + ') ──────────────────────────────────────────');
    console.log('  ' + 'Ingredient'.padEnd(46) + 'Old $/unit'.padStart(10) + ' → ' + 'New $/unit'.padEnd(10) + '  (case $' + ')');
    for (const c of priceChanges) {
      console.log(
        '  ' + c.name.substring(0,45).padEnd(46) +
        ('$' + c.oldCost.toFixed(4)).padStart(10) + ' → ' +
        ('$' + c.newCost.toFixed(4)).padEnd(10) +
        '  (case $' + c.casePrice.toFixed(2) + ')'
      );
    }
    console.log();
  }

  if (bwOnlyChanges.length > 0) {
    console.log('── Case size (base_weight) changes (' + bwOnlyChanges.length + ') ──────────────────────');
    for (const c of bwOnlyChanges) {
      console.log(
        '  ' + c.name.substring(0,45).padEnd(46) +
        'case: ' + String(c.oldBw).padStart(6) + ' → ' + String(c.newBw)
      );
    }
    console.log();
  }

  console.log(`  Updated:   ${updated}`);
  console.log(`  Unchanged: ${skipped}`);
  console.log(`  No match:  ${noMatch} (name not found in masterlist)`);
  if (DRY) {
    console.log('\n  DRY RUN — nothing written. Remove --dry-run to apply.');
  } else {
    console.log('\n  ✓ Saved to database.');
    if (updated > 0) {
      console.log('\n⚠  Run this next to update all sub-recipe + meal costs:');
      console.log('   node scripts/recalculate-costs.js');
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
