import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductionPlanDto, UpdateProductionPlanDto } from './dto/production-plan.dto';

@Injectable()
export class ProductionPlansService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.productionPlan.findMany({
      include: {
        items: {
          select: {
            id: true,
            quantity: true,
            meal: { select: { id: true, display_name: true, category: true } },
          },
        },
      },
      orderBy: { week_start: 'desc' },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.productionPlan.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            meal: {
              select: {
                id: true,
                name: true,
                display_name: true,
                category: true,
                allergen_tags: true,
                computed_cost: true,
              },
            },
          },
          orderBy: [{ meal: { category: 'asc' } }],
        },
      },
    });
    if (!plan) throw new NotFoundException('Production plan not found');
    return plan;
  }

  async create(dto: CreateProductionPlanDto) {
    const { items, week_start, ...planData } = dto;

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.productionPlan.create({
        data: {
          ...planData,
          week_start: new Date(week_start),
        },
      });

      if (items?.length) {
        await tx.productionPlanItem.createMany({
          data: items.map((item) => ({
            plan_id: plan.id,
            meal_id: item.meal_id,
            quantity: item.quantity,
          })),
        });
      }

      return plan;
    });
  }

  async update(id: string, dto: UpdateProductionPlanDto) {
    await this.findOne(id);
    const { items, week_start, ...planData } = dto;

    await this.prisma.$transaction(async (tx) => {
      await tx.productionPlan.update({
        where: { id },
        data: {
          ...planData,
          ...(week_start ? { week_start: new Date(week_start) } : {}),
        },
      });

      if (items !== undefined) {
        await tx.productionPlanItem.deleteMany({ where: { plan_id: id } });
        if (items.length) {
          await tx.productionPlanItem.createMany({
            data: items.map((item) => ({
              plan_id: id,
              meal_id: item.meal_id,
              quantity: item.quantity,
            })),
          });
        }
      }
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    // Delete related records that do NOT have onDelete: Cascade
    await this.prisma.kitchenProductionLog.deleteMany({ where: { plan_id: id } });
    await this.prisma.stationRequest.deleteMany({ where: { plan_id: id } });
    return this.prisma.productionPlan.delete({ where: { id } });
  }

  async publishToKitchen(id: string, publish: boolean) {
    await this.findOne(id);
    return this.prisma.productionPlan.update({
      where: { id },
      data: { published_to_kitchen: publish },
    });
  }

  /** Return the production plan whose week_start falls in the current ISO week (Mon–Sun) */
  async getCurrentPlan() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysFromMonday);
    monday.setHours(0, 0, 0, 0);

    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);

    const plan = await this.prisma.productionPlan.findFirst({
      where: { week_start: { gte: monday, lt: nextMonday } },
      include: {
        items: {
          select: {
            id: true,
            quantity: true,
            meal: { select: { id: true, display_name: true, category: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return plan; // may be null if no plan exists for this week
  }

  /** Sub-recipe prep sheet: aggregated sub-recipe quantities, grouped by station */
  async getSubRecipeReport(id: string) {
    const plan = await this.prisma.productionPlan.findUnique({
      where: { id },
      include: {
        items: {
          where: { quantity: { gt: 0 } },
          include: {
            meal: {
              include: {
                components: {
                  include: { sub_recipe: { select: { id: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!plan) throw new NotFoundException('Production plan not found');

    // Pre-load ALL sub-recipes with their full component trees in one query
    const allSubRecipes = await this.prisma.subRecipe.findMany({
      select: {
        id: true, name: true, display_name: true, sub_recipe_code: true,
        station_tag: true, production_day: true, priority: true,
        instructions: true, base_yield_weight: true, base_yield_unit: true,
        components: {
          include: {
            ingredient: { select: { id: true, internal_name: true, display_name: true, sku: true, unit: true } },
            child_sub_recipe: { select: { id: true, name: true, sub_recipe_code: true, station_tag: true, production_day: true, priority: true } },
          },
        },
      },
    });
    const srById = new Map(allSubRecipes.map((sr) => [sr.id, sr]));

    // totals: srId → { subRecipe, total quantity needed, unit, mealBreakdown }
    const totals = new Map<string, { subRecipe: any; total: number; unit: string; mealBreakdown: { meal: string; qty: number }[] }>();

    // Seed totals with direct meal components — normalize everything to GRAMS internally
    for (const item of plan.items) {
      for (const component of item.meal.components) {
        if (!component.sub_recipe?.id) continue;
        const sr = srById.get(component.sub_recipe.id);
        if (!sr) continue;
        // Meal components are per-serving (mostly in 'gr'). Convert to grams then multiply by portions.
        const portionQtyGrams = this.toGrams(component.quantity, component.unit || 'gr') * item.quantity;
        const existing = totals.get(sr.id);
        if (existing) {
          existing.total += portionQtyGrams;
          existing.mealBreakdown.push({ meal: item.meal.display_name, qty: portionQtyGrams });
        } else {
          totals.set(sr.id, { subRecipe: sr, total: portionQtyGrams, unit: 'g', mealBreakdown: [{ meal: item.meal.display_name, qty: portionQtyGrams }] });
        }
      }
    }

    // BFS: recursively expand child sub-recipes — all quantities in GRAMS throughout
    const visited = new Set<string>();
    const queue: { srId: string; qtyNeeded: number }[] = []; // qtyNeeded always in grams

    // Seed queue with children of top-level sub-recipes
    for (const [, { subRecipe, total }] of totals) {
      const yieldBase = this.toGrams(subRecipe.base_yield_weight ?? 1, subRecipe.base_yield_unit ?? 'Kgs');
      const scale = yieldBase > 0 ? total / yieldBase : 1;
      for (const comp of subRecipe.components ?? []) {
        if (comp.child_sub_recipe?.id) {
          // Sub-recipe components use 'Kgs' → convert to grams
          const childGrams = this.toGrams(comp.quantity * scale, comp.unit ?? 'Kgs');
          queue.push({ srId: comp.child_sub_recipe.id, qtyNeeded: childGrams });
        }
      }
      visited.add(subRecipe.id);
    }

    while (queue.length > 0) {
      const { srId, qtyNeeded } = queue.shift()!;
      const sr = srById.get(srId);
      if (!sr) continue;

      const existing = totals.get(srId);
      if (existing) {
        existing.total += qtyNeeded;
      } else {
        totals.set(srId, { subRecipe: sr, total: qtyNeeded, unit: 'g', mealBreakdown: [] });
      }

      if (!visited.has(srId)) {
        visited.add(srId);
        const yieldBase = this.toGrams(sr.base_yield_weight ?? 1, sr.base_yield_unit ?? 'Kgs');
        const scale = yieldBase > 0 ? qtyNeeded / yieldBase : 1;
        for (const comp of sr.components ?? []) {
          if (comp.child_sub_recipe?.id) {
            const childGrams = this.toGrams(comp.quantity * scale, comp.unit ?? 'Kgs');
            queue.push({ srId: comp.child_sub_recipe.id, qtyNeeded: childGrams });
          }
        }
      }
    }

    const rows = Array.from(totals.values()).map(({ subRecipe, total, mealBreakdown }) => {
      // total is in grams — convert to Kgs for display
      const totalGrams = total;
      const yieldInBase = this.toGrams(subRecipe.base_yield_weight ?? 1, subRecipe.base_yield_unit ?? 'Kgs');
      const scale = yieldInBase > 0 ? totalGrams / yieldInBase : 1;
      const baseUnitRaw = subRecipe.base_yield_unit ?? 'Kgs';
      const buLower = baseUnitRaw.toLowerCase().trim();
      const isCountUnit = ['un', 'pcs', 'piece', 'pieces', 'portion', 'portions', 'ea', 'each'].includes(buLower);
      const unit = isCountUnit ? 'un' : 'Kgs';
      const totalKgs = isCountUnit
        ? parseFloat(totalGrams.toFixed(1))
        : parseFloat((totalGrams / 1000).toFixed(3));

      // Build ingredient breakdown scaled to quantity needed
      const ingredients = (subRecipe.components ?? []).map((comp: any) => {
        const scaledQty = parseFloat((comp.quantity * scale).toFixed(3));
        if (comp.ingredient) {
          return { id: comp.ingredient.id, name: comp.ingredient.internal_name, display_name: comp.ingredient.display_name, sku: comp.ingredient.sku, quantity: scaledQty, unit: comp.unit, type: 'ingredient' as const };
        } else if (comp.child_sub_recipe) {
          return {
            id: comp.child_sub_recipe.id,
            name: comp.child_sub_recipe.name,
            display_name: comp.child_sub_recipe.name,
            sku: comp.child_sub_recipe.sub_recipe_code,
            quantity: scaledQty,
            unit: comp.unit,
            type: 'sub_recipe' as const,
            station_tag: comp.child_sub_recipe.station_tag ?? null,
            production_day: comp.child_sub_recipe.production_day ?? null,
            priority: comp.child_sub_recipe.priority ?? null,
          };
        }
        return null;
      }).filter(Boolean);

      return {
        id: subRecipe.id,
        name: subRecipe.name,
        display_name: subRecipe.display_name ?? subRecipe.name,
        sub_recipe_code: subRecipe.sub_recipe_code,
        station_tag: subRecipe.station_tag,
        production_day: subRecipe.production_day,
        priority: subRecipe.priority,
        instructions: subRecipe.instructions,
        base_yield_weight: subRecipe.base_yield_weight,
        base_yield_unit: subRecipe.base_yield_unit,
        total_quantity: totalKgs,
        scale_factor: parseFloat(scale.toFixed(3)),
        unit,
        meal_breakdown: mealBreakdown,
        ingredients,
      };
    });

    // Sort by station then priority
    rows.sort((a, b) => {
      const stationCmp = (a.station_tag ?? 'ZZZ').localeCompare(b.station_tag ?? 'ZZZ');
      if (stationCmp !== 0) return stationCmp;
      return (a.priority ?? 3) - (b.priority ?? 3);
    });

    // Group by station
    const grouped: Record<string, typeof rows> = {};
    for (const row of rows) {
      const key = row.station_tag ?? 'Unassigned';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }

    return { plan_id: id, week_label: plan.week_label, grouped_by_station: grouped, total_sub_recipes: rows.length };
  }

  /** Shopping list: aggregated ingredient quantities, grouped by category */
  async getShoppingList(id: string) {
    const plan = await this.prisma.productionPlan.findUnique({
      where: { id },
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

    const ingredientTotals = new Map<
      string,
      { ingredient: any; total: number; unit: string }
    >();

    for (const item of plan.items) {
      this.aggregateIngredientsFromMeal(item.meal, item.quantity, ingredientTotals);
    }

    const rows = Array.from(ingredientTotals.values())
      .map(({ ingredient, total, unit }) => ({
        id: ingredient.id,
        internal_name: ingredient.internal_name,
        display_name: ingredient.display_name,
        sku: ingredient.sku,
        category: ingredient.category,
        supplier_name: ingredient.supplier_name,
        location: ingredient.location,
        total_quantity: parseFloat(total.toFixed(3)),
        unit,
        cost_per_unit: ingredient.cost_per_unit,
        allergen_tags: ingredient.allergen_tags,
      }))
      .sort((a, b) => {
        const catCmp = a.category.localeCompare(b.category);
        if (catCmp !== 0) return catCmp;
        return a.internal_name.localeCompare(b.internal_name);
      });

    // Group by category
    const grouped: Record<string, typeof rows> = {};
    for (const row of rows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row);
    }

    return {
      plan_id: id,
      week_label: plan.week_label,
      grouped_by_category: grouped,
      total_ingredients: rows.length,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Normalise a quantity to grams (weight) or mL (volume) so that different
   * unit representations (e.g. "150 gr" vs "0.15 Kgs") can be compared.
   * Unitless / count units (un, pcs, …) are returned 1-to-1.
   */
  private toGrams(qty: number, unit: string): number {
    const u = (unit ?? '').toLowerCase().replace(/\s/g, '');
    switch (u) {
      case 'kg':
      case 'kgs':
      case 'kilogram':
      case 'kilograms':
        return qty * 1000;
      case 'oz':
        return qty * 28.3495;
      case 'lb':
      case 'lbs':
      case 'pound':
      case 'pounds':
        return qty * 453.592;
      case 'l':
      case 'liter':
      case 'litre':
      case 'liters':
      case 'litres':
        return qty * 1000; // treat litres as 1 000 mL for volume parity
      default:
        // g, gr, gram, grams, ml, mL, un, pcs, etc. → 1 : 1
        return qty;
    }
  }

  private aggregateIngredientsFromMeal(
    meal: any,
    qty: number,
    totals: Map<string, { ingredient: any; total: number; unit: string }>,
  ) {
    for (const component of meal.components) {
      if (component.ingredient) {
        // Direct meal → ingredient: multiply portion quantity by number of portions
        this.addIngredient(totals, component.ingredient, component.quantity * qty, component.unit);
      } else if (component.sub_recipe) {
        // Meal uses N units/grams of a sub-recipe.  We need a dimensionless scale
        // factor so we can multiply the sub-recipe's own ingredient quantities.
        // e.g. meal needs 150 gr of a sub-recipe that yields 1.5 Kgs → scale = 0.1
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

  /**
   * Walk a sub-recipe's component tree and accumulate ingredient quantities.
   * @param multiplier  dimensionless scale factor (number of batches of this sub-recipe needed)
   */
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
        // component.quantity is "how much of this ingredient per one batch" → scale by multiplier
        this.addIngredient(totals, component.ingredient, component.quantity * multiplier, component.unit);
      } else if (component.child_sub_recipe) {
        // component.quantity is "how much of the child sub-recipe per one batch of this sub-recipe"
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
