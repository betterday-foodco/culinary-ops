/**
 * Normalise a string into a URL-safe slug.
 *
 * Used to populate the `slug` column on models that have user-facing URLs
 * (Ingredient, SubRecipe, MealRecipe, SystemTag, CorporateCompany). Guarantees
 * the output contains only lowercase letters, digits, and dashes — safe for
 * path segments, no collision risk with Prisma's @unique constraint.
 *
 * Examples:
 *   slugify("Thai Basil Beef")           → "thai-basil-beef"
 *   slugify("All Hail the Chicken Caesar!") → "all-hail-the-chicken-caesar"
 *   slugify("  Mac & Cheese  ")          → "mac-cheese"
 *   slugify("")                          → "" (caller must handle empty)
 */
export function slugify(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Slugify with a fallback if the input produces an empty slug (e.g. all
 * non-ASCII, or an empty string). Returns `fallback` in that case so callers
 * can safely use the result as a unique key without hitting empty-string
 * duplicate errors.
 */
export function slugifyOr(input: string | null | undefined, fallback: string): string {
  const s = slugify(input);
  return s || fallback;
}
