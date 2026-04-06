/**
 * Links extracted spec photos to PortionSpec records in the DB.
 * Matches meal display_name → mapping.json keys using fuzzy match.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const MAPPING_FILE = path.join(__dirname, '../../frontend/public/spec-photos/mapping.json');

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordOverlap(a, b) {
  const wa = new Set(normalize(a).split(' ').filter(w => w.length > 2));
  const wb = new Set(normalize(b).split(' ').filter(w => w.length > 2));
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size, 1);
}

async function main() {
  const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));

  // Filter out non-meal entries
  const validEntries = Object.entries(mapping).filter(([name]) => {
    const n = name.toLowerCase();
    return !n.startsWith('be careful') && !n.startsWith('notice') &&
           !n.startsWith('portioning') && !n.startsWith('place') &&
           name.length > 6;
  });

  console.log(`Found ${validEntries.length} valid photo entries`);

  // Load all meals with portion specs
  const meals = await prisma.mealRecipe.findMany({
    where: { is_active: true },
    select: { id: true, display_name: true },
  });

  const specs = await prisma.portionSpec.findMany({
    select: { id: true, meal_id: true, photo_url: true },
  });

  const specByMeal = Object.fromEntries(specs.map(s => [s.meal_id, s]));

  let updated = 0;
  let skipped = 0;
  const unmatched = [];

  for (const [photoName, photoUrl] of validEntries) {
    // Try exact match first
    let meal = meals.find(m => normalize(m.display_name) === normalize(photoName));

    // Fuzzy match
    if (!meal) {
      let bestScore = 0;
      let bestMeal = null;
      for (const m of meals) {
        const score = wordOverlap(m.display_name, photoName);
        if (score > bestScore) {
          bestScore = score;
          bestMeal = m;
        }
      }
      if (bestScore >= 0.6) meal = bestMeal;
    }

    if (!meal) {
      unmatched.push(photoName);
      continue;
    }

    const spec = specByMeal[meal.id];
    if (!spec) {
      skipped++;
      continue;
    }

    await prisma.portionSpec.update({
      where: { id: spec.id },
      data: { photo_url: photoUrl },
    });

    console.log(`  ✓ ${meal.display_name.substring(0,40)} -> ${photoUrl}`);
    updated++;
  }

  console.log(`\nUpdated: ${updated} specs`);
  console.log(`Skipped (no spec in DB): ${skipped}`);
  if (unmatched.length) {
    console.log(`Unmatched photos (${unmatched.length}):`);
    unmatched.forEach(n => console.log(`  - ${n}`));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
