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

  async findAll() {
    return this.prisma.mealRecipe.findMany({
      include: {
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

  async create(dto: CreateMealDto) {
    this.validateComponents(dto.components ?? []);

    const { components, ...mealData } = dto;

    const meal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mealRecipe.create({ data: mealData });

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

    const cost = await this.costEngine.calculateMealCost(meal.id);
    await this.prisma.mealRecipe.update({
      where: { id: meal.id },
      data: { computed_cost: cost },
    });

    return this.findOne(meal.id);
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
