import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function parseCSV(content: string): string[][] {
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      if (currentField || currentLine.length > 0) {
        currentLine.push(currentField.trim());
        if (currentLine.some((f) => f !== '')) lines.push(currentLine);
        currentLine = [];
        currentField = '';
      }
    } else {
      currentField += char;
    }
  }
  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some((f) => f !== '')) lines.push(currentLine);
  }
  return lines;
}

// Strip column-number annotations like "[001]" from header values
function cleanHeader(value: string): string {
  return value.replace(/\[0*\d+\]/g, '').replace(/\n/g, ' ').trim();
}

function cleanValue(value: string): string {
  return (value || '').trim();
}

async function importData() {
  console.log('🚀 Starting Betterday data import...\n');

  const root = path.join(__dirname, '../..');
  const subRecipePath = path.join(root, 'NEW Culinary App Database - Sub-Recipe Masterlist (1).csv');
  const dishPath = path.join(root, 'NEW Culinary App Database - Dish Masterlist (1).csv');

  const subRecipeLines = parseCSV(fs.readFileSync(subRecipePath, 'utf-8'));
  const dishLines = parseCSV(fs.readFileSync(dishPath, 'utf-8'));

  console.log(`📄 Sub-recipe rows: ${subRecipeLines.length - 1}`);
  console.log(`📄 Dish rows: ${dishLines.length - 1}\n`);

  // ── STEP 1: Parse sub-recipe CSV ─────────────────────────────────────────
  // Columns: Station[0], Day[1], Priority[2], SubRecipeId[3], SubRecipeUrl[4],
  //          SubRecipeName[5], IngredientId[6], IngredientName[7], Trim%[8],
  //          Weight/Qty[9], Unit[10], PrepInstructions[11]

  interface SRRow {
    station: string; day: string; priority: string;
    srId: string; srName: string;
    ingId: string; ingName: string;
    trim: string; qty: string; unit: string; instructions: string;
  }

  const srGroups = new Map<string, SRRow[]>();

  for (const row of subRecipeLines.slice(1)) {
    if (row.length < 10) continue;
    const srId = cleanValue(row[3]);
    if (!srId) continue;

    const r: SRRow = {
      station: cleanValue(row[0]),
      day: cleanValue(row[1]),
      priority: cleanValue(row[2]),
      srId,
      srName: cleanValue(row[5]),
      ingId: cleanValue(row[6]),
      ingName: cleanValue(row[7]),
      trim: cleanValue(row[8]),
      qty: cleanValue(row[9]),
      unit: cleanValue(row[10]),
      instructions: cleanValue(row[11] || ''),
    };

    if (!srGroups.has(srId)) srGroups.set(srId, []);
    srGroups.get(srId)!.push(r);
  }

  // ── STEP 2: Parse dish CSV ────────────────────────────────────────────────
  // Columns: DishId[0], DishUrl[1], Category[2], DishName[3],
  //          SubRecipeId[4], SubRecipeName[5], PerPortion[6], Unit[7], Price[8]

  interface DishRow {
    dishId: string; category: string; dishName: string;
    srId: string; perPortion: string; unit: string; price: string;
  }

  const dishGroups = new Map<string, DishRow[]>();

  for (const row of dishLines.slice(1)) {
    if (row.length < 5) continue;
    const dishId = cleanValue(row[0]);
    if (!dishId) continue;

    const r: DishRow = {
      dishId,
      category: cleanValue(row[2]),
      dishName: cleanValue(row[3]),
      srId: cleanValue(row[4]),
      perPortion: cleanValue(row[6]),
      unit: cleanValue(row[7]),
      price: cleanValue(row[8]),
    };

    if (!dishGroups.has(dishId)) dishGroups.set(dishId, []);
    dishGroups.get(dishId)!.push(r);
  }

  console.log(`📦 Unique sub-recipes: ${srGroups.size}`);
  console.log(`🍽  Unique dishes: ${dishGroups.size}\n`);

  // ── STEP 3: Collect unique ingredients ───────────────────────────────────
  console.log('🥕 Importing ingredients...');
  const ingData = new Map<string, { internal_name: string; category: string }>();

  for (const rows of srGroups.values()) {
    for (const r of rows) {
      if (r.ingId && r.ingName && !ingData.has(r.ingId)) {
        ingData.set(r.ingId, {
          internal_name: r.ingName,
          category: r.station || 'General',
        });
      }
    }
  }

  // Batch upsert ingredients
  const oldIngToNew = new Map<string, string>();
  const ingEntries = Array.from(ingData.entries());

  for (let i = 0; i < ingEntries.length; i += 50) {
    const batch = ingEntries.slice(i, i + 50);
    await Promise.all(
      batch.map(async ([oldId, d]) => {
        try {
          const ing = await prisma.ingredient.upsert({
            where: { sku: `ING-${oldId}` },
            create: {
              internal_name: d.internal_name,
              display_name: d.internal_name,
              sku: `ING-${oldId}`,
              slug: d.internal_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `ing-${oldId}`,
              category: d.category,
              base_weight: 1.0,
              unit: 'Kgs',
              cost_per_unit: 0,
              allergen_tags: [],
              benefits: [],
            },
            update: {},
          });
          oldIngToNew.set(oldId, ing.id);
        } catch (e: any) {
          console.error(`  ⚠ ingredient ${oldId}: ${e.message}`);
        }
      }),
    );
    process.stdout.write(`\r  ${Math.min(i + 50, ingEntries.length)} / ${ingEntries.length}`);
  }
  console.log(`\n✅ ${oldIngToNew.size} ingredients imported\n`);

  // ── STEP 4: Import sub-recipes ────────────────────────────────────────────
  console.log('🍲 Importing sub-recipes...');
  const oldSrToNew = new Map<string, string>();
  let srCount = 0;

  for (const [srId, rows] of srGroups) {
    // Header row (first row that has srName filled)
    const header = rows.find((r) => r.srName) || rows[0];

    const components = rows
      .filter((r) => r.ingId && oldIngToNew.has(r.ingId))
      .map((r) => ({
        ingredient_id: oldIngToNew.get(r.ingId)!,
        quantity: parseFloat(r.qty) || 0,
        unit: r.unit || 'Kgs',
        trim_percentage: parseFloat(r.trim) || 0,
      }));

    try {
      const sr = await prisma.subRecipe.upsert({
        where: { sub_recipe_code: `SR-${srId}` },
        create: {
          name: header.srName || `Sub-Recipe ${srId}`,
          slug: (header.srName || `sub-recipe-${srId}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          sub_recipe_code: `SR-${srId}`,
          station_tag: header.station || null,
          production_day: header.day || null,
          priority: parseInt(header.priority) || 3,
          instructions: header.instructions || null,
          base_yield_weight: 1.0,
          base_yield_unit: 'Kgs',
          components: { create: components },
        },
        update: {},
      });
      oldSrToNew.set(srId, sr.id);
      srCount++;
      if (srCount % 100 === 0) process.stdout.write(`\r  ${srCount} / ${srGroups.size}`);
    } catch (e: any) {
      console.error(`\n  ⚠ sub-recipe ${srId}: ${e.message}`);
    }
  }
  console.log(`\n✅ ${srCount} sub-recipes imported\n`);

  // ── STEP 5: Import meals ──────────────────────────────────────────────────
  console.log('🍽  Importing meals...');
  let mealCount = 0;

  for (const [dishId, rows] of dishGroups) {
    const header = rows.find((r) => r.dishName) || rows[0];
    if (!header.dishName) continue;

    const components = rows
      .filter((r) => r.srId && oldSrToNew.has(r.srId))
      .map((r) => ({
        sub_recipe_id: oldSrToNew.get(r.srId)!,
        quantity: parseFloat(r.perPortion) || 0,
        unit: r.unit || 'gr',
      }));

    const priceRaw = header.price.replace('$', '').replace(',', '');
    const price = parseFloat(priceRaw) || null;

    try {
      await prisma.mealRecipe.create({
        data: {
          name: header.dishName,
          display_name: header.dishName,
          slug: header.dishName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'meal',
          category: header.category || null,
          final_yield_weight: 0,
          pricing_override: price,
          allergen_tags: [],
          dislikes: [],
          components: { create: components },
        },
      });
      mealCount++;
      if (mealCount % 50 === 0) process.stdout.write(`\r  ${mealCount} / ${dishGroups.size}`);
    } catch (e: any) {
      console.error(`\n  ⚠ meal ${dishId}: ${e.message}`);
    }
  }
  console.log(`\n✅ ${mealCount} meals imported\n`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const [ingCount, totalSr, totalMeal] = await Promise.all([
    prisma.ingredient.count(),
    prisma.subRecipe.count(),
    prisma.mealRecipe.count(),
  ]);

  console.log('═══════════════════════════════════');
  console.log('✅ Import complete!');
  console.log(`   Ingredients : ${ingCount}`);
  console.log(`   Sub-Recipes : ${totalSr}`);
  console.log(`   Meals       : ${totalMeal}`);
  console.log('═══════════════════════════════════');
}

importData()
  .catch((e) => { console.error('Fatal:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
