import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CostEngineService } from '../../services/cost-engine.service';
import { slugifyOr } from '../../lib/slugify';
import {
  CreateIngredientDto,
  UpdateIngredientDto,
  UpdateStockBulkDto,
} from './dto/ingredient.dto';

@Injectable()
export class IngredientsService {
  constructor(
    private prisma: PrismaService,
    private costEngine: CostEngineService,
  ) {}

  async findAll(category?: string) {
    return this.prisma.ingredient.findMany({
      where: category ? { category } : undefined,
      orderBy: { internal_name: 'asc' },
    });
  }

  async findOne(id: string) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id },
      include: {
        sub_recipe_components: {
          include: { sub_recipe: { select: { id: true, name: true } } },
        },
        meal_components: {
          include: { meal: { select: { id: true, name: true } } },
        },
      },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found');
    return ingredient;
  }

  async create(dto: CreateIngredientDto) {
    const existing = await this.prisma.ingredient.findUnique({
      where: { sku: dto.sku },
    });
    if (existing) throw new ConflictException('SKU already exists');

    // Derive slug from the internal_name with sku as fallback to guarantee uniqueness
    const baseSlug = slugifyOr(dto.internal_name, dto.sku.toLowerCase());
    const slug = await this.uniqueIngredientSlug(baseSlug);

    return this.prisma.ingredient.create({ data: { ...dto, slug } });
  }

  /** Ensure the candidate slug doesn't collide with any existing Ingredient.slug */
  private async uniqueIngredientSlug(base: string): Promise<string> {
    let candidate = base;
    let n = 2;
    while (await this.prisma.ingredient.findUnique({ where: { slug: candidate } })) {
      candidate = `${base}-${n++}`;
    }
    return candidate;
  }

  async update(id: string, dto: UpdateIngredientDto) {
    await this.findOne(id);

    if (dto.sku) {
      const existing = await this.prisma.ingredient.findFirst({
        where: { sku: dto.sku, NOT: { id } },
      });
      if (existing) throw new ConflictException('SKU already in use');
    }

    const updated = await this.prisma.ingredient.update({
      where: { id },
      data: dto,
    });

    // Recalculate costs for all affected sub-recipes and meals
    if (dto.cost_per_unit !== undefined || dto.trim_percentage !== undefined) {
      await this.costEngine.recalculateForIngredient(id);
    }

    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.ingredient.delete({ where: { id } });
  }

  async getCategories() {
    const result = await this.prisma.ingredient.groupBy({
      by: ['category'],
      orderBy: { category: 'asc' },
    });
    return result.map((r) => r.category);
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /** Batch-update on-hand stock for multiple ingredients at once. */
  async updateStockBulk(dto: UpdateStockBulkDto) {
    if (!dto.updates?.length) return { updated: 0 };

    await this.prisma.$transaction(
      dto.updates.map((u) =>
        this.prisma.ingredient.update({
          where: { id: u.id },
          data: { stock: u.stock },
        }),
      ),
    );

    return { updated: dto.updates.length };
  }

  /**
   * Inventory report: takes a production plan ID, loads the shopping list
   * (what ingredients are needed and in what quantity), then merges with each
   * ingredient's current stock and ordering info (base_weight, cost_per_unit).
   *
   * Returns rows grouped by category, plus summary totals.
   */
  async getInventoryReport(planId: string) {
    if (!planId) throw new BadRequestException('plan_id is required');

    // ── 1. Load the production plan items with the full ingredient tree ──────
    const plan = await this.prisma.productionPlan.findUnique({
      where: { id: planId },
      include: {
        items: {
          where: { quantity: { gt: 0 } },
          include: {
            meal: {
              include: {
                components: {
                  include: {
                    ingredient: true,
                    sub_recipe: {
                      include: {
                        components: {
                          include: {
                            ingredient: true,
                            child_sub_recipe: {
                              include: {
                                components: { include: { ingredient: true } },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!plan) throw new NotFoundException('Production plan not found');

    // ── 2. Aggregate ingredient totals (mirrors ProductionPlansService) ──────
    const ingredientTotals = new Map<
      string,
      { ingredient: any; total: number; unit: string }
    >();

    for (const item of plan.items) {
      this.aggregateIngredientsFromMeal(item.meal, item.quantity, ingredientTotals);
    }

    // ── 3. Build inventory rows ───────────────────────────────────────────────
    const rows = Array.from(ingredientTotals.values()).map(
      ({ ingredient, total, unit }) => {
        const need = parseFloat(total.toFixed(3));
        const stock = ingredient.stock ?? 0;
        const to_order = parseFloat(Math.max(0, need - stock).toFixed(3));
        const baseWeight = ingredient.base_weight > 0 ? ingredient.base_weight : 1;
        const cases_to_order =
          to_order > 0 ? Math.ceil(to_order / baseWeight) : 0;
        const case_price = ingredient.cost_per_unit ?? 0;
        const total_cost = parseFloat((cases_to_order * case_price).toFixed(2));
        const total_cost_buffered = parseFloat((total_cost * 1.04).toFixed(2));

        return {
          id: ingredient.id,
          internal_name: ingredient.internal_name,
          display_name: ingredient.display_name,
          sku: ingredient.sku,
          category: ingredient.category,
          supplier_name: ingredient.supplier_name,
          location: ingredient.location,
          unit,
          base_weight: ingredient.base_weight,
          cost_per_unit: ingredient.cost_per_unit,
          stock,
          need,
          to_order,
          cases_to_order,
          case_price,
          total_cost,
          total_cost_buffered,
        };
      },
    );

    // Sort by category then name
    rows.sort((a, b) => {
      const catCmp = a.category.localeCompare(b.category);
      if (catCmp !== 0) return catCmp;
      return a.internal_name.localeCompare(b.internal_name);
    });

    // ── 4. Group by category ─────────────────────────────────────────────────
    const grouped: Record<string, typeof rows> = {};
    for (const row of rows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row);
    }

    const total_cost_all = parseFloat(
      rows.reduce((s, r) => s + r.total_cost, 0).toFixed(2),
    );
    const total_cost_buffered_all = parseFloat(
      rows.reduce((s, r) => s + r.total_cost_buffered, 0).toFixed(2),
    );
    const items_needing_order = rows.filter((r) => r.to_order > 0).length;

    return {
      plan_id: plan.id,
      week_label: plan.week_label,
      grouped_by_category: grouped,
      total_cost_all,
      total_cost_buffered_all,
      items_needing_order,
    };
  }

  // ── Private helpers (mirrors ProductionPlansService) ──────────────────────

  private toGrams(qty: number, unit: string): number {
    const u = (unit ?? '').toLowerCase().replace(/\s/g, '');
    switch (u) {
      case 'kg': case 'kgs': case 'kilogram': case 'kilograms': return qty * 1000;
      case 'oz': return qty * 28.3495;
      case 'lb': case 'lbs': case 'pound': case 'pounds': return qty * 453.592;
      case 'l': case 'liter': case 'litre': case 'liters': case 'litres': return qty * 1000;
      default: return qty;
    }
  }

  private aggregateIngredientsFromMeal(
    meal: any,
    qty: number,
    totals: Map<string, { ingredient: any; total: number; unit: string }>,
  ) {
    for (const component of meal.components) {
      if (component.ingredient) {
        this.addIngredient(totals, component.ingredient, component.quantity * qty, component.unit);
      } else if (component.sub_recipe) {
        const neededInBase = this.toGrams(component.quantity * qty, component.unit);
        const yieldInBase = this.toGrams(
          component.sub_recipe.base_yield_weight ?? 1,
          component.sub_recipe.base_yield_unit ?? 'Kgs',
        );
        const scaleFactor = yieldInBase > 0 ? neededInBase / yieldInBase : neededInBase;
        this.aggregateIngredientsFromSubRecipe(component.sub_recipe, scaleFactor, totals);
      }
    }
  }

  private aggregateIngredientsFromSubRecipe(
    subRecipe: any,
    multiplier: number,
    totals: Map<string, { ingredient: any; total: number; unit: string }>,
    visited: Set<string> = new Set(),
  ) {
    if (visited.has(subRecipe.id)) return;
    visited.add(subRecipe.id);

    for (const component of subRecipe.components ?? []) {
      if (component.ingredient) {
        this.addIngredient(totals, component.ingredient, component.quantity * multiplier, component.unit);
      } else if (component.child_sub_recipe) {
        const childNeededInBase = this.toGrams(component.quantity * multiplier, component.unit);
        const childYieldInBase = this.toGrams(
          component.child_sub_recipe.base_yield_weight ?? 1,
          component.child_sub_recipe.base_yield_unit ?? 'Kgs',
        );
        const childScale = childYieldInBase > 0 ? childNeededInBase / childYieldInBase : childNeededInBase;
        this.aggregateIngredientsFromSubRecipe(
          component.child_sub_recipe,
          childScale,
          totals,
          new Set(visited),
        );
      }
    }
  }

  private addIngredient(
    totals: Map<string, { ingredient: any; total: number; unit: string }>,
    ingredient: any,
    qty: number,
    unit: string,
  ) {
    const curr = totals.get(ingredient.id);
    if (curr) {
      curr.total += qty;
    } else {
      totals.set(ingredient.id, { ingredient, total: qty, unit });
    }
  }
}
