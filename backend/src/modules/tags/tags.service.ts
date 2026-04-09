import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { slugifyOr } from '../../lib/slugify';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.systemTag.findMany({
      include: { connections_from: { include: { to_tag: true } } },
      orderBy: [{ type: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
    });
  }

  findByType(type: string) {
    return this.prisma.systemTag.findMany({
      where: { type },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
  }

  async create(data: { name: string; type: string; subtype?: string; source?: string; visible?: boolean; label_bold?: boolean; rule?: string; emoji?: string }) {
    const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slug = slugify(data.name) || slugify(data.type);
    return this.prisma.systemTag.create({ data: { ...data, slug } });
  }

  update(id: string, data: Partial<{ name: string; visible: boolean; label_bold: boolean; rule: string; subtype: string; source: string }>) {
    return this.prisma.systemTag.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.systemTag.delete({ where: { id } });
  }

  addConnection(fromId: string, toId: string, relationship: string, description?: string) {
    return this.prisma.tagConnection.create({
      data: { from_tag_id: fromId, to_tag_id: toId, relationship, description },
    });
  }

  removeConnection(id: string) {
    return this.prisma.tagConnection.delete({ where: { id } });
  }

  async seed() {
    const count = await this.prisma.systemTag.count();
    if (count > 0) return { message: 'Already seeded', count };

    const tags = [
      // Allergens
      { name: 'Peanuts', type: 'allergens', subtype: 'Allergen', source: 'ingredient', visible: true },
      { name: 'Tree Nuts', type: 'allergens', subtype: 'Allergen', source: 'ingredient', visible: true },
      { name: 'Eggs', type: 'allergens', subtype: 'Allergen', source: 'ingredient', visible: true },
      { name: 'Fish', type: 'allergens', subtype: 'Allergen', source: 'ingredient', visible: true },
      { name: 'Shellfish', type: 'allergens', subtype: 'Allergen', source: 'ingredient', visible: true },
      { name: 'Soy', type: 'allergens', subtype: 'Allergen', source: 'ingredient', visible: true },
      { name: 'Sesame', type: 'allergens', subtype: 'Allergen', source: 'ingredient', visible: true },
      { name: 'Wheat', type: 'allergens', subtype: 'Allergen', source: 'ingredient', visible: true },
      { name: 'Dairy', type: 'allergens', subtype: 'Allergen', source: 'ingredient', visible: true },
      { name: 'Gluten', type: 'allergens', subtype: 'Allergen', source: 'ingredient', visible: true },
      { name: 'Mustard', type: 'allergens', subtype: 'Allergen', source: 'ingredient', visible: true },
      { name: 'Sulphites', type: 'allergens', subtype: 'Allergen', source: 'ingredient', visible: true },
      // Dislikes
      { name: 'Spicy', type: 'allergens', subtype: 'Dislike', source: 'dish', visible: true },
      { name: 'Beef', type: 'allergens', subtype: 'Dislike', source: 'dish', visible: true },
      { name: 'Chicken', type: 'allergens', subtype: 'Dislike', source: 'dish', visible: true },
      { name: 'Pork', type: 'allergens', subtype: 'Dislike', source: 'dish', visible: true },
      { name: 'Mushrooms', type: 'allergens', subtype: 'Dislike', source: 'dish', visible: true },
      { name: 'Onion', type: 'allergens', subtype: 'Dislike', source: 'dish', visible: true },
      { name: 'Kale', type: 'allergens', subtype: 'Dislike', source: 'dish', visible: true },
      { name: 'Coconut', type: 'allergens', subtype: 'Dislike', source: 'dish', visible: true },
      // Proteins
      { name: 'Chicken', type: 'proteins', subtype: 'Protein', source: 'dish', visible: true },
      { name: 'Beef', type: 'proteins', subtype: 'Protein', source: 'dish', visible: true },
      { name: 'Turkey', type: 'proteins', subtype: 'Protein', source: 'dish', visible: true },
      { name: 'Pork', type: 'proteins', subtype: 'Protein', source: 'dish', visible: true },
      { name: 'Seafood', type: 'proteins', subtype: 'Protein', source: 'dish', visible: true },
      { name: 'Plant Protein', type: 'proteins', subtype: 'Protein', source: 'dish', visible: true },
      // Badges
      { name: 'High Protein', type: 'badges', subtype: 'Badge', source: 'computed', visible: true, rule: 'protein >= 35' },
      { name: 'Family Friendly', type: 'badges', subtype: 'Filter', source: 'dish', visible: true },
      { name: 'Freezer Friendly', type: 'badges', subtype: 'Badge', source: 'dish', visible: true },
      { name: 'Gluten Friendly', type: 'badges', subtype: 'Badge', source: 'computed', visible: true, rule: 'no_gluten' },
      { name: 'New Dish', type: 'badges', subtype: 'Badge', source: 'computed', visible: true, rule: 'menu_appearances < 3' },
      { name: 'Spicy', type: 'badges', subtype: 'Badge', source: 'dish', visible: true },
      // Diet Plans
      { name: 'Omnivore Plan', type: 'diets', subtype: 'Plan', source: 'dish', visible: true },
      { name: 'Plant-Based Plan', type: 'diets', subtype: 'Plan', source: 'dish', visible: true },
      // Menu Categories
      { name: 'Meat', type: 'menu-cats', subtype: 'Category', source: 'dish', visible: true, sort_order: 1 },
      { name: 'Plant-Based', type: 'menu-cats', subtype: 'Category', source: 'dish', visible: true, sort_order: 2 },
      { name: 'Entree', type: 'menu-cats', subtype: 'Category', source: 'dish', visible: true, sort_order: 3 },
      { name: 'Breakfast', type: 'menu-cats', subtype: 'Category', source: 'dish', visible: true, sort_order: 4 },
      { name: 'Snack', type: 'menu-cats', subtype: 'Category', source: 'dish', visible: true, sort_order: 5 },
      { name: 'Protein Pack', type: 'menu-cats', subtype: 'Category', source: 'dish', visible: true, sort_order: 6 },
      // Starch Types
      { name: 'Rice', type: 'starches', subtype: 'Starch', source: 'dish', visible: true, sort_order: 1 },
      { name: 'Pasta', type: 'starches', subtype: 'Starch', source: 'dish', visible: true, sort_order: 2 },
      { name: 'Potato', type: 'starches', subtype: 'Starch', source: 'dish', visible: true, sort_order: 3 },
      { name: 'Quinoa', type: 'starches', subtype: 'Starch', source: 'dish', visible: true, sort_order: 4 },
      { name: 'Other', type: 'starches', subtype: 'Starch', source: 'dish', visible: true, sort_order: 5 },
      { name: 'None', type: 'starches', subtype: 'Starch', source: 'dish', visible: true, sort_order: 6 },
      // Ingredient Categories
      { name: 'Proteins', type: 'ingredient-cats', subtype: 'Location', source: 'ingredient', visible: false },
      { name: 'Vegetables', type: 'ingredient-cats', subtype: 'Location', source: 'ingredient', visible: false },
      { name: 'Spices & Seasonings', type: 'ingredient-cats', subtype: 'Location', source: 'ingredient', visible: false },
      { name: 'Dairy & Eggs', type: 'ingredient-cats', subtype: 'Location', source: 'ingredient', visible: false },
      { name: 'Grains & Starches', type: 'ingredient-cats', subtype: 'Location', source: 'ingredient', visible: false },
      { name: 'Sauces & Condiments', type: 'ingredient-cats', subtype: 'Location', source: 'ingredient', visible: false },
      // Suppliers
      { name: 'GFS', type: 'suppliers', subtype: 'Supplier', source: 'ingredient', visible: false },
      { name: 'Sysco', type: 'suppliers', subtype: 'Supplier', source: 'ingredient', visible: false },
      { name: 'Local Farm Co', type: 'suppliers', subtype: 'Supplier', source: 'ingredient', visible: false },
      // Storage
      { name: 'Walk-in Cooler', type: 'storage', subtype: 'Location', source: 'ingredient', visible: false },
      { name: 'Dry Storage', type: 'storage', subtype: 'Location', source: 'ingredient', visible: false },
      { name: 'Freezer', type: 'storage', subtype: 'Location', source: 'ingredient', visible: false },
      { name: 'Prep Station', type: 'storage', subtype: 'Location', source: 'ingredient', visible: false },
    ];

    // Compute a slug per tag, disambiguating collisions within each `type`
    // (since SystemTag.@@unique([type, slug]) is type-scoped).
    const seen = new Map<string, number>();
    const withSlugs = tags.map((t) => {
      const base = slugifyOr(t.name, t.type);
      const key = `${t.type}|${base}`;
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return { ...t, slug: n === 1 ? base : `${base}-${n}` };
    });

    await this.prisma.systemTag.createMany({ data: withSlugs });
    return { message: 'Seeded', count: withSlugs.length };
  }
}
