# BetterDay Menu Builder — Logic Export
_Feed this to a new chat to compare against the finalized Culinary app._

---

## 1. Infrastructure

| Layer | Detail |
|---|---|
| App | Flask on Render |
| Route | `/menubuilder` → `@admin_required` → renders `menubuilder-chef.html` |
| Persistence | Google Apps Script web app on the Buffer Sheet |
| Buffer Sheet ID | `1iI6q2j7fYIcO5Da959RQeOr5BMFunP-VjsIwvNHA8Cg` |
| GAS URL | `https://script.google.com/macros/s/AKfycbxq3luL1drUibsdP5a1atkx6tyfztn6gR90MrFHmKVP_4CKlobYWXmBxI9s4hMM3DgdkA/exec` |
| Git branch | `claude/deploy-menu-builder-jFLvh` |
| File | `/Users/us/betterday-app/templates/menubuilder-chef.html` |

---

## 2. Core Data Structures

### Grid State
```js
window.dndGrid = {};  // colId -> [dishId, dishId, ...]
// HOLE sentinel for drag-over placeholder
const HOLE = '__hole__';
```
Rows = weeks (row 0 = current week starting last Sunday).  
Columns = meal slot types (Signature A/B/C/D, Wildcard Meat, Pasta Omni, etc.).

### Columns
```js
const COLUMNS = [
  {id:'sig-a',  name:'Signature A',    short:'SIG A',    color:'#9f3a38'},
  {id:'sig-b',  name:'Signature B',    short:'SIG B',    color:'#9f3a38'},
  {id:'sig-c',  name:'Signature C',    short:'SIG C',    color:'#9f3a38'},
  {id:'sig-d',  name:'Signature D',    short:'SIG D',    color:'#9f3a38'},
  {id:'wildcard-meat', name:'Wildcard Meat', short:'WILD M',  color:'#9f3a38'},
  {id:'pasta-omni',    name:'Pasta Omni',    short:'PASTA',   color:'#2d5fa6'},
  {id:'curry-omni',    name:'Curry Omni',    short:'CURRY',   color:'#2d5fa6'},
  {id:'comfort-omni',  name:'Comfort Omni',  short:'COMFORT', color:'#2d5fa6'},
  {id:'asian-omni',    name:'Asian Omni',    short:'ASIAN',   color:'#2d5fa6'},
  {id:'powerbowl-omni',name:'Powerbowl Omni',short:'POWER',   color:'#2d5fa6'},
  {id:'grocery-omni',  name:'Grocery Omni',  short:'GROCERY', color:'#2d5fa6'},
  {id:'wildcard-vegan',name:'Wildcard Vegan', short:'VEGAN',  color:'#2d7a4f'},
];
```

### Rotation Queues
Each column has a pre-built ordered queue of dish IDs synced from 8.0 Menu Schedule (anchored to March 15, 2026). The grid is initialized from these queues; row 0 = queue[0], row 1 = queue[1], etc.

```js
// Example queue entries (each {dishId} maps to one week-row)
const queues = {
  'sig-a': [{dishId:'#509'}, {dishId:'#509'}, ...],
  'pasta-omni': [{dishId:'#393'}, {dishId:'#388'}, {dishId:'#533'}, ...],
  // ...
};
function initDnDGrid(){
  COLUMNS.forEach(col=>{
    window.dndGrid[col.id] = (queues[col.id]||[]).map(item=>item.dishId);
  });
}
```

---

## 3. Omni Pair System

### CRITICAL DESIGN DECISION: One-directional only
- `OMNI_PAIRS` maps **meat → plant** only. Meat dish is always the primary key.
- `OMNI_REVERSE` is built at runtime for display lookups only. It NEVER drives scheduling or the swap engine.
- Making it bidirectional causes ambiguity in the swap engine (which side is primary?).

