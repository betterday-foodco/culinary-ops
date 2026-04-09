# BetterDay Ingredient Tagger

A one-off review tool for backfilling `Ingredient.allergen_tags` in the
culinary-ops Neon database. Joins the current Neon dump with allergen data
extracted from the legacy SPRWT admin UI and lets you review + edit every
ingredient visually before applying changes.

**Built by:** Conner (via Claude Code) on 2026-04-08
**Intended reviewers:** Conner, Gurleen, Darlene

---

## What this fixes

The `Ingredient` table in Neon has an `allergen_tags` ARRAY column that is
**0/302 populated on production** — nobody migrated the allergen data from
SPRWT when the new schema was built. Meanwhile, the legacy SPRWT admin UI
(v1.75.4) has years of accumulated allergen tags for ~80 ingredients, only
available as a 19-page PDF export ("really junkie format" per Conner).

This tool:

1. Loads a pre-joined CSV of all 302 Neon ingredients + 49 SPRWT-only
   ingredients that never made it into Neon
2. Shows you the Neon state side-by-side with the SPRWT PDF extraction
3. Lets you click-to-tag from the 13 canonical SystemTag allergens
4. Captures dislikes too (Spicy, Cilantro, Mushrooms, etc.) for when the
   `Ingredient` schema gets a `dislikes` column
5. Exports your edits as either an updated CSV or a ready-to-run SQL file

## Files

| File | What it is |
|---|---|
| `index.html` | The tool itself — self-contained, no external dependencies |
| `ingredients-review.csv` | 351 rows (302 Neon + 49 SPRWT-only), pre-joined |
| `README.md` | This file |

## Running it

The tool uses `fetch()` to load the CSV, which browsers block from `file://`
URLs for security. You need a local HTTP server.

**Option 1 — Python** (built into macOS):

```sh
cd conner/data-model/tools/ingredient-tagger
python3 -m http.server 8000
```

Then open <http://localhost:8000/index.html>.

**Option 2 — VS Code Live Server extension:** right-click `index.html`,
"Open with Live Server".

**Option 3 — `npx serve .`** from this folder (needs Node).

When you're done, `Ctrl+C` the terminal to stop the server.

## Workflow

