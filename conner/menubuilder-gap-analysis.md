# BetterDay Menu Builder — Gap Analysis
## Prototype Logic vs. Finalized Culinary App
_Feed to a new chat session to drive concrete implementation work._

---

## Quick Context

**HTML Prototype** — `/Users/us/betterday-app/templates/menubuilder-chef.html`  
Single-file 120KB HTML/JS app connected to GAS/Google Sheets. Contains all designed logic.

**Finalized App** — `/Users/us/Downloads/culinary-ops/`  
Next.js 14 frontend + NestJS backend + PostgreSQL/Prisma. Deployed to Vercel (frontend) + Railway (backend).  
Key menu builder file: `frontend/app/(dashboard)/menu-builder/page.tsx` (1160 lines)

---

## What's Working Fine (No Action Needed)

| Feature | Prototype | Culinary App | Notes |
|---------|-----------|-------------|-------|
| Menu rotation queues | ✅ | ✅ `MenuQueueItem` model + `advanceQueue()` | |
| 12 fixed columns | ✅ | ✅ meat_1–5, omni_1–6, vegan_1 | |
| Scorecard (protein/allergen/starch counts) | ✅ | ✅ Implemented in menu-builder/page.tsx | |
| Portion score heatmap | ✅ | ✅ Green heatmap on scorecard | |
| Swap engine (3 passes) | ✅ | ✅ Direct/cross/orphan matching | |
| Omni/plant diet toggles | ✅ | ✅ `dietToggles` state per meal | |
| Frequency tracking | ✅ | ✅ `freqCount`, `freqOccurrence` maps | |
| Meal linking (meat↔plant) | ✅ | ✅ `linked_meal_id` self-join on MealRecipe | |
| Cost engine | N/A | ✅ Recursive sub-recipe cost calc | |
| Production plans | N/A | ✅ Full weekly planning module | |
| Kitchen logging | N/A | ✅ Per sub-recipe, approvals, shortage | |

---

## GAPS — Things Designed in Prototype NOT in Culinary App

