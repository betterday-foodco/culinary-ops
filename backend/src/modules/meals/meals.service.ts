import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CostEngineService } from '../../services/cost-engine.service';
import { slugifyOr } from '../../lib/slugify';
import { CreateMealDto, UpdateMealDto, AddMealComponentDto, UpdateMealComponentDto } from './dto/meal.dto';

@Injectable()
export class MealsService {
  constructor(
    private prisma: PrismaService,
    private costEngine: CostEngineService,
  ) {}

  async findAll(search?: string) {
    return this.prisma.mealRecipe.findMany({
      where: search ? {
        OR: [
          { display_name: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { meal_code: { contains: search, mode: 'insensitive' } },
        ],
      } : undefined,
      include: {
        linked_meal: { select: { id: true, display_name: true, meal_code: true } },
        components: {
          include: {
            ingredient: { select: { id: true, internal_name: true, sku: true } },
            sub_recipe: { select: { id: true, name: true, sub_recipe_code: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const meal = await this.prisma.mealRecipe.findUnique({
      where: { id },
      include: {
        linked_meal: { select: { id: true, name: true, display_name: true, category: true, meal_code: true } },
        variant_meals: { select: { id: true, name: true, display_name: true, category: true, meal_code: true } },
        components: {
          include: {
            ingredient: true,
            sub_recipe: {
              include: {
                components: {
                  include: { ingredient: true },
                },
              },
            },
          },
        },
        orders: {
          orderBy: { production_date: 'desc' },
          take: 10,
        },
      },
    });
    if (!meal) throw new NotFoundException('Meal not found');
    return meal;
  }

  /** Ensure the candidate slug doesn't collide with any existing MealRecipe.slug */
  private async uniqueMealSlug(tx: any, base: string): Promise<string> {
    let candidate = base;
    let n = 2;
    while (await tx.mealRecipe.findUnique({ where: { slug: candidate } })) {
      candidate = `${base}-${n++}`;
    }
    return candidate;
  }

  private async generateMealCode(tx: any): Promise<string> {
    // Fetch all BD-xxx codes and find the true numeric max (avoids string-sort bug)
    const rows = await tx.mealRecipe.findMany({
      where: { meal_code: { not: null } },
      select: { meal_code: true },
    });
    let max = 0;
    for (const r of rows) {
      const num = parseInt((r.meal_code as string).replace('BD-', ''), 10);
      if (!isNaN(num) && num > max) max = num;
    }
    return `BD-${String(max + 1).padStart(3, '0')}`;
  }

  async create(dto: CreateMealDto) {
    this.validateComponents(dto.components ?? []);

    // diet_plan_id is mandatory — every dish must belong to a diet plan
    // (Omnivore or Plant-Based). See ADR 2026-04-08. Enforced at the DB
    // level with NOT NULL, but we validate here to give a clearer error.
    if (!dto.diet_plan_id) {
      throw new BadRequestException(
        'diet_plan_id is required — every dish must be classified as Omnivore or Plant-Based',
      );
    }

    // display_name is the only customer-facing name that matters. The legacy
    // `name` column (used in the old SPRWT system for sorting workarounds) is
    // still NOT NULL at the DB level but no longer required in the UI — if the
    // caller doesn't provide it, mirror display_name so the constraint is
    // satisfied silently. Admins can override it via the "Advanced / Admin"
    // disclosure on the edit page for fringe cases.
    const internalName = (dto.name && dto.name.trim()) || dto.display_name;

    const { components, ...mealData } = dto;
    // TypeScript narrows diet_plan_id to `string` after the guard above.
    const mealDataWithDiet = {
      ...mealData,
      name: internalName,
      diet_plan_id: dto.diet_plan_id,
    };

    // Retry up to 5 times on meal_code collision (race condition guard)
    let meal: any;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        meal = await this.prisma.$transaction(async (tx) => {
          const meal_code = await this.generateMealCode(tx);
          // Derive slug from display_name with meal_code as fallback
          const slug = await this.uniqueMealSlug(
            tx,
            slugifyOr(mealData.display_name, meal_code.toLowerCase()),
          );
          const created = await tx.mealRecipe.create({ data: { ...mealDataWithDiet, meal_code, slug } });

          if (components?.length) {
            await tx.mealComponent.createMany({
              data: components.map((c) => ({
                meal_id: created.id,
                ingredient_id: c.ingredient_id ?? null,
                sub_recipe_id: c.sub_recipe_id ?? null,
                quantity: c.quantity,
                unit: c.unit,
              })),
            });
          }

          return created;
        });
        break; // success — exit retry loop
      } catch (e: any) {
        // P2002 = unique constraint violation; retry with next code
        if (e?.code === 'P2002' && e?.meta?.target?.includes('meal_code') && attempt < 4) {
          continue;
        }
        throw e;
      }
    }

    const cost = await this.costEngine.calculateMealCost(meal.id);
    await this.prisma.mealRecipe.update({
      where: { id: meal.id },
      data: { computed_cost: cost },
    });

    return this.findOne(meal.id);
  }

  async backfillMealCodes(): Promise<{ updated: number }> {
    const meals = await this.prisma.mealRecipe.findMany({
      where: { meal_code: null },
      orderBy: { created_at: 'asc' },
      select: { id: true },
    });

    // Find highest existing code to continue from
    const last = await this.prisma.mealRecipe.findFirst({
      where: { meal_code: { not: null } },
      orderBy: { meal_code: 'desc' },
      select: { meal_code: true },
    });
    let counter = 1;
    if (last?.meal_code) {
      const num = parseInt(last.meal_code.replace('BD-', ''), 10);
      if (!isNaN(num)) counter = num + 1;
    }

    for (const meal of meals) {
      await this.prisma.mealRecipe.update({
        where: { id: meal.id },
        data: { meal_code: `BD-${String(counter).padStart(3, '0')}` },
      });
      counter++;
    }

    return { updated: meals.length };
  }

  async update(id: string, dto: UpdateMealDto) {
    await this.findOne(id);

    if (dto.components !== undefined) {
      this.validateComponents(dto.components ?? []);
    }

    const { components, ...mealData } = dto;

    await this.prisma.$transaction(async (tx) => {
      await tx.mealRecipe.update({ where: { id }, data: mealData });

      if (components !== undefined) {
        await tx.mealComponent.deleteMany({ where: { meal_id: id } });
        if (components.length) {
          await tx.mealComponent.createMany({
            data: components.map((c) => ({
              meal_id: id,
              ingredient_id: c.ingredient_id ?? null,
              sub_recipe_id: c.sub_recipe_id ?? null,
              quantity: c.quantity,
              unit: c.unit,
            })),
          });
        }
      }
    });

    const cost = await this.costEngine.calculateMealCost(id);
    await this.prisma.mealRecipe.update({
      where: { id },
      data: { computed_cost: cost },
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.mealRecipe.delete({ where: { id } });
  }

  async updateImageUrl(id: string, imageUrl: string) {
    await this.findOne(id);
    return this.prisma.mealRecipe.update({
      where: { id },
      data: { image_url: imageUrl },
      select: { id: true, image_url: true },
    });
  }

  async getPricing() {
    return this.prisma.mealRecipe.findMany({
      select: {
        id: true,
        name: true,
        display_name: true,
        computed_cost: true,
        pricing_override: true,
        final_yield_weight: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  private validateComponents(
    components: { ingredient_id?: string; sub_recipe_id?: string }[],
  ) {
    for (const c of components) {
      if (!c.ingredient_id && !c.sub_recipe_id) {
        throw new BadRequestException(
          'Each component must have either ingredient_id or sub_recipe_id',
        );
      }
      if (c.ingredient_id && c.sub_recipe_id) {
        throw new BadRequestException(
          'Component cannot have both ingredient_id and sub_recipe_id',
        );
      }
    }
  }

  /** Cooking sheet: all meals with components and instructions */
  async getCookingSheet(category?: string) {
    return this.prisma.mealRecipe.findMany({
      where: {
        is_active: true,
        ...(category ? { category } : {}),
      },
      include: {
        components: {
          include: {
            ingredient: { select: { id: true, internal_name: true, unit: true } },
            sub_recipe: {
              select: {
                id: true, name: true, sub_recipe_code: true,
                station_tag: true, instructions: true,
              },
            },
          },
        },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  /** Add a single component to an existing meal */
  async addComponent(mealId: string, dto: AddMealComponentDto) {
    await this.findOne(mealId);
    if (!dto.ingredient_id && !dto.sub_recipe_id) {
      throw new BadRequestException('Component must have ingredient_id or sub_recipe_id');
    }
    if (dto.ingredient_id && dto.sub_recipe_id) {
      throw new BadRequestException('Component cannot have both ingredient_id and sub_recipe_id');
    }
    const component = await this.prisma.mealComponent.create({
      data: {
        meal_id: mealId,
        ingredient_id: dto.ingredient_id ?? null,
        sub_recipe_id: dto.sub_recipe_id ?? null,
        quantity: dto.quantity,
        unit: dto.unit,
      },
      include: {
        ingredient: { select: { id: true, internal_name: true, sku: true, cost_per_unit: true } },
        sub_recipe: { select: { id: true, name: true, sub_recipe_code: true, station_tag: true, computed_cost: true } },
      },
    });
    const cost = await this.costEngine.calculateMealCost(mealId);
    await this.prisma.mealRecipe.update({ where: { id: mealId }, data: { computed_cost: cost } });
    return component;
  }

  /** Update a component's quantity/unit */
  async updateComponent(mealId: string, componentId: string, dto: UpdateMealComponentDto) {
    const component = await this.prisma.mealComponent.findFirst({
      where: { id: componentId, meal_id: mealId },
    });
    if (!component) throw new NotFoundException('Component not found');
    const updated = await this.prisma.mealComponent.update({
      where: { id: componentId },
      data: dto,
      include: {
        ingredient: { select: { id: true, internal_name: true, sku: true, cost_per_unit: true } },
        sub_recipe: { select: { id: true, name: true, sub_recipe_code: true, station_tag: true, computed_cost: true } },
      },
    });
    const cost = await this.costEngine.calculateMealCost(mealId);
    await this.prisma.mealRecipe.update({ where: { id: mealId }, data: { computed_cost: cost } });
    return updated;
  }

  /** Remove a single component */
  async removeComponent(mealId: string, componentId: string) {
    const component = await this.prisma.mealComponent.findFirst({
      where: { id: componentId, meal_id: mealId },
    });
    if (!component) throw new NotFoundException('Component not found');
    await this.prisma.mealComponent.delete({ where: { id: componentId } });
    const cost = await this.costEngine.calculateMealCost(mealId);
    await this.prisma.mealRecipe.update({ where: { id: mealId }, data: { computed_cost: cost } });
    return { success: true };
  }

  /** Full meal export for corporate ordering platform sync */
  async exportMeals() {
    return this.prisma.mealRecipe.findMany({
      where: { is_active: true },
      select: {
        id: true,
        meal_code: true,
        display_name: true,
        short_description: true,
        category: true,
        pricing_override: true,
        calories: true,
        protein_g: true,
        carbs_g: true,
        fat_g: true,
        fiber_g: true,
        final_yield_weight: true,
        allergen_tags: true,
        dietary_tags: true,
        image_url: true,
        container_type: true,
        portion_score: true,
        computed_cost: true,
        components: {
          select: {
            quantity: true,
            unit: true,
            ingredient: {
              select: { internal_name: true, category: true }
            }
          }
        },
        portion_spec: {
          select: {
            container_type: true,
            total_weight_min: true,
            total_weight_max: true,
            general_notes: true,
            components: {
              select: {
                ingredient_name: true,
                portion_min: true,
                portion_max: true,
                portion_unit: true,
                tool: true,
                notes: true,
                sort_order: true,
              },
              orderBy: { sort_order: 'asc' }
            }
          }
        }
      },
      orderBy: { display_name: 'asc' }
    });
  }

  /** Suggest variant meals by keyword overlap */
  async getSuggestedVariants(mealId: string) {
    const meal = await this.prisma.mealRecipe.findUnique({
      where: { id: mealId },
      select: { id: true, display_name: true, category: true },
    });
    if (!meal) return [];

    const skip = new Set(['with', 'the', 'and', 'for', 'from', 'thai', 'style', 'bowl', 'meal']);
    const words = meal.display_name
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(' ')
      .filter((w) => w.length >= 4 && !skip.has(w));

    if (words.length === 0) return [];

    const allMeals = await this.prisma.mealRecipe.findMany({
      where: { id: { not: mealId }, is_active: true },
      select: { id: true, display_name: true, category: true, meal_code: true },
    });

    return allMeals
      .map((m) => {
        const mWords = m.display_name
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, '')
          .split(' ');
        const matches = words.filter((w) => mWords.includes(w));
        return { ...m, matchScore: matches.length, matchedWords: matches };
      })
      .filter((m) => m.matchScore >= 2)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);
  }

  /**
   * Link a meal to its plant-based variant. ONE-DIRECTIONAL: the link is
   * always stored on the omnivore (meat) side's `linked_meal_id` column only.
   * The plant-based side is discovered at read time via the `variant_meals`
   * reverse relation — this enables N-to-1 pairings (e.g. one Vegan Alfredo
   * can be the counterpart for Shrimp Alfredo, Chicken Alfredo, and Beef
   * Alfredo simultaneously) without the bidirectional write collision that
   * would force each new link to overwrite the previous.
   *
   * See conner/data-model/decisions/2026-04-08-mandatory-diet-plan-on-dishes.md
   * and conner/data-model/flows/meal-variants.md for the full reasoning.
   *
   * TODO (post-diet-plan-ADR): once `MealRecipe.diet_plan_id` exists, enforce
   * that `id` is an omnivore dish and `linkedId` is a plant-based dish.
   */
  async linkVariant(id: string, linkedId: string) {
    if (id === linkedId) {
      throw new BadRequestException('A meal cannot be its own variant');
    }
    const [meat, plant] = await Promise.all([
      this.prisma.mealRecipe.findUnique({ where: { id }, select: { id: true } }),
      this.prisma.mealRecipe.findUnique({ where: { id: linkedId }, select: { id: true } }),
    ]);
    if (!meat) throw new NotFoundException('Meal not found');
    if (!plant) throw new NotFoundException('Linked meal not found');

    // Write only the omnivore (meat) side. Plant side's reverse relation
    // handles the discovery path.
    await this.prisma.mealRecipe.update({
      where: { id },
      data: { linked_meal_id: linkedId },
    });
    return this.findOne(id);
  }

  /**
   * Unlink a meal from its plant-based variant. Only clears the omnivore
   * side's `linked_meal_id` — there is nothing to clear on the plant side
   * because links are stored one-directionally.
   */
  async unlinkVariant(id: string) {
    await this.prisma.mealRecipe.update({
      where: { id },
      data: { linked_meal_id: null },
    });
    return this.findOne(id);
  }

  /** All unique categories */
  async getCategories() {
    const result = await this.prisma.mealRecipe.groupBy({
      by: ['category'],
      where: { category: { not: null } },
      orderBy: { category: 'asc' },
    });
    return result.map((r) => r.category).filter(Boolean);
  }
}
