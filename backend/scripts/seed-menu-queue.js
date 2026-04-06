/**
 * seed-menu-queue.js
 *
 * Seeds the MenuQueueItem table from the chef's 8.0 Menu Schedule HTML prototype.
 * Maps HTML dish codes (#509) → DB meal codes (BD-509), deduplicates per column,
 * skips #TBD entries, and skips meals not found in the DB.
 *
 * Run from backend/:
 *   node scripts/seed-menu-queue.js
 *
 * To RESET and re-seed (clears existing queue first):
 *   node scripts/seed-menu-queue.js --reset
 */

const { PrismaClient } = require('../node_modules/@prisma/client');
const prisma = new PrismaClient();

// ── Column mapping: HTML id → culinary-ops column_id ──────────────────────────
const COL_MAP = {
  'sig-a':          'meat_1',
  'sig-b':          'meat_2',
  'sig-c':          'meat_3',
  'sig-d':          'meat_4',
  'wildcard-meat':  'meat_5',
  'pasta-omni':     'omni_1',
  'curry-omni':     'omni_2',
  'comfort-omni':   'omni_3',
  'asian-omni':     'omni_4',
  'powerbowl-omni': 'omni_5',
  'grocery-omni':   'omni_6',
  'wildcard-vegan': 'vegan_1',
};

// ── Queue data from HTML (8.0 Menu Schedule, March 15 2026 onward) ─────────────
// Duplicates are intentional in the rotation schedule but we only store each
// meal once per column (position = order of first appearance).
const RAW_QUEUES = {
  'sig-a':          ['#509'],
  'sig-b':          ['#305'],
  'sig-c':          ['#508','#561','#563','#515','#526','#490'],
  'sig-d':          ['#516','#562','#568','#537','#565','#574','#54'],
  'wildcard-meat':  ['#382','#521','#566','#560','#429','#489'],
  'pasta-omni':     ['#393','#388','#533','#538','#464','#556','#469','#99'],
  'curry-omni':     ['#397','#391','#520','#498','#518','#541','#521','#494','#474','#539'],
  'comfort-omni':   ['#328','#327','#333','#332','#330','#477','#6','#478','#377'],
  'asian-omni':     ['#309','#466','#353','#457','#50','#344','#114','#359','#227','#351','#562'],
  'powerbowl-omni': ['#354','#414','#488','#567','#362','#407','#396','#575','#463','#381','#516'],
  'grocery-omni':   ['#476','#280','#558','#284','#514'],
  'wildcard-vegan': ['#278','#514','#30','#441','#273','#382','#305','#275','#282'],
};

// Convert #509 → BD-509
function toMealCode(htmlId) {
  return 'BD-' + htmlId.replace(/^#/, '');
}

async function main() {
  const reset = process.argv.includes('--reset');

  if (reset) {
    console.log('🗑  Clearing existing menu queue...');
    await prisma.menuQueueItem.deleteMany({});
    console.log('   Done.\n');
  }

  // Build a lookup map: meal_code → meal id
  const allMeals = await prisma.mealRecipe.findMany({
    select: { id: true, meal_code: true, display_name: true },
    where: { is_active: true },
  });
  const byCode = new Map();
  for (const m of allMeals) {
    if (m.meal_code) byCode.set(m.meal_code.toUpperCase(), m);
  }

  console.log(`📦  Found ${allMeals.length} active meals in DB\n`);

  let totalInserted = 0;
  let totalSkipped  = 0;
  const notFound    = [];

  for (const [htmlColId, dishIds] of Object.entries(RAW_QUEUES)) {
    const colId = COL_MAP[htmlColId];
    if (!colId) continue;

    // Deduplicate while preserving order
    const seen = new Set();
    const unique = [];
    for (const id of dishIds) {
      if (!seen.has(id)) { seen.add(id); unique.push(id); }
    }

    console.log(`\n📋  ${htmlColId} → ${colId}  (${unique.length} unique dishes)`);

    for (let pos = 0; pos < unique.length; pos++) {
      const htmlId = unique[pos];

      // Skip TBD placeholders
      if (htmlId.startsWith('#TBD')) {
        console.log(`   ⏭  ${htmlId} — skipped (TBD placeholder)`);
        totalSkipped++;
        continue;
      }

      const mealCode = toMealCode(htmlId);
      const meal = byCode.get(mealCode.toUpperCase());

      if (!meal) {
        console.log(`   ❌  ${htmlId} (${mealCode}) — not found in DB`);
        notFound.push({ htmlId, mealCode, column: colId });
        totalSkipped++;
        continue;
      }

      // Check if already exists in this column (idempotent)
      const existing = await prisma.menuQueueItem.findUnique({
        where: { column_id_meal_id: { column_id: colId, meal_id: meal.id } },
      });

      if (existing) {
        console.log(`   ✓  ${htmlId} — already exists, skipped`);
        totalSkipped++;
        continue;
      }

      await prisma.menuQueueItem.create({
        data: {
          column_id:       colId,
          meal_id:         meal.id,
          position:        pos,
          repeat_weeks:    4,
          weeks_remaining: pos,
        },
      });

      console.log(`   ✅  [${pos}] ${htmlId} → ${meal.display_name}`);
      totalInserted++;
    }
  }

  console.log('\n─────────────────────────────────────────────');
  console.log(`✅  Inserted : ${totalInserted}`);
  console.log(`⏭  Skipped  : ${totalSkipped}`);

  if (notFound.length > 0) {
    console.log(`\n⚠️  ${notFound.length} dish(es) not found in DB (meal_code missing or not active):`);
    for (const { htmlId, mealCode, column } of notFound) {
      console.log(`   ${htmlId} → ${mealCode}  (column: ${column})`);
    }
    console.log('\n   These dishes may need to be added to the Meals section first.');
  }

  console.log('\nDone! 🎉');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