### GAP 1: Consecutive Duplicate Visual Grouping
**What prototype has:**
- Detects vertically stacked identical dishes (same meal, adjacent weeks, same column)
- CSS classes `dup-first`, `dup-mid`, `dup-last` on the cell
- Purple background (#c8b8f0) visually groups them
- Consecutive group cells are EXCLUDED from frequency badge display

**What's in culinary app:**
- Frequency tracking exists but no consecutive duplicate detection
- No `dup-first/mid/last` grouping logic

**Where to add it:**  
`frontend/app/(dashboard)/menu-builder/page.tsx` — in the grid rendering loop where cells are built.

**Logic to port:**
```js
const prevId = r > 0 ? col_array[r - 1] : null;
const nextId = col_array[r + 1] || null;
const sameAsPrev = dishId && prevId === dishId;
const sameAsNext = dishId && nextId === dishId;

let cellDup = '';
if (sameAsPrev && sameAsNext) cellDup = 'dup-mid';
else if (sameAsPrev)           cellDup = 'dup-last';
else if (sameAsNext)           cellDup = 'dup-first';

const isInConsecutiveGroup = cellDup !== '';
// Only show freq badge if NOT in a consecutive group
```

---

### GAP 2: Frequency Badge on Cards
**What prototype has:**
- Gold sidebar badge on the RIGHT edge of any card that appears 2+ times in the grid
- Shows `#` label + occurrence number (1, 2, 3...)
- Badge is EXCLUDED for cells in a consecutive duplicate group
- Card background changes to navy when freq ≥ 2

**What's in culinary app:**
- `freqCount` and `freqOccurrence` maps are computed — data is there
- No visual badge rendered on cards (data computed but not displayed)

**Where to add it:**  
`frontend/app/(dashboard)/menu-builder/page.tsx` — meal card rendering section.

**Logic to port:**
```js
// freqCount[mealId] >= 2 AND not in consecutive group → show badge
// freqOccurrence["colId|rowIndex"] → nth occurrence number to show
```

---

### GAP 3: OMNI_PAIRS is One-Directional — Verify Implementation

**Critical design rule from prototype:**
- `OMNI_PAIRS` maps meat → plant only
- `OMNI_REVERSE` (plant → meat lookup) is built at runtime for DISPLAY only, never drives swap engine
- Bidirectional pairing causes ambiguity in swap (which side is primary?)

**In culinary app:**
- `linked_meal_id` is the join key — this is a **nullable self-referencing FK on MealRecipe**
- The pairing can technically be set in either direction (no DB constraint enforces meat-is-primary)
- Swap engine uses `meal.linked_meal_id` to find the plant pair — **verify this is always queried from the meat dish side**

**Check in:**  
`backend/src/modules/menu-queue/menu-queue.service.ts` — does `getQueue()` resolve `linked_meal_id` consistently from the meat dish?  
`frontend/app/(dashboard)/menu-builder/page.tsx` — does the swap engine query `linked_meal_id` only from the primary (meat) dish?

**Risk:** If admin accidentally links plant→meat instead of meat→plant in the UI, the swap engine may miscount or double-count.

---

### GAP 4: Swap Engine — Separate Meat/Plant Lanes
**What prototype has:**
- Swap engine extracts SKUs per week as flat list of `{sku, diet:'meat'|'plant', colId}`
- For omni dishes: emits BOTH meat SKU and plant SKU as separate entries
- Cross-column pass matches meat-only to meat-only, plant-only to plant-only
- **No cross-diet matching** (a meat SKU never matches to a plant SKU)

**Verify in culinary app (`menu-builder/page.tsx` lines 285–331):**
- Does `computeSwaps()` split the diet lane before cross-column matching?
- For an omni dish, does it emit two separate swap entries (meat + plant)?
- When `meatOff` toggle is active, does it suppress the meat entry from the swap list?
- When `plantOff` toggle is active, does it suppress the plant entry?

**If not:** A meal listed as omni could incorrectly swap its meat SKU against a plant SKU.

---

### GAP 5: Scorecard Meat/Plant Deduplication
**What prototype has:**
```js
const countedMeat = new Set();
const countedPlant = new Set();
// For omni dish: meat side counted once in mt, plant side counted once in pl
// If same meal ID appears in multiple columns: counted only once
```

**Verify in culinary app:**
- Does `computeDnDWeekStats()` (or equivalent) use deduplication sets for `mt` and `pl` counts?
- If the same omni meal appears in two columns, is it counted twice in the meat/plant totals?
- Is the meat toggle (`meatOff`) respected so a disabled side isn't added to `mt`?

**Where to check:** `frontend/app/(dashboard)/menu-builder/page.tsx` — week stats calculation.

---

### GAP 6: Peanut Allergen is NAME-BASED
**What prototype has:**
```js
if (name.includes('peanut') || name.includes('satay')) s.peanut++;
```
Peanut is NOT a flag in DISH_ATTRS — it's detected from the dish name string.

**In culinary app:**
- `allergen_tags[]` is a free-form array on MealRecipe
- Peanut should be a tag in the `allergen_tags[]` array (via SystemTag with type='allergen')
- Scorecard should count meals where `allergen_tags.includes('peanut')` (or similar tag ID)

**Check:** Is there a peanut SystemTag? Does the scorecard query allergen_tags for the peanut count, or does it do name-string matching?

**Location:** `backend/prisma/schema.prisma` → SystemTag model, `frontend/app/(dashboard)/menu-builder/page.tsx` → scorecard stat computation.

---

### GAP 7: Scorecard Min/Max Range Settings (Set Min/Max Panel)
**What prototype has:**
- Per-category Min and Max limits configurable in a "Set Min/Max" dropdown panel on the scorecard header
- All 12 scorecard keys (6 proteins + 6 allergens/starches) have independent min/max
- Separate "Meat required" and "Plant required" counts per week (defaults: 11 meat, 7 plant)
- When a cell exceeds max or falls below min → solid red override (instead of heatmap)
- When meat/plant count ≠ required → `.mismatch` class (flashing)

**In culinary app:**
- `CELL_MAX` constants exist (hardcoded)
- No user-configurable min/max panel visible in the 1160-line file
- No "required count" stepper for meat/plant

**This is a UI-only feature** — no backend needed. Add to `menu-builder/page.tsx`:
- State: `scRanges = { [key]: { max: null, min: null } }` and `scRequired = { mt: 11, pl: 7 }`
- Panel: Settings dropdown triggered by ⚙ button on scorecard header
- Logic: `isOutOfRange(key, val)` and `isMtPlMismatch(key, val)` override the heatmap color

---

### GAP 8: Swap Override Tab
**What prototype has:**
- Swap modal has 3 tabs: Summary | Debug Trace | Override
- Override tab: dropdown per outgoing SKU to manually reassign which incoming SKU it maps to
- `swapOverrides = {}` — tracked in state
- Manual overrides show as 'manual' status in summary view

**In culinary app:**
- Swap engine exists (lines 285–331) and swap modal likely exists
- Unclear if override tab / manual reassignment is implemented

**Where to check:** `frontend/app/(dashboard)/menu-builder/page.tsx` — look for swap modal HTML and `swapOverrides` state variable.

---

### GAP 9: "omni-missing" State (Orphan Omni Dishes)
**What prototype has:**
- If a dish has `type='Omni'` but NO entry in `OMNI_PAIRS` → renders as `diet = 'omni-missing'`
- Cell shows: `meat side | ⚠ ???` with a click target to open the Pair Modal
- Pair modal lets admin search plant dishes and assign a pairing on the fly (in-memory)

**In culinary app:**
- `linked_meal_id` can be null → this is the equivalent of "omni-missing"
- Does the menu-builder UI show a warning when an omni-type meal has no `linked_meal_id`?
- Is there an inline "assign pair" workflow, or must admin go to the Meals module to set it?

**Check:** `frontend/app/(dashboard)/menu-builder/page.tsx` — meal card rendering for meals where `meal.linked_meal_id === null && meal.dietary_tags.includes('omni')` (or equivalent).

---

### GAP 10: Dish Pool Drawer (Unassigned Meals)
**What prototype has:**
- Slide-in drawer ("View All Meals") listing all dishes NOT currently placed in any column
- Three sections: Meat | Omni | Vegan
- Search by name or ID
- Draggable into grid from pool

**In culinary app:**
- Meals exist in the database (`/meals` endpoint)
- Menu builder pulls from `MenuQueueItem` — but is there a "unplaced meals" pool UI?
- `GET /meals` returns all meals; you'd filter by those not in `MenuQueueItem` for any active week

**Status:** Likely NOT implemented in the menu-builder page. The queue is managed separately via add-item API calls.

---

### GAP 11: Portion Score Defaults
**What prototype has:**
- `ps` (portion score, 0–4) hardcoded in `DISH_ATTRS` per dish ID
- Summed per week for "Portion Score" display

**In culinary app:**
- `portion_score` field exists on `MealRecipe` but is **optional** (nullable)
- Meals without `portion_score` contribute 0 to the weekly total
- This is correct behavior, but someone should audit how many meals are missing `portion_score`

---

## SUMMARY: Priority Gaps

| Priority | Gap | Work Required |
|----------|-----|---------------|
| 🔴 High | GAP 3: One-directional OMNI_PAIRS enforcement | Verify swap engine queries from meat side; add UI guard |
| 🔴 High | GAP 4: Swap engine diet lane separation | Verify meat/plant lanes don't cross-match |
| 🔴 High | GAP 5: Scorecard deduplication sets | Verify mt/pl counting uses dedup Sets |
| 🟡 Medium | GAP 7: Set Min/Max panel | UI-only feature, add to menu-builder page |
| 🟡 Medium | GAP 9: omni-missing warning | Show ⚠ when omni meal has no linked_meal_id |
| 🟡 Medium | GAP 8: Swap override tab | Add manual override dropdown to swap modal |
| 🟢 Low | GAP 1: Consecutive dup grouping | Visual only, add dup-first/mid/last CSS classes |
| 🟢 Low | GAP 2: Frequency badge | Visual only, data already computed |
| 🟢 Low | GAP 6: Peanut allergen | Confirm tag-based (not name-based) in this app |
| 🟢 Low | GAP 10: Dish pool drawer | Nice to have; complex UI |
| 🟢 Low | GAP 11: Portion score audit | Data quality check |

---

## Key File Locations for the Other Chat

```
FRONTEND
/Users/us/Downloads/culinary-ops/frontend/app/(dashboard)/menu-builder/page.tsx
  → 1160 lines
  → Swap engine: lines 285–331
  → Scorecard stats: look for computeWeekStats or equivalent
  → Frequency: look for freqCount, freqOccurrence
  → Diet toggles: look for dietToggles state

/Users/us/Downloads/culinary-ops/frontend/app/lib/api.ts
  → 1100+ lines
  → All API client functions

BACKEND
/Users/us/Downloads/culinary-ops/backend/prisma/schema.prisma
  → 794 lines
  → MealRecipe.linked_meal_id (omni pair join)
  → MenuQueueItem.column_id (12 fixed columns)
  → MealRecipe.allergen_tags[] (peanut, gluten, dairy)
  → MealRecipe.portion_score (optional)

/Users/us/Downloads/culinary-ops/backend/src/modules/menu-queue/menu-queue.service.ts
  → 210 lines
  → getQueue(), advanceQueue(), addItem(), reorderColumn()

/Users/us/Downloads/culinary-ops/backend/src/modules/meals/meals.service.ts
  → Meal CRUD, meal_code generation (BD-NNN)
  → linked_meal_id pairing logic

/Users/us/Downloads/culinary-ops/backend/src/services/cost-engine.service.ts
  → Recursive sub-recipe cost calculation

/Users/us/Downloads/culinary-ops/backend/src/services/production-engine.service.ts
  → Report generation (meals, sub-recipes, ingredients)
```

---

## Reference: Prototype Swap Engine (exact logic to compare against)

```js
// Extract active SKUs for a week-row (respects toggles, pinned cols)
function getWeekActiveSKUs(rowIdx) {
  const skus = [];
  COLUMNS.forEach(col => {
    let dishId = dndGrid[col.id][rowIdx];
    // ... (pinned col handling) ...
    const tog = dndToggles[dishId] || { meatOff: false, plantOff: false };
    const plantId = OMNI_PAIRS[dishId] || null;
    const diet = getDietType(dishId);

    if (diet === 'omni' && plantId) {
      if (!tog.meatOff)  skus.push({ sku: dishId,  diet: 'meat',  colId: col.id });
      if (!tog.plantOff) skus.push({ sku: plantId, diet: 'plant', colId: col.id });
    } else if (diet === 'vegan') {
      skus.push({ sku: dishId, diet: 'plant', colId: col.id });
    } else {
      if (!tog.meatOff) skus.push({ sku: dishId, diet: 'meat', colId: col.id });
    }
  });
  return skus;
}

// 3-pass swap matching
function computeSwaps(fromRow, toRow) {
  const outSKUs = getWeekActiveSKUs(fromRow);
  const inSKUs  = getWeekActiveSKUs(toRow);
  const inClaimed = new Set();
  const outMatched = new Set();
  const swaps = [];

  // Pass 1: Direct (same column + same diet)
  outSKUs.forEach(out => {
    const match = inSKUs.find(ins =>
      ins.colId === out.colId && ins.diet === out.diet && !inClaimed.has(ins.sku)
    );
    if (match) {
      swaps.push({ ...out, inSku: match.sku, status: 'direct' });
      inClaimed.add(match.sku); outMatched.add(out.sku);
    }
  });

  const unmatchedOut = outSKUs.filter(s => !outMatched.has(s.sku));
  const unmatchedIn  = inSKUs.filter(s => !inClaimed.has(s.sku));

  // Pass 2: Cross-column (same diet, any column) — SEPARATE LANES
  ['meat', 'plant'].forEach(diet => {
    const outs = unmatchedOut.filter(s => s.diet === diet);
    const ins  = unmatchedIn.filter(s => s.diet === diet && !inClaimed.has(s.sku));
    for (let i = 0; i < outs.length; i++) {
      if (i < ins.length) {
        swaps.push({ ...outs[i], inSku: ins[i].sku, status: 'cross' });
        inClaimed.add(ins[i].sku); outMatched.add(outs[i].sku);
      } else {
        swaps.push({ ...outs[i], inSku: null, status: 'orphan' });
      }
    }
  });

  return swaps;
}
```

---

## Reference: Prototype Scorecard Stats (exact logic to compare against)

```js
function computeDnDWeekStats(rowIdx) {
  const s = { ch:0,tr:0,bf:0,pk:0,sf:0, da:0,gl:0,peanut:0,
               st_rice:0,st_pasta:0,st_potato:0,st_other:0,
               ps_total:0, total:0, mt:0, pl:0 };
  const countedMeat = new Set();   // dedup meat SKUs
  const countedPlant = new Set();  // dedup plant SKUs

  COLUMNS.forEach(col => {
    let dishId = dndGrid[col.id][rowIdx];
    const tog = dndToggles[dishId] || {};
    const diet = getDietType(dishId);
    const plantId = OMNI_PAIRS[dishId] || null;
    let attrId = dishId;

    if (diet === 'omni' && plantId) {
      if (!tog.meatOff && !countedMeat.has(dishId)) { s.mt++; countedMeat.add(dishId); }
      if (!tog.plantOff && !countedPlant.has(plantId)) { s.pl++; countedPlant.add(plantId); }
      attrId = tog.meatOff ? plantId : dishId;
    } else if (diet === 'vegan') {
      if (!countedPlant.has(dishId)) { s.pl++; countedPlant.add(dishId); }
    } else {
      if (!tog.meatOff && !countedMeat.has(dishId)) { s.mt++; countedMeat.add(dishId); }
    }

    const a = getAttrs(attrId);
    s.total++; s.ps_total += a.ps;
    s.ch += a.ch; s.tr += a.tr; s.bf += a.bf; s.pk += a.pk; s.sf += a.sf;
    s.da += a.da; s.gl += a.gl;
    // Peanut is NAME-BASED in prototype — in culinary app should be allergen_tags
    const name = getDishName(attrId).toLowerCase();
    if (name.includes('peanut') || name.includes('satay')) s.peanut++;
    if (a.st === 'Rice')   s.st_rice++;
    else if (a.st === 'Pasta')  s.st_pasta++;
    else if (a.st === 'Potato') s.st_potato++;
    else if (a.st)              s.st_other++;
  });

  return s;
}
```
