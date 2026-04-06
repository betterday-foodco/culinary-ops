import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CostEngineService } from '../../services/cost-engine.service';
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

    const { components, ...mealData } = dto;

    // Retry up to 5 times on meal_code collision (race condition guard)
    let meal: any;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        meal = await this.prisma.$transaction(async (tx) => {
          const meal_code = await this.generateMealCode(tx);
          const created = await tx.mealRecipe.create({ data: { ...mealData, meal_code } });

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
        net_weight_kg: true,
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

  /** Bidirectionally link two meals as variants */
  async linkVariant(id: string, linkedId: string) {
    await Promise.all([
      this.prisma.mealRecipe.update({ where: { id }, data: { linked_meal_id: linkedId } }),
      this.prisma.mealRecipe.update({ where: { id: linkedId }, data: { linked_meal_id: id } }),
    ]);
    return this.findOne(id);
  }

  /** Bidirectionally unlink a meal variant */
  async unlinkVariant(id: string) {
    const meal = await this.prisma.mealRecipe.findUnique({
      where: { id },
      select: { linked_meal_id: true },
    });
    const updates: Promise<any>[] = [
      this.prisma.mealRecipe.update({ where: { id }, data: { linked_meal_id: null } }),
    ];
    if (meal?.linked_meal_id) {
      updates.push(
        this.prisma.mealRecipe.update({
          where: { id: meal.linked_meal_id },
          data: { linked_meal_id: null },
        }),
      );
    }
    await Promise.all(updates);
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
