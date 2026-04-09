import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CostEngineService } from '../../services/cost-engine.service';
import {
  CreateSubRecipeDto,
  UpdateSubRecipeDto,
  AddSubRecipeComponentDto,
  UpdateSubRecipeComponentDto,
} from './dto/sub-recipe.dto';

@Injectable()
export class SubRecipesService {
  constructor(
    private prisma: PrismaService,
    private costEngine: CostEngineService,
  ) {}

  async findAll(stationTag?: string) {
    return this.prisma.subRecipe.findMany({
      where: stationTag ? { station_tag: stationTag } : undefined,
      include: {
        components: {
          include: {
            ingredient: { select: { id: true, internal_name: true, sku: true } },
            child_sub_recipe: { select: { id: true, name: true, sub_recipe_code: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const subRecipe = await this.prisma.subRecipe.findUnique({
      where: { id },
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
    });
    if (!subRecipe) throw new NotFoundException('Sub-recipe not found');
    return subRecipe;
  }

  async create(dto: CreateSubRecipeDto) {
    const existing = await this.prisma.subRecipe.findUnique({
      where: { sub_recipe_code: dto.sub_recipe_code },
    });
    if (existing) throw new ConflictException('Sub-recipe code already exists');

    this.validateComponents(dto.components ?? []);

    const { components, ...subRecipeData } = dto;

    const subRecipe = await this.prisma.$transaction(async (tx) => {
      const slug = (subRecipeData.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sub-recipe';
      const created = await tx.subRecipe.create({ data: { ...subRecipeData, slug } });

      if (components?.length) {
        await tx.subRecipeComponent.createMany({
          data: components.map((c) => ({
            sub_recipe_id: created.id,
            ingredient_id: c.ingredient_id ?? null,
            child_sub_recipe_id: c.child_sub_recipe_id ?? null,
            quantity: c.quantity,
            unit: c.unit,
          })),
        });
      }

      return created;
    });

    const cost = await this.costEngine.calculateSubRecipeCost(subRecipe.id);
    await this.prisma.subRecipe.update({
      where: { id: subRecipe.id },
      data: { computed_cost: cost },
    });

    return this.findOne(subRecipe.id);
  }

  async update(id: string, dto: UpdateSubRecipeDto) {
    await this.findOne(id);

    if (dto.sub_recipe_code) {
      const existing = await this.prisma.subRecipe.findFirst({
        where: { sub_recipe_code: dto.sub_recipe_code, NOT: { id } },
      });
      if (existing) throw new ConflictException('Sub-recipe code already in use');
    }

    if (dto.components !== undefined) {
      this.validateComponents(dto.components ?? []);
    }

    const { components, ...subRecipeData } = dto;

    await this.prisma.$transaction(async (tx) => {
      await tx.subRecipe.update({ where: { id }, data: subRecipeData });

      if (components !== undefined) {
        await tx.subRecipeComponent.deleteMany({ where: { sub_recipe_id: id } });
        if (components.length) {
          await tx.subRecipeComponent.createMany({
            data: components.map((c) => ({
              sub_recipe_id: id,
              ingredient_id: c.ingredient_id ?? null,
              child_sub_recipe_id: c.child_sub_recipe_id ?? null,
              quantity: c.quantity,
              unit: c.unit,
            })),
          });
        }
      }
    });

    const cost = await this.costEngine.calculateSubRecipeCost(id);
    await this.prisma.subRecipe.update({
      where: { id },
      data: { computed_cost: cost },
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.subRecipe.delete({ where: { id } });
  }

  async getStationTags() {
    const result = await this.prisma.subRecipe.groupBy({
      by: ['station_tag'],
      where: { station_tag: { not: null } },
      orderBy: { station_tag: 'asc' },
    });
    return result.map((r) => r.station_tag).filter(Boolean);
  }

  private validateComponents(
    components: { ingredient_id?: string; child_sub_recipe_id?: string }[],
  ) {
    for (const c of components) {
      if (!c.ingredient_id && !c.child_sub_recipe_id) {
        throw new BadRequestException(
          'Each component must have either ingredient_id or child_sub_recipe_id',
        );
      }
      if (c.ingredient_id && c.child_sub_recipe_id) {
        throw new BadRequestException(
          'Component cannot have both ingredient_id and child_sub_recipe_id',
        );
      }
    }
  }

  /** Prep sheet: all sub-recipes with full ingredient details, grouped by station, sorted by priority */
  async getPrepSheet(stationTag?: string, day?: string) {
    const subRecipes = await this.prisma.subRecipe.findMany({
      where: {
        ...(stationTag ? { station_tag: stationTag } : {}),
        ...(day ? { production_day: day } : {}),
      },
      include: {
        components: {
          include: {
            ingredient: {
              select: {
                id: true, internal_name: true, display_name: true,
                sku: true, category: true, unit: true,
              },
            },
            child_sub_recipe: {
              select: { id: true, name: true, sub_recipe_code: true },
            },
          },
        },
      },
      orderBy: [{ station_tag: 'asc' }, { priority: 'asc' }, { name: 'asc' }],
    });

    // Group by station
    const grouped: Record<string, typeof subRecipes> = {};
    for (const sr of subRecipes) {
      const key = sr.station_tag ?? 'Unassigned';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(sr);
    }
    return grouped;
  }

  /** All unique production days */
  async getProductionDays() {
    const result = await this.prisma.subRecipe.groupBy({
      by: ['production_day'],
      where: { production_day: { not: null } },
      orderBy: { production_day: 'asc' },
    });
    return result.map((r) => r.production_day).filter(Boolean);
  }

  // ── Individual component CRUD (mirrors meals component CRUD) ───────────────

  async addComponent(subRecipeId: string, dto: AddSubRecipeComponentDto) {
    await this.findOne(subRecipeId);

    if (!dto.ingredient_id && !dto.child_sub_recipe_id) {
      throw new BadRequestException('Must provide ingredient_id or child_sub_recipe_id');
    }
    if (dto.ingredient_id && dto.child_sub_recipe_id) {
      throw new BadRequestException('Cannot provide both ingredient_id and child_sub_recipe_id');
    }
    if (dto.child_sub_recipe_id === subRecipeId) {
      throw new BadRequestException('A sub-recipe cannot reference itself as a component');
    }

    const component = await this.prisma.subRecipeComponent.create({
      data: {
        sub_recipe_id: subRecipeId,
        ingredient_id: dto.ingredient_id ?? null,
        child_sub_recipe_id: dto.child_sub_recipe_id ?? null,
        quantity: dto.quantity,
        unit: dto.unit,
      },
      include: {
        ingredient: {
          select: { id: true, internal_name: true, sku: true, cost_per_unit: true, unit: true },
        },
        child_sub_recipe: {
          select: { id: true, name: true, sub_recipe_code: true, computed_cost: true },
        },
      },
    });

    // Recalculate cost
    const cost = await this.costEngine.calculateSubRecipeCost(subRecipeId);
    await this.prisma.subRecipe.update({ where: { id: subRecipeId }, data: { computed_cost: cost } });

    return component;
  }

  async updateComponent(
    subRecipeId: string,
    componentId: string,
    dto: UpdateSubRecipeComponentDto,
  ) {
    const component = await this.prisma.subRecipeComponent.findFirst({
      where: { id: componentId, sub_recipe_id: subRecipeId },
    });
    if (!component) throw new NotFoundException('Component not found on this sub-recipe');

    await this.prisma.subRecipeComponent.update({
      where: { id: componentId },
      data: {
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
      },
    });

    const cost = await this.costEngine.calculateSubRecipeCost(subRecipeId);
    await this.prisma.subRecipe.update({ where: { id: subRecipeId }, data: { computed_cost: cost } });

    return this.findOne(subRecipeId);
  }

  async removeComponent(subRecipeId: string, componentId: string) {
    const component = await this.prisma.subRecipeComponent.findFirst({
      where: { id: componentId, sub_recipe_id: subRecipeId },
    });
    if (!component) throw new NotFoundException('Component not found on this sub-recipe');

    await this.prisma.subRecipeComponent.delete({ where: { id: componentId } });

    const cost = await this.costEngine.calculateSubRecipeCost(subRecipeId);
    await this.prisma.subRecipe.update({ where: { id: subRecipeId }, data: { computed_cost: cost } });

    return { success: true };
  }
}
