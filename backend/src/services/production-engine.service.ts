import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface IngredientRequirement {
  id: string;
  internal_name: string;
  display_name: string;
  sku: string;
  category: string;
  supplier_name: string | null;
  location: string | null;
  total_quantity: number;
  unit: string;
  allergen_tags: string[];
}

export interface SubRecipeRequirement {
  id: string;
  name: string;
  sub_recipe_code: string;
  station_tag: string | null;
  production_day: string | null;
  total_quantity: number;
  unit: string;
}

export interface MealRequirement {
  meal_id: string;
  meal_name: string;
  display_name: string;
  total_quantity: number;
}

export interface ProductionReport {
  production_date: string;
  meals: MealRequirement[];
  sub_recipes: SubRecipeRequirement[];
  ingredients: IngredientRequirement[];
  grouped_by_station: Record<string, SubRecipeRequirement[]>;
  grouped_by_day: Record<string, SubRecipeRequirement[]>;
}

@Injectable()
export class ProductionEngineService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate full production report for a given date range.
   */
  async generateProductionReport(
    startDate: Date,
    endDate: Date,
  ): Promise<ProductionReport[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        production_date: { gte: startDate, lte: endDate },
      },
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
                            components: {
                              include: { ingredient: true },
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
      orderBy: { production_date: 'asc' },
    });

    // Group orders by production date
    const ordersByDate = new Map<string, typeof orders>();
    for (const order of orders) {
      const dateKey = order.production_date.toISOString().split('T')[0];
      if (!ordersByDate.has(dateKey)) ordersByDate.set(dateKey, []);
      ordersByDate.get(dateKey)!.push(order);
    }

    const reports: ProductionReport[] = [];

    for (const [dateKey, dateOrders] of ordersByDate) {
      const report = await this.buildDailyReport(dateKey, dateOrders);
      reports.push(report);
    }

    return reports;
  }

  /**
   * Meals report: quantities of each meal needed.
   */
  async getMealsReport(startDate: Date, endDate: Date): Promise<MealRequirement[]> {
    const orders = await this.prisma.order.groupBy({
      by: ['meal_id'],
      where: {
        production_date: { gte: startDate, lte: endDate },
      },
      _sum: { quantity: true },
    });

    const mealIds = orders.map((o) => o.meal_id);
    const meals = await this.prisma.mealRecipe.findMany({
      where: { id: { in: mealIds } },
    });

    const mealMap = new Map<string, typeof meals[number]>(meals.map((m) => [m.id, m]));

    return orders.map((o) => ({
      meal_id: o.meal_id,
      meal_name: mealMap.get(o.meal_id)?.name ?? 'Unknown',
      display_name: mealMap.get(o.meal_id)?.display_name ?? 'Unknown',
      total_quantity: o._sum.quantity ?? 0,
    }));
  }

  /**
   * Sub-recipes report: total quantities of each sub-recipe needed.
   */
  async getSubRecipesReport(
    startDate: Date,
    endDate: Date,
  ): Promise<SubRecipeRequirement[]> {
    const orders = await this.prisma.order.findMany({
      where: { production_date: { gte: startDate, lte: endDate } },
      include: {
        meal: {
          include: {
            components: {
              include: { sub_recipe: true },
            },
          },
        },
      },
    });

    const subRecipeTotals = new Map<
      string,
      { subRecipe: (typeof orders)[0]['meal']['components'][0]['sub_recipe']; total: number; unit: string }
    >();

    for (const order of orders) {
      for (const component of order.meal.components) {
        if (component.sub_recipe) {
          const key = component.sub_recipe_id!;
          const current = subRecipeTotals.get(key);
          const qty = component.quantity * order.quantity;
          if (current) {
            current.total += qty;
          } else {
            subRecipeTotals.set(key, {
              subRecipe: component.sub_recipe,
              total: qty,
              unit: component.unit,
            });
          }
        }
      }
    }

    return Array.from(subRecipeTotals.values()).map(({ subRecipe, total, unit }) => ({
      id: subRecipe!.id,
      name: subRecipe!.name,
      sub_recipe_code: subRecipe!.sub_recipe_code,
      station_tag: subRecipe!.station_tag,
      production_day: subRecipe!.production_day,
      total_quantity: parseFloat(total.toFixed(3)),
      unit,
    }));
  }

  /**
   * Inventory shopping list: all raw ingredients needed.
   */
  async getShoppingList(
    startDate: Date,
    endDate: Date,
  ): Promise<IngredientRequirement[]> {
    const orders = await this.prisma.order.findMany({
      where: { production_date: { gte: startDate, lte: endDate } },
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
    });

    const ingredientTotals = new Map<
      string,
      { ingredient: NonNullable<(typeof orders)[0]['meal']['components'][0]['ingredient']>; total: number; unit: string }
    >();

    for (const order of orders) {
      this.aggregateIngredientsFromMeal(
        order.meal,
        order.quantity,
        ingredientTotals,
      );
    }

    return Array.from(ingredientTotals.values())
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
        allergen_tags: ingredient.allergen_tags,
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async buildDailyReport(
    dateKey: string,
    orders: any[],
  ): Promise<ProductionReport> {
    const meals: MealRequirement[] = [];
    const subRecipeTotals = new Map<string, { sr: any; total: number; unit: string }>();
    const ingredientTotals = new Map<string, { ingredient: any; total: number; unit: string }>();

    for (const order of orders) {
      // Meals
      const existing = meals.find((m) => m.meal_id === order.meal_id);
      if (existing) {
        existing.total_quantity += order.quantity;
      } else {
        meals.push({
          meal_id: order.meal_id,
          meal_name: order.meal.name,
          display_name: order.meal.display_name,
          total_quantity: order.quantity,
        });
      }

      // Sub-recipes
      for (const component of order.meal.components) {
        if (component.sub_recipe) {
          const key = component.sub_recipe_id;
          const qty = component.quantity * order.quantity;
          const curr = subRecipeTotals.get(key);
          if (curr) {
            curr.total += qty;
          } else {
            subRecipeTotals.set(key, { sr: component.sub_recipe, total: qty, unit: component.unit });
          }
        }
      }

      // Ingredients
      this.aggregateIngredientsFromMeal(order.meal, order.quantity, ingredientTotals);
    }

    const sub_recipes: SubRecipeRequirement[] = Array.from(subRecipeTotals.values()).map(
      ({ sr, total, unit }) => ({
        id: sr.id,
        name: sr.name,
        sub_recipe_code: sr.sub_recipe_code,
        station_tag: sr.station_tag,
        production_day: sr.production_day,
        total_quantity: parseFloat(total.toFixed(3)),
        unit,
      }),
    );

    const ingredients: IngredientRequirement[] = Array.from(ingredientTotals.values()).map(
      ({ ingredient, total, unit }) => ({
        id: ingredient.id,
        internal_name: ingredient.internal_name,
        display_name: ingredient.display_name,
        sku: ingredient.sku,
        category: ingredient.category,
        supplier_name: ingredient.supplier_name,
        location: ingredient.location,
        total_quantity: parseFloat(total.toFixed(3)),
        unit,
        allergen_tags: ingredient.allergen_tags,
      }),
    );

    // Group sub-recipes by station
    const grouped_by_station: Record<string, SubRecipeRequirement[]> = {};
    for (const sr of sub_recipes) {
      const key = sr.station_tag ?? 'Unassigned';
      if (!grouped_by_station[key]) grouped_by_station[key] = [];
      grouped_by_station[key].push(sr);
    }

    // Group sub-recipes by production day
    const grouped_by_day: Record<string, SubRecipeRequirement[]> = {};
    for (const sr of sub_recipes) {
      const key = sr.production_day ?? 'Unscheduled';
      if (!grouped_by_day[key]) grouped_by_day[key] = [];
      grouped_by_day[key].push(sr);
    }

    return {
      production_date: dateKey,
      meals,
      sub_recipes,
      ingredients,
      grouped_by_station,
      grouped_by_day,
    };
  }

  private aggregateIngredientsFromMeal(
    meal: any,
    orderQty: number,
    totals: Map<string, { ingredient: any; total: number; unit: string }>,
  ) {
    for (const component of meal.components) {
      if (component.ingredient) {
        this.addIngredient(totals, component.ingredient, component.quantity * orderQty, component.unit);
      } else if (component.sub_recipe) {
        this.aggregateIngredientsFromSubRecipe(
          component.sub_recipe,
          component.quantity * orderQty,
          totals,
        );
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
        this.aggregateIngredientsFromSubRecipe(
          component.child_sub_recipe,
          component.quantity * multiplier,
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
