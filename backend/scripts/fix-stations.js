/**
 * fix-stations.js
 * Consolidates messy station_tag values into 6 canonical station names.
 *
 * Canonical stations:
 *   Veg Station, Protein Station, Oven Station, Sauce Station,
 *   Breakfast Station, Pack Station
 *
 * Run from backend/: node scripts/fix-stations.js
 * Dry run first:     node scripts/fix-stations.js --dry-run
 */
const { PrismaClient } = require('../node_modules/.prisma/client');
const prisma = new PrismaClient();

const DRY = process.argv.includes('--dry-run');

// ── Mapping: any variation → canonical name ──────────────────────────────────
const STATION_MAP = {
  // Protein
  'Pro Station':     'Protein Station',
  'Pro T Station':   'Protein Station',
  'Protein Station': 'Protein Station',
  'Po Station':      'Protein Station',

  // Sauce
  'Sauce Station':   'Sauce Station',
  'Sauce W Station': 'Sauce Station',

  // Oven
  'Oven Station':    'Oven Station',
  'Oven W Station':  'Oven Station',
  'OvenT Station':   'Oven Station',

  // Pack
  'Pack Station':       'Pack Station',
  'Packaging Station':  'Pack Station',
  'Packing Station':    'Pack Station',

  // Breakfast
  'Break Station':      'Breakfast Station',
  'Breakfast Station':  'Breakfast Station',

  // Veg
  'Veg Station':  'Veg Station',
};

async function main() {
  console.log(`=== Fix Station Names ${DRY ? '(DRY RUN — no changes saved)' : ''} ===\n`);

  // ── 1. Get all current unique station_tag values ─────────────────────────
  const all = await prisma.subRecipe.findMany({
    select: { id: true, name: true, station_tag: true },
  });

  const counts = {};
  for (const sr of all) {
    const tag = sr.station_tag ?? 'null';
    counts[tag] = (counts[tag] || 0) + 1;
  }

  console.log('Current station distribution:');
  for (const [tag, count] of Object.entries(counts).sort()) {
    const canonical = STATION_MAP[tag];
    const status = canonical
      ? (canonical === tag ? '✓ already correct' : `→ will become "${canonical}"`)
      : (tag === 'null' ? '  (unassigned)' : '⚠  NOT IN MAP — will be left as-is');
    console.log(`  ${String(count).padStart(4)}  ${tag.padEnd(25)} ${status}`);
  }
  console.log();

  // ── 2. Batch Station — flag for manual review ────────────────────────────
  const batchItems = all.filter(sr => sr.station_tag === 'Batch Station');
  if (batchItems.length > 0) {
    console.log(`⚠  BATCH STATION (${batchItems.length} items) — needs manual assignment:`);
    for (const sr of batchItems) {
      console.log(`   - ${sr.id.substring(0, 8)}... | ${sr.name}`);
    }
    console.log('   These need to be manually set to Veg Station / Oven Station / Sauce Station.\n');
  }

  if (DRY) {
    console.log('Dry run complete. Run without --dry-run to apply changes.');
    return;
  }

  // ── 3. Apply updates ─────────────────────────────────────────────────────
  let totalUpdated = 0;

  for (const [from, to] of Object.entries(STATION_MAP)) {
    if (from === to) continue; // already canonical, skip
    const result = await prisma.subRecipe.updateMany({
      where: { station_tag: from },
      data: { station_tag: to },
    });
    if (result.count > 0) {
      console.log(`  "${from}" → "${to}" (${result.count} records)`);
      totalUpdated += result.count;
    }
  }

  console.log(`\n✓ Done — ${totalUpdated} sub-recipes updated.`);

  // ── 4. Verify final distribution ─────────────────────────────────────────
  const final = await prisma.subRecipe.groupBy({
    by: ['station_tag'],
    _count: { id: true },
    orderBy: { station_tag: 'asc' },
  });
  console.log('\nFinal station distribution:');
  for (const row of final) {
    console.log(`  ${String(row._count.id).padStart(4)}  ${row.station_tag ?? '(unassigned)'}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
