import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CostEngineService {
  constructor(private prisma: PrismaService) {}

  /**
   * Normalizes a quantity from one unit to another for cost calculation.
   * Supports weight (g/gr/grams → Kgs) and volume (ml → L).
   * Count units (pcs/un/ea/each/pieces/portions) pass through as-is.
   */
  private normalizeQuantity(
    quantity: number,
    fromUnit: string,
    toUnit: string,
  ): number {
    const from = (fromUnit ?? '').trim().toLowerCase();
    const to = (toUnit ?? '').trim().toLowerCase();

    if (from === to) return quantity;

    // ── Weight conversions ──────────────────────────────────────────────
    const toGrams = (qty: number, u: string): number | null => {
      switch (u) {
        case 'g': case 'gr': case 'gram': case 'grams': return qty;
        case 'kg': case 'kgs': case 'kilo': case 'kilos': case 'kilogram': case 'kilograms': return qty * 1000;
        case 'lb': case 'lbs': case 'pound': case 'pounds': return qty * 453.592;
        case 'oz': case 'ounce': case 'ounces': return qty * 28.3495;
        default: return null;
      }
    };

    // ── Volume conversions ──────────────────────────────────────────────
    const toMl = (qty: number, u: string): number | null => {
      switch (u) {
        case 'ml': case 'milliliter': case 'milliliters': return qty;
        case 'l': case 'liter': case 'liters': case 'litre': case 'litres': return qty * 1000;
        case 'cup': case 'cups': return qty * 240;
        case 'tbsp': case 'tablespoon': case 'tablespoons': return qty * 15;
        case 'tsp': case 'teaspoon': case 'teaspoons': return qty * 5;
        default: return null;
      }
    };

    const fromGrams = toGrams(quantity, from);
    const toGramsTarget = fromGrams !== null ? toGrams(1, to) : null;
    if (fromGrams !== null && toGramsTarget !== null && toGramsTarget > 0) {
      return fromGrams / toGramsTarget;
    }

    const fromMl = toMl(quantity, from);
    const toMlTarget = fromMl !== null ? toMl(1, to) : null;
    if (fromMl !== null && toMlTarget !== null && toMlTarget > 0) {
      return fromMl / toMlTarget;
    }

    // Count units or unknown — return as-is
    return quantity;
  }

  /**
   * Recursively calculates the cost of a sub-recipe.
   * Handles nested sub-recipes to any depth.
   * Uses a visited set to detect circular references.
   */
  async calculateSubRecipeCost(
    subRecipeId: string,
    visited: Set<string> = new Set(),
  ): Promise<number> {
    if (visited.has(subRecipeId)) {
      console.warn(`Circular reference detected in sub-recipe: ${subRecipeId}`);
      return 0;
    }
    visited.add(subRecipeId);

    const subRecipe = await this.prisma.subRecipe.findUnique({
      where: { id: subRecipeId },
      include: {
        components: {
          include: {
            ingredient: true,
            child_sub_recipe: {
              select: {
                id: true,
                base_yield_weight: true,
                base_yield_unit: true,
              },
            },
          },
        },
      },
    });

    if (!subRecipe) return 0;

    let totalCost = 0;

    for (const component of subRecipe.components) {
      if (component.ingredient) {
        const ingredientCost = this.calculateIngredientCost(
          component.ingredient.cost_per_unit,
          component.ingredient.unit,
          component.ingredient.trim_percentage,
          component.quantity,
          component.unit,
        );
        totalCost += ingredientCost;
      } else if (component.child_sub_recipe_id && component.child_sub_recipe) {
        const childCost = await this.calculateSubRecipeCost(
          component.child_sub_recipe_id,
          new Set(visited),
        );
        // Scale by fraction of child sub-recipe batch used
        const childYieldInCompUnit = this.normalizeQuantity(
          component.child_sub_recipe.base_yield_weight,
          component.child_sub_recipe.base_yield_unit,
          component.unit,
        );
        const fraction = childYieldInCompUnit > 0 ? component.quantity / childYieldInCompUnit : 0;
        totalCost += childCost * fraction;
      }
    }

    return parseFloat(totalCost.toFixed(4));
  }

  /**
   * Calculates the total cost of a meal recipe, including all sub-recipes and ingredients.
   */
  async calculateMealCost(mealId: string): Promise<number> {
    const meal = await this.prisma.mealRecipe.findUnique({
      where: { id: mealId },
      include: {
        components: {
          include: {
            ingredient: true,
            sub_recipe: {
              select: {
                id: true,
                base_yield_weight: true,
                base_yield_unit: true,
              },
            },
          },
        },
      },
    });

    if (!meal) return 0;

    let totalCost = 0;

    for (const component of meal.components) {
      if (component.ingredient) {
        const ingredientCost = this.calculateIngredientCost(
          component.ingredient.cost_per_unit,
          component.ingredient.unit,
          component.ingredient.trim_percentage,
          component.quantity,
          component.unit,
        );
        totalCost += ingredientCost;
      } else if (component.sub_recipe_id && component.sub_recipe) {
        const subRecipeCost = await this.calculateSubRecipeCost(
          component.sub_recipe_id,
        );
        // Scale by fraction of sub-recipe batch used:
        //   e.g. 140 gr out of 37.52 Kgs batch = fraction 0.00373
        //   or   1 un out of 268 un batch = fraction 0.00373
        const batchInCompUnit = this.normalizeQuantity(
          component.sub_recipe.base_yield_weight,
          component.sub_recipe.base_yield_unit,
          component.unit,
        );
        const fraction = batchInCompUnit > 0 ? component.quantity / batchInCompUnit : 0;
        totalCost += subRecipeCost * fraction;
      }
    }

    return parseFloat(totalCost.toFixed(4));
  }

  /**
   * Recalculates costs for all sub-recipes and meals that use a given ingredient.
   * Called when ingredient cost or trim percentage changes.
   */
  async recalculateForIngredient(ingredientId: string): Promise<void> {
    const affectedSubRecipes = await this.prisma.subRecipeComponent.findMany({
      where: { ingredient_id: ingredientId },
      select: { sub_recipe_id: true },
    });

    const subRecipeIds = [
      ...new Set(affectedSubRecipes.map((r) => r.sub_recipe_id)),
    ];

    await this.recalculateSubRecipes(subRecipeIds);

    const affectedMeals = await this.prisma.mealComponent.findMany({
      where: { ingredient_id: ingredientId },
      select: { meal_id: true },
    });

    const mealIds = [...new Set(affectedMeals.map((m) => m.meal_id))];
    await this.recalculateMeals(mealIds);
  }

  /**
   * Recalculates costs for a list of sub-recipes, then propagates up to meals.
   */
  async recalculateSubRecipes(subRecipeIds: string[]): Promise<void> {
    for (const id of subRecipeIds) {
      const cost = await this.calculateSubRecipeCost(id);
      await this.prisma.subRecipe.update({
        where: { id },
        data: { computed_cost: cost },
      });
    }

    const parentComponents = await this.prisma.subRecipeComponent.findMany({
      where: { child_sub_recipe_id: { in: subRecipeIds } },
      select: { sub_recipe_id: true },
    });

    const parentIds = [
      ...new Set(parentComponents.map((p) => p.sub_recipe_id)),
    ].filter((id) => !subRecipeIds.includes(id));

    if (parentIds.length > 0) {
      await this.recalculateSubRecipes(parentIds);
    }

    const mealComponents = await this.prisma.mealComponent.findMany({
      where: { sub_recipe_id: { in: subRecipeIds } },
      select: { meal_id: true },
    });

    const mealIds = [...new Set(mealComponents.map((m) => m.meal_id))];
    if (mealIds.length > 0) {
      await this.recalculateMeals(mealIds);
    }
  }

  async recalculateMeals(mealIds: string[]): Promise<void> {
    for (const id of mealIds) {
      const cost = await this.calculateMealCost(id);
      await this.prisma.mealRecipe.update({
        where: { id },
        data: { computed_cost: cost },
      });
    }
  }

  /**
   * Recalculates ALL sub-recipe and meal costs.
   * Use after bulk ingredient imports or unit fixes.
   */
  async recalculateAll(): Promise<{ subRecipes: number; meals: number }> {
    const allSubRecipes = await this.prisma.subRecipe.findMany({
      select: { id: true },
    });

    for (const { id } of allSubRecipes) {
      const cost = await this.calculateSubRecipeCost(id);
      await this.prisma.subRecipe.update({
        where: { id },
        data: { computed_cost: cost },
      });
    }

    const allMeals = await this.prisma.mealRecipe.findMany({
      select: { id: true },
    });

    for (const { id } of allMeals) {
      const cost = await this.calculateMealCost(id);
      await this.prisma.mealRecipe.update({
        where: { id },
        data: { computed_cost: cost },
      });
    }

    return { subRecipes: allSubRecipes.length, meals: allMeals.length };
  }

  /**
   * Cost of an ingredient accounting for trim loss and unit normalization.
   * Converts component quantity to the ingredient's pricing unit before multiplying.
   *
   * effective_cost = (cost_per_unit / trim_factor) * normalized_quantity
   */
  private calculateIngredientCost(
    costPerUnit: number,
    ingredientUnit: string,
    trimPercentage: number,
    componentQuantity: number,
    componentUnit: string,
  ): number {
    // Normalize component quantity to ingredient's pricing unit
    const normalizedQty = this.normalizeQuantity(
      componentQuantity,
      componentUnit,
      ingredientUnit,
    );

    // Cap trim at 99% to avoid divide-by-zero
    const safeTrim = Math.min(trimPercentage, 99);
    const trimFactor = safeTrim > 0 ? 1 - safeTrim / 100 : 1;

    return (costPerUnit / trimFactor) * normalizedQty;
  }
}
