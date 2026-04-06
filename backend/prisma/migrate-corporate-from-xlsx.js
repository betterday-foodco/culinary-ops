/**
 * migrate-corporate-from-xlsx.js
 *
 * One-time data migration: imports all 11 sheets from
 * "D:\BetterDay Corporate App.xlsx" into the Neon PostgreSQL database
 * via Prisma.
 *
 * Run:
 *   node prisma/migrate-corporate-from-xlsx.js
 *   node prisma/migrate-corporate-from-xlsx.js --dry-run   (preview only)
 *
 * Idempotent: uses upsert throughout so it can be re-run safely.
 */

const path = require('path');
const XLSX  = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const XLSX_PATH = path.resolve(__dirname, '../../../../../../../BetterDay Corporate App.xlsx');
const DRY_RUN   = process.argv.includes('--dry-run');

const prisma = new PrismaClient();

// ─── helpers ─────────────────────────────────────────────────────────────────

function readSheet(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet "${name}" not found. Available: ${wb.SheetNames.join(', ')}`);
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function n(v) { return v == null ? 0 : Number(v) || 0; }      // number or 0 (never null)
function s(v) { return v == null ? null : String(v).trim() || null; }
function b(v) { return v === true || v === 'TRUE' || v === 'on' || v === 1 || v === '1'; }
function normalizeEmail(e) { return e == null ? null : String(e).trim().toLowerCase(); }

function parseDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  // XLSX serial numbers
  if (typeof v === 'number') return XLSX.SSF.parse_date_code(v) ? new Date(XLSX.SSF.format('yyyy-mm-dd', v)) : null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function tierConfig(row, prefix) {
  // prefix = '' | 'Free' | 'Tier1' | 'Tier2' | 'Tier3'
  const p = prefix ? `${prefix}_` : 'Free';
  return {
    meals:          n(row[`${prefix}_Meals`] ?? row[`FreeMealsPerWeek`] ?? row[`${prefix}MealsPerWeek`]),
    employeePrice:  n(row[`${p}EmployeePrice`] ?? row[`FreeTier_EmployeePrice`]),
    bdSubsidy:      n(row[`${p}BDSubsidy`]      ?? row[`FreeTier_BDSubsidy`]),
    companySubsidy: n(row[`${p}CompanySubsidy`]  ?? row[`FreeTier_CompanySubsidy`]),
  };
}

function buildTierConfigFromRow(row) {
  return {
    free: {
      meals:          n(row['FreeMealsPerWeek']),
      employeePrice:  n(row['FreeTier_EmployeePrice']),
      bdSubsidy:      n(row['FreeTier_BDSubsidy']),
      companySubsidy: n(row['FreeTier_CompanySubsidy']),
    },
    tier1: {
      meals:          n(row['Tier1_Meals']),
      employeePrice:  n(row['Tier1_EmployeePrice']),
      bdSubsidy:      n(row['Tier1_BDSubsidy']),
      companySubsidy: n(row['Tier1_CompanySubsidy']),
    },
    tier2: {
      meals:          n(row['Tier2_Meals']),
      employeePrice:  n(row['Tier2_EmployeePrice']),
      bdSubsidy:      n(row['Tier2_BDSubsidy']),
      companySubsidy: n(row['Tier2_CompanySubsidy']),
    },
    tier3: {
      meals:          n(row['Tier3_Meals']),
      employeePrice:  n(row['Tier3_EmployeePrice']),
      bdSubsidy:      n(row['Tier3_BDSubsidy']),
      companySubsidy: n(row['Tier3_CompanySubsidy']),
    },
  };
}

// Convert "#509" → "BD-509" to match MealRecipe.meal_code
function externalMealIdToCode(id) {
  if (!id) return null;
  const clean = String(id).trim().replace(/^#/, '');
  return `BD-${clean}`;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📂  Reading: ${XLSX_PATH}`);
  const wb = XLSX.readFile(XLSX_PATH);
  console.log(`    Sheets found: ${wb.SheetNames.join(', ')}\n`);

  if (DRY_RUN) console.log('🔎  DRY RUN — no writes will be made\n');

  // ── 1. CorporateSetting (Settings sheet) ──────────────────────────────────
  {
    const rows = readSheet(wb, 'Settings');
    console.log(`⚙️   Settings: ${rows.length} row(s)`);
    for (const row of rows) {
      const key   = s(row['Key']);
      const value = s(row['Value']);
      if (!key) continue;
      if (!DRY_RUN) {
        await prisma.corporateSetting.upsert({
          where:  { key },
          update: { value: value ?? '' },
          create: { key, value: value ?? '' },
        });
      }
      console.log(`    ${key} = ${value}`);
    }
  }

  // ── 2. CorporateCompany (Companies sheet) ─────────────────────────────────
  {
    const rows = readSheet(wb, 'Companies');
    console.log(`\n🏢  Companies: ${rows.length} row(s)`);

    const KNOWN_KEYS = new Set([
      'CompanyID','CompanyName','CompanyEmailDomain','Status',
      'AddressLine1','AddressLine2','City','Province','PostalCode',
      'PrimaryContactName','PrimaryContactEmail','PrimaryContactPhone',
      'BillingContactName','BillingContactEmail',
      'DeliveryDay','DeliveryInstructions','FridgeLocationDescription',
      'DeliveryWindowStart','DeliveryWindowEnd',
    ]);

    for (const row of rows) {
      const id = s(row['CompanyID']);
      if (!id) continue;

      // Everything not in KNOWN_KEYS goes to extra
      const extra = {};
      for (const [k, v] of Object.entries(row)) {
        if (!KNOWN_KEYS.has(k) && k !== 'company_id') extra[k] = v;
      }

      const data = {
        name:          s(row['CompanyName']) ?? id,
        email:         normalizeEmail(row['PrimaryContactEmail']),
        phone:         s(row['PrimaryContactPhone']),
        address:       s(row['AddressLine1']),
        city:          s(row['City']),
        province:      s(row['Province']),
        postal_code:   s(row['PostalCode']),
        contact_name:  s(row['PrimaryContactName']),
        contact_phone: s(row['PrimaryContactPhone']),
        contact_email: normalizeEmail(row['PrimaryContactEmail']),
        is_active:     row['Status'] === 'Active',
        delivery_day:  s(row['DeliveryDay']),
        delivery_notes: s(row['DeliveryInstructions']),
        extra,
      };

      console.log(`    ✓ ${id}: ${data.name}`);
      if (!DRY_RUN) {
        await prisma.corporateCompany.upsert({
          where:  { id },
          update: data,
          create: { id, ...data },
        });
      }
    }
  }

  // ── 3. CorporateBenefitLevel (BenefitLevels sheet) ────────────────────────
  {
    const rows = readSheet(wb, 'BenefitLevels');
    console.log(`\n🎖️   BenefitLevels: ${rows.length} row(s)`);

    for (const row of rows) {
      const companyId = s(row['CompanyID']);
      const levelId   = s(row['LevelID']);
      if (!companyId || levelId == null) continue;

      const tier_config = buildTierConfigFromRow(row);

      const data = {
        level_name:      s(row['LevelName']),
        level_order:     n(row['LevelOrder']),
        free_meals_week: n(row['FreeMealsPerWeek']),
        max_meals_week:  n(row['MaxMealsPerWeek']),
        full_price:      n(row['FullPrice']),
        tier_config,
      };

      console.log(`    ✓ ${companyId}/${levelId} (${data.level_name})`);
      if (!DRY_RUN) {
        await prisma.corporateBenefitLevel.upsert({
          where:  { company_id_level_id: { company_id: companyId, level_id: levelId } },
          update: data,
          create: { company: { connect: { id: companyId } }, level_id: levelId, ...data },
        });
      }
    }
  }

  // ── 3b. CorporateParLevel (ParLevels sheet) ───────────────────────────────
  {
    const rows = readSheet(wb, 'ParLevels');
    // Deduplicate: sheet may have duplicate rows (same companyId+categoryId)
    const seen = new Set();
    const unique = rows.filter(r => {
      const key = `${s(r['CompanyID'])}::${s(r['CategoryID'])}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`\n📊  ParLevels: ${unique.length} row(s) (${rows.length} total, deduplicated)`);

    for (const row of unique) {
      const companyId  = s(row['CompanyID']);
      const categoryId = s(row['CategoryID']);
      if (!companyId || !categoryId) continue;

      let items_json = null;
      try { items_json = row['ItemsJSON'] ? JSON.parse(row['ItemsJSON']) : null; } catch (_) {}

      const data = {
        par_quantity: n(row['WeeklyQty']),
        items_json:   items_json ?? [],
      };

      console.log(`    ✓ ${companyId}/${categoryId}: qty=${data.par_quantity}`);
      if (!DRY_RUN) {
        await prisma.corporateParLevel.upsert({
          where:  { company_id_category_id: { company_id: companyId, category_id: categoryId } },
          update: data,
          create: {
            category_id:  categoryId,
            ...data,
            company: { connect: { id: companyId } },
          },
        });
      }
    }
  }

  // ── 4. CorporateEmployee (Employees sheet) ────────────────────────────────
  {
    const rows = readSheet(wb, 'Employees');
    console.log(`\n👤  Employees: ${rows.length} row(s)`);

    for (const row of rows) {
      const code      = s(row['EmployeeID']);
      const companyId = s(row['CompanyID']);
      const email     = normalizeEmail(row['Email']);
      if (!code || !companyId || !email) continue;

      const firstName = s(row['FirstName']) ?? '';
      const lastName  = s(row['LastName'])  ?? '';
      const name = `${firstName} ${lastName}`.trim() || email;

      const data = {
        company_id:    companyId,
        email,
        name,
        benefit_level: s(row['BenefitLevel']),
        is_active:     true,
      };

      console.log(`    ✓ ${code}: ${name} (${companyId})`);
      if (!DRY_RUN) {
        await prisma.corporateEmployee.upsert({
          where:  { employee_code: code },
          update: { email, name, benefit_level: s(row['BenefitLevel']), is_active: true },
          create: {
            employee_code: code,
            email,
            name,
            benefit_level: s(row['BenefitLevel']),
            is_active:     true,
            company:       { connect: { id: companyId } },
          },
        });
      }
    }
  }

  // ── 5. CorporateCompanyPIN (CompanyPINs sheet) ────────────────────────────
  // NOTE: We store the plain-text PIN for migration. The new auth module
  // will bcrypt-hash it the first time the manager logs in.
  {
    const rows = readSheet(wb, 'CompanyPINs');
    console.log(`\n🔑  CompanyPINs: ${rows.length} row(s)`);

    for (const row of rows) {
      const companyId = s(row['CompanyID']);
      const pin       = s(row['CompanyPin']);
      if (!companyId || !pin) continue;

      // Store as plain text prefixed with "plain:" so the auth module knows
      // it needs to be hashed on first use.
      const pin_hash = `plain:${pin}`;

      console.log(`    ✓ ${companyId}: PIN set`);
      if (!DRY_RUN) {
        await prisma.corporateCompanyPIN.upsert({
          where:  { company_id: companyId },
          update: { pin_hash },
          create: { pin_hash, company: { connect: { id: companyId } } },
        });
      }
    }
  }

  // ── 6. CompanyInvoice (CompanyInvoices sheet) ─────────────────────────────
  {
    const rows = readSheet(wb, 'CompanyInvoices');
    console.log(`\n🧾  CompanyInvoices: ${rows.length} row(s)`);

    for (const row of rows) {
      const invoiceNumber = s(row['InvoiceNumber']);
      const companyId     = s(row['CompanyID']);
      if (!invoiceNumber || !companyId) continue;

      const data = {
        company_id:   companyId,
        period_start: parseDate(row['PeriodStart']) ?? new Date(),
        period_end:   parseDate(row['PeriodEnd'])   ?? new Date(),
        amount_total: n(row['AmountDue']),
        amount_paid:  n(row['PaidAmount']),
        status:       s(row['Status']) ?? 'pending',
        notes:        s(row['Notes']),
        issued_at:    parseDate(row['CreatedAt']),
        due_at:       parseDate(row['DueDate']),
      };

      console.log(`    ✓ ${invoiceNumber} (${companyId}) — $${data.amount_total}`);
      if (!DRY_RUN) {
        const { company_id: _cid, ...invoiceData } = data;
        await prisma.companyInvoice.upsert({
          where:  { invoice_number: invoiceNumber },
          update: invoiceData,
          create: {
            invoice_number: invoiceNumber,
            ...invoiceData,
            company: { connect: { id: companyId } },
          },
        });
      }
    }
  }

  // ── 7. CorporateOrder + CorporateOrderItem (CorporateOrders sheet) ────────
  // Each row = one meal line item. We group by OrderID to create headers.
  {
    const rows = readSheet(wb, 'CorporateOrders');
    console.log(`\n🛒  CorporateOrders: ${rows.length} row(s)`);

    // Build a map from email → employee record (for employee_id FK lookup)
    const empByEmail = DRY_RUN ? {} : {};
    if (!DRY_RUN) {
      const emps = await prisma.corporateEmployee.findMany({ select: { id: true, email: true } });
      for (const e of emps) empByEmail[e.email] = e.id;
    }

    // Build a map from meal_code → meal_recipe_id
    const mealByCode = {};
    if (!DRY_RUN) {
      const meals = await prisma.mealRecipe.findMany({ select: { id: true, meal_code: true } });
      for (const m of meals) if (m.meal_code) mealByCode[m.meal_code] = m.id;
    }

    // Group rows by OrderID
    const orderGroups = new Map();
    for (const row of rows) {
      const orderId = s(row['OrderID']);
      if (!orderId) continue;
      if (!orderGroups.has(orderId)) orderGroups.set(orderId, []);
      orderGroups.get(orderId).push(row);
    }

    console.log(`    Unique orders: ${orderGroups.size}`);

    const VALID_STATUSES = ['pending','confirmed','delivered','cancelled','refunded'];

    for (const [orderCode, lines] of orderGroups) {
      const first = lines[0];
      const companyId   = s(first['CompanyID']);
      const employeeEmail = normalizeEmail(first['EmployeeEmail']);
      const employeeId  = empByEmail[employeeEmail] ?? null;
      const deliveryDate = parseDate(first['DeliveryDate']);

      const rawStatus = (s(first['Status']) ?? 'pending').toLowerCase();
      const status = VALID_STATUSES.includes(rawStatus) ? rawStatus : 'pending';

      // Total costs across all line items
      let total_employee = 0, total_company = 0, total_bd = 0;
      for (const l of lines) {
        total_employee += n(l['EmployeePrice']);
        total_company  += n(l['CompanyCoverage']);
        total_bd       += n(l['BDCoverage']);
      }
      const total_amount = total_employee + total_company + total_bd;

      console.log(`    ✓ Order ${orderCode}: ${lines.length} item(s), $${total_amount.toFixed(2)}`);

      if (!DRY_RUN) {
        const orderUpdateData = {
          delivery_date: deliveryDate,
          status,
          total_amount,
          employee_cost: total_employee,
          company_cost:  total_company,
          bd_cost:       total_bd,
        };

        const order = await prisma.corporateOrder.upsert({
          where:  { order_code: orderCode },
          update: orderUpdateData,
          create: {
            order_code: orderCode,
            source:     'import',
            ...orderUpdateData,
            company:    { connect: { id: companyId } },
            ...(employeeId ? { employee: { connect: { id: employeeId } } } : {}),
          },
        });

        // Upsert line items (delete old, re-insert)
        await prisma.corporateOrderItem.deleteMany({ where: { order_id: order.id } });

        for (const l of lines) {
          const mealExtId  = s(l['MealID']);                          // "#509"
          const mealCode   = externalMealIdToCode(mealExtId);         // "BD-509"
          const mealRecipeId = mealCode ? mealByCode[mealCode] ?? null : null;

          const rawTier = (s(l['Tier']) ?? 'free').toLowerCase();
          const tier = ['free','tier1','tier2','tier3'].includes(rawTier) ? rawTier : 'free';

          const unitPrice   = n(l['EmployeePrice']);
          const empSubsidy  = 0;                    // employee pays unitPrice
          const compSubsidy = n(l['CompanyCoverage']);
          const bdSubsidy   = n(l['BDCoverage']);
          const lineTotal   = unitPrice;

          await prisma.corporateOrderItem.create({
            data: {
              order:            { connect: { id: order.id } },
              ...(mealRecipeId ? { meal_recipe: { connect: { id: mealRecipeId } } } : {}),
              meal_external_id: mealExtId,
              meal_name:        s(l['DishName']) ?? '',
              quantity:         1,
              tier,
              unit_price:       unitPrice,
              employee_subsidy: empSubsidy,
              company_subsidy:  compSubsidy,
              bd_subsidy:       bdSubsidy,
              line_total:       lineTotal,
            },
          });
        }
      }
    }
  }

  // ── 8. CreditNotes — empty sheet, nothing to import ───────────────────────
  // ── 9. MonthlyStatements — empty sheet, nothing to import ─────────────────
  // ── 10. MagicTokens — all tokens are expired; skip historical import ───────
  //    (New tokens will be generated fresh by the NestJS auth module)

  console.log('\n✅  Migration complete.\n');
}

main()
  .catch(e => { console.error('❌  Migration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