```js
const OMNI_PAIRS = {
  "#556":"#557", "#567":"#569", "#396":"#440", "#463":"#62",  "#545":"#6",
  "#514":"#558", "#466":"#467", "#358":"#486", "#397":"#425", "#533":"#401",
  "#333":"#138", "#542":"#114", "#469":"#468", "#474":"#1",   "#539":"#480",
  "#99":"#473",  "#394":"#86",  "#332":"#183", "#327":"#146", "#284":"#14",
  "#536":"#344", "#535":"#50",  "#391":"#423", "#538":"#252", "#328":"#162",
  "#305":"#454", "#280":"#410", "#457":"#87",  "#354":"#453", "#309":"#180",
  "#498":"#534", "#476":"#411", "#518":"#465", "#520":"#148", "#388":"#55",
  "#549":"#163", "#488":"#487", "#477":"#339", "#407":"#413", "#494":"#493",
  "#353":"#455", "#377":"#230", "#362":"#462", "#550":"#457", "#330":"#422",
  "#478":"#479", "#351":"#452", "#393":"#136", "#464":"#31",  "#414":"#481",
  "#516":"#517", "#381":"#287"
};

// Built at runtime — display/lookup only, never drives logic
const OMNI_REVERSE = {};
Object.entries(OMNI_PAIRS).forEach(([m,p])=>{ OMNI_REVERSE[p] = m; });
```

### Diet type classification
```js
function getDietType(dishId){
  if(OMNI_PAIRS[dishId]) return 'omni';              // has a paired plant dish
  const d = getDish(dishId);
  if(d && d.type==='Omni' && !OMNI_PAIRS[dishId]) return 'omni-missing'; // needs pairing
  if(d && d.diet==='veg') return 'vegan';
  return 'meat';
}
```

### Diet toggle (per dish, per cell)
Each omni dish in a cell has independent meat/plant toggles:
```js
dndToggles[dishId] = { meatOff: false, plantOff: false }
// Constraint: cannot turn off BOTH sides simultaneously
```

---

## 4. Scorecard (Week Stats)

Computed per row (week) by `computeDnDWeekStats(rowIdx)`.

### Stats object
```js
const s = {
  ch:0, tr:0, bf:0, pk:0, sf:0,  // proteins (chicken, turkey, beef, pork, seafood)
  da:0, gl:0, peanut:0,            // allergens
  st_rice:0, st_pasta:0, st_potato:0, st_other:0,  // starches
  ps_total:0,                      // portion score sum
  total:0, mt:0, pl:0              // dish count, meat count, plant count
};
```

### Deduplication rules
- For an **omni** dish: the meat ID contributes to `mt` count and its attrs; the plant ID contributes to `pl` count. Counted once each.
- For **vegan**: contributes to `pl`.
- For **meat-only**: contributes to `mt`.
- `countedMeat` and `countedPlant` Sets prevent double-counting if same dish appears in multiple columns.

### Allergen detection
- `gl`, `da`, `ch`, `tr`, `bf`, `pk`, `sf` — from `DISH_ATTRS[id]` lookup (all 0/1 flags)
- Peanut is name-based: checks if dish name includes "peanut" or "satay"
- Starch is from `DISH_ATTRS[id].st` field: "Rice" | "Pasta" | "Potato" | "Other" | ""

### Range limits
```js
let scRanges = {};   // key -> {max: number|null, min: number|null}
let scRequired = { mt: 11, pl: 7 };  // default required counts per week
```
- Cells turn **solid red** when `val > max` or `val < min`
- Meat/plant cells flash with `.mismatch` class when count ≠ required

### Portion Score (ps)
- Each dish has a `ps` value (0–4) in `DISH_ATTRS`
- Summed across all dishes in the week
- Color: green scale (more = greener, using hsl(142,...))

---

## 5. Frequency Coloring

### Global frequency count (across ALL weeks, ALL columns)
```js
const dishFreqCount = {};  // dishId -> total appearances in grid
COLUMNS.forEach(col=>{
  (window.dndGrid[col.id]||[]).forEach(did=>{
    if(did && did!==HOLE) dishFreqCount[did] = (dishFreqCount[did]||0)+1;
  });
});
```

### Occurrence order (left-to-right, top-to-bottom scan)
```js
const dishOccurrence = {};  // "colId|row" -> nth occurrence (1,2,3...)
const dishRunning = {};
for(let rr=0; rr<numRows; rr++){
  COLUMNS.forEach(col=>{
    const did = dndGrid[col.id][rr];
    if(did && did!==HOLE){
      if(!dishRunning[did]) dishRunning[did]=0;
      dishRunning[did]++;
      dishOccurrence[col.id+'|'+rr] = dishRunning[did];
    }
  });
}
```

### Frequency badge display
- Only shown when `totalFreq >= 2` AND cell is **not** part of a consecutive duplicate group
- Gold sidebar badge on the right edge of the card: shows `#` label + occurrence number
- CSS: `.freq-badge { background:#D4A017; width:26px; position:absolute; right:0; top:0; bottom:0; z-index:4; }`
- Card gets `.freq-card` class → `background: var(--navy) !important; color: white;`

