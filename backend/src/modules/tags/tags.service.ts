import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.systemTag.findMany({
      include: { connections_from: { include: { to_tag: true } } },
      orderBy: [{ type: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
    });
  }

  create(data: { name: string; type: string; subtype?: string; source?: string; visible?: boolean; label_bold?: boolean; rule?: string; emoji?: string }) {
    return this.prisma.systemTag.create({ data });
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
      { name: 'Entree', type: 'menu-cats', subtype: 'Category', source: 'dish', visible: true },
      { name: 'Breakfast', type: 'menu-cats', subtype: 'Category', source: 'dish', visible: true },
      { name: 'Snack', type: 'menu-cats', subtype: 'Category', source: 'dish', visible: true },
      { name: 'Protein Pack', type: 'menu-cats', subtype: 'Category', source: 'dish', visible: true },
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

    await this.prisma.systemTag.createMany({ data: tags });
    return { message: 'Seeded', count: tags.length };
  }
}