1. **Open the page.** You'll see 351 rows in a scrollable list, grouped
   visually by status (color-coded left border):
    - 🔵 **Matched** — SPRWT PDF has a suggestion for this ingredient
    - ⚪ **Needs review** — In Neon, no SPRWT data
    - 🔴 **SPRWT only** — In SPRWT PDF but missing from Neon (Darlene needs
      to migrate these separately — they can't be updated from this tool)
    - 🟡 **Edited** — you've changed the allergen tags (border turns amber)

2. **Filter down.** Use the status dropdown to focus on "Matched" first.
   You can also filter by a specific allergen or search by name/SKU.

3. **Review each matched row.** For each row:
    - Look at the "Currently in Neon" column (should be empty for most)
    - Look at the "Suggested from SPRWT PDF" column (what I extracted from
      the PDF)
    - Click **Accept SPRWT ✓** to copy the suggestion into your final tags,
      OR click the allergen chips manually
    - If you spot a transcription error (I'm reading 19-page screenshots by
      eye, I'll make mistakes), just click the wrong chip to toggle it off
      and click the right ones

4. **Bulk-accept.** Once you've spot-checked ~10 rows and trust the
   transcription, click **Accept visible ✓** at the top to bulk-accept all
   currently-filtered rows in one click.

5. **Tag the rest.** Filter to "Needs review" and click through the ~240
   ingredients without SPRWT data, tagging any that obviously contain an
   allergen (cream → Dairy, bread → Wheat + Gluten, peanut sauce → Peanuts
   + Tree Nuts, etc.). Don't stress about ingredients that are clearly
   allergen-free (salt, water, vinegar, fresh vegetables).

6. **Save your work.** Edits are **auto-saved to localStorage** on every
   click. Refreshing the page keeps your progress.

7. **Export.** When you're done (or want a checkpoint):
    - **💾 Download CSV** — downloads the full dataset with your edits
      merged in. Safe to commit to git, diff against the original, share
      with anyone.
    - **📋 Download SQL** — downloads a `.sql` file with one `UPDATE`
      statement per edited row, wrapped in a `BEGIN; ... COMMIT;`
      transaction. Each statement targets a specific `Ingredient.id`, so
      there's zero risk of touching rows you didn't edit.

8. **Apply the SQL.** Review the generated SQL first. Then either:
    - Paste it into the Neon SQL editor (target branch: `conner-local-dev`
      first, then promote to `production` after review)
    - OR run it via `psql` using the `conner-local-dev` connection string
    - OR ask Conner/Claude Code to run it against Neon through the MCP

## Canonical allergen list

Only these 13 allergens from the `SystemTag` table are tag-able in this
tool:

`Peanuts, Tree Nuts, Eggs, Fish, Shellfish, Crustaceans, Soy, Sesame,
Wheat, Gluten, Mustard, Sulphites, Dairy`

Legacy SPRWT "allergens" that were actually customer preferences or
non-standard classifications (Corn, Hemp, Chickpea, Lentil, Sunflower,
"All Animal Products") are **intentionally excluded** — they're being
retired per Conner.

Protein flags (Beef, Chicken, Pork, Turkey) also don't appear here —
those belong in `protein_types`, not `allergen_tags`, and will be handled
in a separate backfill.

## Dislikes (new column pending)

The tool also captures **dislike tags** (Spicy, Cilantro, Mushrooms,
Eggplant, Pineapple, Olives, Sunflower, Cashew, Beets, Zucchini, Quinoa,
Corn, Lentil, Chickpea, Soy Curls, Onion, Kale, Coconut, Raw Veg) from
the SPRWT PDF, but these are **not written to Neon** by the SQL export.
Why? The `Ingredient` table has no `dislikes` column yet.

The dislikes are preserved in the downloaded CSV. When Gurleen adds a
`dislikes text[]` column to the Ingredient schema, a simple one-liner can
transfer them over:

```sql
-- After adding the column:
ALTER TABLE "Ingredient" ADD COLUMN dislikes text[] DEFAULT ARRAY[]::text[];

-- Apply the captured dislike data (from the latest exported CSV):
UPDATE "Ingredient" SET dislikes = ARRAY['Spicy'] WHERE id = '...';
-- (etc — the tool can regenerate this SQL if we add a downloadDislikeSQL() button)
```

## Known limitations

- **Transcription errors are likely.** The SPRWT data came from me reading
  19 pages of PDF screenshots by eye. Spot-check before bulk-accepting.
- **49 SPRWT-only rows can't be updated.** They're visible at the bottom
  of the list (status: `sprwt_only`) but have no Neon `id`, so the SQL
  export skips them. They need to be migrated to Neon first — separate
  work for Darlene.
- **No autosave to the CSV file.** Only to `localStorage`. If you clear
  your browser data or switch browsers, you lose in-progress edits. Export
  to CSV periodically as a backup.
- **Single-user only.** If two people open the tool on different machines
  and both make edits, there's no merge. Coordinate who's reviewing what
  in advance.

## What's next

1. ✅ Apply the SQL exported from this tool to `conner-local-dev`
2. Test the menu page's allergen filter with real data
3. Promote to `production` branch after review
4. Write the ingredient→meal rollup query so `MealRecipe.allergen_tags`
   auto-populates from the component ingredients (one query, 152 meals,
   done forever — the whole point of the architecture)
5. Add the `dislikes` column to `Ingredient`, apply captured dislikes from
   this tool's CSV
6. Backfill `protein_types` from the SPRWT flagged rows (Beef, Chicken,
   Pork, Turkey — ~27 ingredients)