---

## 6. Consecutive Duplicate Detection

Detected vertically within a single column. Same dish in adjacent rows = consecutive group.

```js
const sameAsPrev = dishId && dishId!==HOLE && prevId===dishId;
const sameAsNext = dishId && dishId!==HOLE && nextId===dishId;

let cellDup = '';
if(sameAsPrev && sameAsNext) cellDup = ' dup-mid';
else if(sameAsPrev)           cellDup = ' dup-last';
else if(sameAsNext)           cellDup = ' dup-first';
```

CSS classes applied to the **cell** (`.dnd-col-cell`):
```css
.dnd-col-cell.dup-first .dnd-card { background: #c8b8f0 !important; }
.dnd-col-cell.dup-mid   .dnd-card { background: #c8b8f0 !important; }
.dnd-col-cell.dup-last  .dnd-card { background: #c8b8f0 !important; }
```
Note: cells in a consecutive group are **excluded from frequency badge logic** (`isInConsecutiveGroup = cellDup !== ''`).

---

## 7. Swap Engine

Compares week N-1 ("outgoing") to week N ("incoming"). Runs on demand via "Swaps" button in scorecard row.

### Step 1: Extract active SKUs per week
`getWeekActiveSKUs(rowIdx)` returns flat list of `{sku, diet, colId, name}`:
- Omni dish: emits meat SKU (diet='meat') and plant SKU (diet='plant') separately
- Vegan dish: emits as diet='plant'
- Meat-only: emits as diet='meat'
- Respects `dndToggles` (skips toggled-off sides)
- Respects pinned columns

### Step 2: Three-pass matching (`computeSwaps(fromRow, toRow)`)

**Pass 1 — Direct column match:**  
Same `colId` + same `diet` → direct swap. Best case.

**Pass 2 — Cross-column match (by diet lane):**  
Unmatched meat SKUs from outgoing match to unmatched meat SKUs from incoming (order-based, ignoring column). Same for plant lane. Separate lanes — meat never matches plant.

**Pass 3 — Orphan:**  
Outgoing SKU with no incoming match of same diet = orphan (needs manual handling).

```js
// Swap result statuses: 'direct' | 'cross' | 'orphan' | 'manual'
```

### Override
User can manually reassign any outgoing SKU to a different incoming SKU via dropdown in the Override tab. Manual overrides are tracked in `swapOverrides = {}`.

---

## 8. Pair Modal

When a dish with `type='Omni'` is placed but has no entry in `OMNI_PAIRS`, it shows:
```
meat side | ⚠ ???   (click ??? to open pair modal)
```
The pair modal lets you search all plant dishes and assign a pairing → writes to `OMNI_PAIRS` and `OMNI_REVERSE` in memory (not persisted to GAS).

---

## 9. Pin System

A column can be "pinned" (∞ button) if it has ≤1 dish. Pinned columns repeat row 0's dish in every week row — useful for recurring weekly items. Pinned dishes are excluded from frequency/duplicate logic.

---

## 10. Save / Load (Google Apps Script)

### Save payload (POST to GAS)
```js
{
  action: 'save_menu_state',
  grid: JSON.stringify(window.dndGrid),       // colId -> [dishId...]
  columns: JSON.stringify(COLUMNS),           // column metadata
  queues: JSON.stringify(queues),             // original rotation queues
  dishNames: JSON.stringify(nameMap)          // dishId -> name (for sheet readability)
}
```
GAS writes a human-readable sheet with dish name + ID per cell, rows = weeks, columns = meal slots → copy-paste ready for 8.0 Menu Schedule.

### Load (GET from GAS)
```js
fetch(GAS_URL + '?action=load_menu_state')
// Returns: { success, found, grid, columns, timestamp }
// Restores window.dndGrid and COLUMNS from saved JSON
// Auto-runs on page load
```

### GAS actions
- `doPost`: handles `save_menu_state`
- `doGet`: handles `load_menu_state`

---

## 11. Column Management

