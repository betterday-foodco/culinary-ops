/**
 * Commerce seed script — creates one known test customer (Jose Ramirez)
 * with populated addresses, payment methods, and a subscription so the
 * commerce-customers endpoints have realistic data to return against.
 *
 * Mirror of the mock data from conner/app/subscriber-hub-2.0.html so the
 * prototype UI and the real backend return identical shapes for smoke
 * testing.
 *
 * Run:
 *   cd backend
 *   npx ts-node prisma/commerce/seed.ts
 *
 * The script prints the created customer's UUID so you can paste it as
 * the `x-dev-customer-id` header in your requests.
 *
 * Idempotent: running twice doesn't create duplicate rows — it upserts
 * by email for Customer and by id for the related rows (hard-coded
 * UUIDs so the same IDs persist across runs).
 *
 * ⚠️ Points at COMMERCE_DATABASE_URL from backend/.env. That currently
 * resolves to the `dev` branch of the betterday-commerce Neon project,
 * so this script NEVER touches production.
 */
import { PrismaClient } from '@prisma/commerce-client';

const prisma = new PrismaClient();

// Hard-coded UUIDs so seed runs are idempotent and test customer IDs
// are stable across sessions (you can bookmark them in curl commands).
const JOSE_ID = '00000000-0000-4000-a000-000000000001';
const JOSE_HOME_ADDR_ID = '00000000-0000-4000-a000-000000000002';
const JOSE_OFFICE_ADDR_ID = '00000000-0000-4000-a000-000000000003';
const JOSE_VISA_ID = '00000000-0000-4000-a000-000000000004';
const JOSE_MASTERCARD_ID = '00000000-0000-4000-a000-000000000005';
const JOSE_SUB_ID = '00000000-0000-4000-a000-000000000006';

async function main() {
  console.log('🌱 Seeding commerce test customer (Jose Ramirez)...');

  // ── Customer ──
  const jose = await prisma.customer.upsert({
    where: { email: 'ramirez1630@ymail.com' },
    update: {},
    create: {
      id: JOSE_ID,
      display_id: 'BD-C-00012',
      email: 'ramirez1630@ymail.com',
      phone: '(630) 267-9543',
      first_name: 'Jose',
      last_name: 'Ramirez',
      birthday: new Date('1989-03-15'),
      member_since: new Date('2024-03-01'),
      status: 'active',
      source: 'signup',
      email_verified: true,
      email_verified_at: new Date('2024-03-01'),
      phone_verified: true,
      phone_verified_at: new Date('2024-03-01'),
      sms_opt_in: true,
      email_opt_in: true,
      allergens: ['Shellfish-Free'],
      diet_tags: ['High Protein'],
      disliked_meals: [],
      favorite_meals: [],
      points_balance: 1239,
      tags: ['beta-tester'],
      helcim_customer_id: null,
    },
  });
  console.log(`   ✅ Customer: ${jose.first_name} ${jose.last_name} (${jose.id})`);

  // ── Addresses ──
  await prisma.customerAddress.upsert({
    where: { id: JOSE_HOME_ADDR_ID },
    update: {},
    create: {
      id: JOSE_HOME_ADDR_ID,
      customer_id: jose.id,
      label: 'Home',
      type: 'delivery',
      recipient_first_name: 'Jose',
      recipient_last_name: 'Ramirez',
      recipient_email: 'ramirez1630@ymail.com',
      recipient_phone: '(630) 267-9543',
      street: '459 N Union St',
      city: 'Aurora',
      state: 'IL',
      zip: '60505',
      is_default: true,
    },
  });

  await prisma.customerAddress.upsert({
    where: { id: JOSE_OFFICE_ADDR_ID },
    update: {},
    create: {
      id: JOSE_OFFICE_ADDR_ID,
      customer_id: jose.id,
      label: 'Office',
      type: 'delivery',
      recipient_first_name: 'Jose',
      recipient_last_name: 'Ramirez',
      recipient_email: 'ramirez1630@ymail.com',
      recipient_phone: '(630) 267-9543',
      street: '12425 Rhea Dr Ste A',
      city: 'Plainfield',
      state: 'IL',
      zip: '60585',
      is_default: false,
    },
  });
  console.log('   ✅ 2 addresses (Home, Office)');

  // ── Payment methods ──
  await prisma.paymentMethod.upsert({
    where: { id: JOSE_VISA_ID },
    update: {},
    create: {
      id: JOSE_VISA_ID,
      customer_id: jose.id,
      processor: 'helcim',
      processor_token: 'helcim_tok_fake_visa_4242',
      brand: 'visa',
      last4: '4242',
      exp_month: 12,
      exp_year: 2027,
      cardholder_name: 'Jose Ramirez',
      is_default: true,
    },
  });

  await prisma.paymentMethod.upsert({
    where: { id: JOSE_MASTERCARD_ID },
    update: {},
    create: {
      id: JOSE_MASTERCARD_ID,
      customer_id: jose.id,
      processor: 'helcim',
      processor_token: 'helcim_tok_fake_mc_8888',
      brand: 'mc',
      last4: '8888',
      exp_month: 3,
      exp_year: 2026,
      cardholder_name: 'Jose Ramirez',
      is_default: false,
    },
  });
  console.log('   ✅ 2 payment methods (Visa 4242 default, MC 8888)');

  // ── Subscription ──
  const nextSunday = new Date();
  nextSunday.setDate(nextSunday.getDate() + ((7 - nextSunday.getDay()) % 7 || 7));

  await prisma.subscription.upsert({
    where: { id: JOSE_SUB_ID },
    update: {},
    create: {
      id: JOSE_SUB_ID,
      customer_id: jose.id,
      cadence: 'weekly',
      status: 'active',
      next_renewal_at: nextSunday,
      default_payment_id: JOSE_VISA_ID,
      default_address_id: JOSE_HOME_ADDR_ID,
      default_meal_count: 9,
      savings_tier: 14,
      started_at: new Date('2024-03-01'),
      lifetime_orders: 52,
      lifetime_spend: 7842.56,
    },
  });
  console.log('   ✅ Subscription (weekly, active, 9 meals, tier 14%)');

  console.log('\n📋 Seed complete. To use in requests:');
  console.log(`   curl -H "x-dev-customer-id: ${jose.id}" http://localhost:3001/api/commerce/customers/me\n`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
