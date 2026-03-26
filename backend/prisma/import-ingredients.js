// import-ingredients.js
// Imports ingredients from "NEW Culinary Inventory Sheet - Ingredient Masterlist.csv"
// Maps: Name, Vendor, SKU, Price, Size, Unit, Location, Stock, Trim% → Ingredient model
//
// Run from backend/ directory:
//   node prisma/import-ingredients.js

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

function parsePrice(raw) {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/[$,]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseFloat2(raw) {
  if (!raw) return 0;
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

function normalizeUnit(raw) {
  const u = (raw || '').toLowerCase().trim();
  if (u === 'kg') return 'Kgs';
  if (u === 'gr' || u === 'g') return 'g';
  if (u === 'un' || u === 'each' || u === 'pc') return 'each';
  if (u === 'ml') return 'mL';
  if (u === 'l') return 'L';
  return raw || 'Kgs';
}

function inferCategory(location) {
  const l = (location || '').toLowerCase();
  if (l.includes('freezer')) return 'Frozen';
  if (l.includes('fridge')) return 'Fresh';
  if (l.includes('dry')) return 'Pantry';
  return 'Other';
}

function cleanVendor(raw) {
  // "Costco - 001" → "Costco", "GFS - 003" → "GFS"
  if (!raw) return null;
  return raw.replace(/\s*-\s*\d+$/, '').trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Find the CSV — look in common locations
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'NEW Culinary Inventory Sheet - Ingredient Masterlist.csv'),
    path.join('D:\\', 'NEW Culinary Inventory Sheet - Ingredient Masterlist.csv'),
    path.join(__dirname, 'Ingredient Masterlist.csv'),
  ];

  let csvPath = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { csvPath = c; break; }
  }

  if (!csvPath) {
    console.error('❌ CSV file not found. Copy it next to this script or update the path.');
    process.exit(1);
  }

  console.log(`📂 Reading: ${csvPath}`);
  const text = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(text);

  // Skip header rows — find first data row (starts with a number)
  const dataRows = rows.filter(r => /^\d+$/.test(r[0]));
  console.log(`📋 Found ${dataRows.length} ingredients`);

  let created = 0, updated = 0, skipped = 0;

  for (const row of dataRows) {
    // CSV columns (0-indexed):
    // 0: ID  1: URL  2: Name  3: Vendor  4: VendorSKU  5: CasePrice
    // 6: CaseSize  7: CaseUnit  8: Location  9: LastUsed
    // 10: TheoOnHand  11: OnOrder  12: Allergens  13: Trim%

    const externalId  = row[0] || '';
    const name        = row[2] || '';
    const vendor      = row[3] || '';
    const vendorSku   = row[4] || '';
    const casePrice   = parsePrice(row[5]);
    const caseSize    = parseFloat2(row[6]) || 1;
    const caseUnit    = row[7] || 'kg';
    const location    = (row[8] || '').replace(/\s*-\s*\d+$/, '').trim(); // "Dry Storage  - 003" → "Dry Storage"
    const stock       = parseFloat2(row[10]);
    const trimPct     = parseFloat2(row[13]);

    if (!name) { skipped++; continue; }

    // SKU: prefer vendor SKU, fall back to "EBD-{id}"
    const sku = vendorSku || `EBD-${externalId}`;

    // Cost per unit: case price / case size
    const costPerUnit = caseSize > 0 ? casePrice / caseSize : casePrice;

    const data = {
      internal_name:   name,
      display_name:    name,
      sku,
      category:        inferCategory(location),
      location:        location || null,
      supplier_name:   cleanVendor(vendor),
      trim_percentage: trimPct,
      base_weight:     caseSize,
      cost_per_unit:   Math.round(costPerUnit * 1000) / 1000, // 3 decimal places
      unit:            normalizeUnit(caseUnit),
      stock,
      allergen_tags:   [],
      benefits:        [],
      is_active:       true,
    };

    try {
      // 1. Try exact SKU match first
      let existing = await prisma.ingredient.findUnique({ where: { sku } });

      // 2. If not found by SKU, try matching by name (case-insensitive) to avoid duplicates
      if (!existing) {
        const byName = await prisma.ingredient.findMany({
          where: { internal_name: { equals: name, mode: 'insensitive' } },
        });
        if (byName.length === 1) {
          existing = byName[0];
          // Update SKU to the new canonical value
          data.sku = sku;
        } else if (byName.length > 1) {
          // Multiple matches — skip to avoid ambiguity
          console.warn(`  ⚠️  Multiple matches for "${name}" — skipped`);
          skipped++;
          continue;
        }
      }

      if (existing) {
        await prisma.ingredient.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.ingredient.create({ data });
        created++;
      }
    } catch (err) {
      console.warn(`  ⚠️  Skipped "${name}" (sku: ${sku}): ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Created : ${created}`);
  console.log(`   Updated : ${updated}`);
  console.log(`   Skipped : ${skipped}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