- **Lock/Unlock toggle** (🔓/🔒): columns are locked by default; must unlock to rename, reorder, add, delete, or change color
- **Rename**: inline input on header cell when unlocked
- **Reorder**: drag-and-drop column headers when unlocked (modifies `COLUMNS` array order)
- **Delete**: `deleteCol(colId)` — confirms if column has dishes; returns dishes to pool
- **Add**: appends new column with `id:'col-'+Date.now()`
- **Color picker**: 6-color palette popup, changes `col.color` which drives header background
- **Auto-lock**: 15 seconds after unlocking, or after any rename/reorder/color action

---

## 12. Dish Pool Drawer

Slide-in drawer ("View All Meals") shows all unplaced dishes in three columns: Meat | Omni | Vegan.
- Draggable from pool into any grid cell
- Search filter by name or ID
- Pool counts update live as dishes are placed/removed

---

## 13. Undo/Redo

Snapshot-based: `dndSnapshot` captures `JSON.stringify(window.dndGrid)` before each drag.  
On drag cancel (dragend without a successful drop), snapshot is restored.  
Full undo/redo stack was discussed but not implemented — only single-level rollback on drag cancel.

---

## 14. Key CSS Classes Reference

| Class | Meaning |
|---|---|
| `.dnd-col-cell.dup-first` | Start of a consecutive duplicate run |
| `.dnd-col-cell.dup-mid` | Middle of a consecutive duplicate run |
| `.dnd-col-cell.dup-last` | End of a consecutive duplicate run |
| `.dnd-card.freq-card` | Dish appearing 2nd+ time (navy bg, white text) |
| `.freq-badge` | Gold sidebar on freq card showing occurrence # |
| `.gluten-card` | Gluten-flag dishes get a distinct border color |
| `.pinned-card` | Dish is from a pinned column (not draggable) |
| `.dnd-hole` | Placeholder cell during drag-over |
| `.sc-tile` | Individual scorecard stat tile |
| `.sc-diet-tile.meat-count` | Meat count tile |
| `.sc-diet-tile.plant-count` | Plant count tile |
| `.mismatch` | Meat/plant count doesn't match required value |

---

## 15. Things to Verify in Finalized Culinary App

Check that the finalized app implements ALL of these correctly:

- [ ] **OMNI_PAIRS is one-directional** (meat→plant keys only, never plant→meat)
- [ ] **OMNI_REVERSE is display-only**, never drives swap engine or scheduling
- [ ] **Swap engine has 3 passes**: direct → cross-column → orphan
- [ ] **Swap engine separates meat/plant lanes** — no cross-diet matching
- [ ] **Frequency count is global** (all weeks × all columns), not per-column
- [ ] **Consecutive duplicate cells are excluded from frequency badge**
- [ ] **Frequency occurrence # is left-to-right, top-to-bottom** (not per-column order)
- [ ] **Scorecard deduplicates meat/plant** (countedMeat/countedPlant Sets)
- [ ] **Peanut allergen is name-based** (includes "peanut" or "satay"), not a flag in DISH_ATTRS
- [ ] **Portion score is summed across week** (not averaged)
- [ ] **Pinned columns repeat row 0** in all week-rows; excluded from freq/dup logic
- [ ] **Both sides of omni dish can be toggled off independently**, but not simultaneously
- [ ] **Save writes dishNames** (name lookup map) alongside grid JSON for sheet readability
- [ ] **Load auto-triggers on page load** (not just on button press)
- [ ] **COLUMNS metadata (color, short name) is saved and restored** alongside grid
- [ ] **Pair modal writes to in-memory OMNI_PAIRS only** (not persisted to GAS)
- [ ] **Column lock auto-expires after 15s** of inactivity
- [ ] **Swap override tab** allows manual SKU reassignment per outgoing SKU

---

## 16. Known Gaps / Incomplete Features (as of this conversation)

- **Card merge bridge visual**: Consecutive duplicate cells get purple bg (#c8b8f0) but the "bridge" that visually connects them across the cell border was never cleanly implemented. JS overlay approach caused re-render loops.
- **Undo stack**: Only single-step rollback (drag cancel). No multi-step undo/redo history.
- **Pair modal persistence**: Pair assignments are in-memory only; lost on reload unless save is triggered.
- **Rotation queue auto-advance**: Queues are manually synced from 8.0 Menu Schedule. No automatic weekly advance logic.
- **Production file state**: `menubuilder.html` and `menubuilder-chef.html` are currently identical (both have Bre demo rainbow styling). Production version needs Bre content stripped.
- **Dish info page**: Referenced in conversation but no HTML file found in repo or Downloads.
