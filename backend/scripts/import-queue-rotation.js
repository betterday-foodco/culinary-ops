/**
 * Import rotation queue from menubuilder-chef.html into the DB.
 * Maps HTML column IDs → our column IDs, and #NNN → BD-NNN meal codes.
 * Run from backend/: node scripts/import-queue-rotation.js
 */

const { PrismaClient } = require('../node_modules/@prisma/client');
const prisma = new PrismaClient();

// ── Rotation data extracted from menubuilder-chef.html queues ────────────────
// dishId '#509' maps to meal_code 'BD-509'
const HTML_QUEUES = {
  'sig-a':         ['#509','#509','#509','#509','#509','#509','#509','#509','#509','#509','#509','#509'],
  'sig-b':         ['#305','#305','#305','#305','#305','#305','#305','#305','#305','#305','#305','#305'],
  'sig-c':         ['#508','#508','#561','#561','#563','#563','#515','#515','#526','#526','#490','#490'],
  'sig-d':         ['#516','#516','#562','#562','#568','#568','#537','#537','#565','#565','#574','#574'],
  'wildcard-meat': ['#382','#382','#521','#521','#566','#566','#560','#560','#429','#429','#489','#489'],
  'pasta-omni':    ['#393','#388','#533','#538','#464','#556','#469','#99','#393','#388'],
  'curry-omni':    ['#397','#391','#520','#498','#518','#541','#521','#494','#474','#397','#391','#520','#498','#518','#539','#521','#494'],
  'comfort-omni':  ['#328','#327','#333','#333','#332','#330','#477','#6','#478','#328','#327','#478','#333','#332','#330','#477','#6','#377'],
  'asian-omni':    ['#309','#466','#353','#457','#50','#344','#114','#359','#227','#351','#562'],
  'powerbowl-omni':['#354','#414','#488','#567','#362','#407','#396','#575','#463','#381','#516','#354','#414','#488','#567','#362','#407','#396','#575','#463','#381'],
  'grocery-omni':  ['#476','#280','#558','#284','#476','#280','#558','#284','#476','#280','#476','#280','#514','#284','#476','#280','#514','#284','#476','#280'],
  'wildcard-vegan':['#278','#514','#30','#441','#273','#382','#305','#275','#282'],
};

// ── Map HTML column IDs → our DB column IDs ───────────────────────────────────
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

async function main() {
  // 1. Load all meals — build map from meal_code → id
  const meals = await prisma.mealRecipe.findMany({ select: { id: true, meal_code: true, name: true } });
  const byCode = new Map();
  for (const m of meals) {
    if (m.meal_code) byCode.set(m.meal_code.trim().toUpperCase(), m);
  }
  console.log(`Loaded ${byCode.size} meals from DB`);

  // 2. Clear existing queue
  const deleted = await prisma.menuQueueItem.deleteMany({});
  console.log(`Cleared ${deleted.count} existing queue items`);

  // 3. Import rotation
  let created = 0;
  let skipped = 0;

  for (const [htmlColId, dishIds] of Object.entries(HTML_QUEUES)) {
    const colId = COL_MAP[htmlColId];
    if (!colId) { console.warn(`No mapping for ${htmlColId}`); continue; }

    for (let pos = 0; pos < dishIds.length; pos++) {
      const raw = dishIds[pos];
      // Convert #509 → BD-509
      const code = 'BD-' + raw.replace('#', '');
      const meal = byCode.get(code.toUpperCase());

      if (!meal) {
        console.warn(`  ⚠ ${htmlColId}[${pos}]: ${code} not found in DB — skipping`);
        skipped++;
        continue;
      }

      await prisma.menuQueueItem.create({
        data: {
          column_id:      colId,
          meal_id:        meal.id,
          position:       pos,
          repeat_weeks:   4,
          weeks_remaining: pos,
        },
      });
      created++;
    }
    console.log(`  ✓ ${htmlColId} → ${colId}: ${dishIds.length} slots`);
  }

  console.log(`\nDone! Created: ${created}  Skipped (not in DB): ${skipped}`);
  if (skipped > 0) {
    console.log(`\nTip: Run import-new-csvs.js first to make sure all meals are in the DB.`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
