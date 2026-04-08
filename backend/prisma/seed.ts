import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * Seed the `public.*` keys in SystemConfig from brand/site-info.seed.json.
 *
 * Uses upsert with `update: {}` so existing rows are NEVER overwritten —
 * once a production admin edits a value via the dashboard, re-running the
 * seed will not clobber their change. Only brand-new keys (ones not yet
 * in the database) get created.
 *
 * Comment keys (those starting with '_') are skipped so README-style
 * metadata inside the JSON file never leaks to the database.
 */
async function seedPublicSiteConfig() {
  console.log('\n🌐 Seeding public.* site config keys...');

  const seedPath = path.resolve(__dirname, '../../brand/site-info.seed.json');
  if (!fs.existsSync(seedPath)) {
    console.log('   ⚠️  brand/site-info.seed.json not found — skipping');
    return;
  }

  const raw = fs.readFileSync(seedPath, 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, string>;

  let created = 0;
  let kept = 0;
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith('_')) continue; // skip comment keys
    if (!key.startsWith('public.')) {
      console.warn(`   ⚠️  skipping '${key}' — seed file only holds public.* keys`);
      continue;
    }

    const existing = await prisma.systemConfig.findUnique({ where: { key } });
    if (existing) {
      kept++;
      continue;
    }
    await prisma.systemConfig.create({ data: { key, value } });
    created++;
  }

  console.log(`   ✅ Created ${created} new public keys, kept ${kept} existing`);
}

async function main() {
  console.log('🌱 Seeding admin user...');

  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@betterday.com' },
    update: {},
    create: {
      email: 'admin@betterday.com',
      password_hash: hashedPassword,
      role: 'admin',
    },
  });

  console.log('✅ Admin user ready:', admin.email);
  console.log('   Password: admin123');

  await seedPublicSiteConfig();

  const counts = await Promise.all([
    prisma.ingredient.count(),
    prisma.subRecipe.count(),
    prisma.mealRecipe.count(),
  ]);
  console.log(`\n📊 Database state:`);
  console.log(`   Ingredients : ${counts[0]}`);
  console.log(`   Sub-Recipes : ${counts[1]}`);
  console.log(`   Meals       : ${counts[2]}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
