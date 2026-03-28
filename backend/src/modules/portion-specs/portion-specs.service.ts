import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePortionSpecDto, UpdatePortionSpecDto } from './dto/portion-spec.dto';

@Injectable()
export class PortionSpecsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.portionSpec.findMany({
      include: {
        components: {
          orderBy: { sort_order: 'asc' },
        },
        meal: {
          select: { id: true, meal_code: true, display_name: true, image_url: true, category: true },
        },
      },
      orderBy: {
        meal: { display_name: 'asc' },
      },
    });
  }

  async findByMeal(mealId: string) {
    const spec = await this.prisma.portionSpec.findUnique({
      where: { meal_id: mealId },
      include: {
        components: {
          orderBy: { sort_order: 'asc' },
        },
        meal: {
          select: { id: true, meal_code: true, display_name: true, image_url: true, category: true },
        },
      },
    });
    if (!spec) {
      throw new NotFoundException(`PortionSpec for meal ${mealId} not found`);
    }
    return spec;
  }

  async upsert(dto: CreatePortionSpecDto) {
    const { meal_id, components, ...specFields } = dto;

    const existing = await this.prisma.portionSpec.findUnique({
      where: { meal_id },
    });

    if (existing) {
      // Delete all existing components then recreate
      await this.prisma.portionSpecComponent.deleteMany({
        where: { spec_id: existing.id },
      });

      return this.prisma.portionSpec.update({
        where: { id: existing.id },
        data: {
          ...specFields,
          components: components?.length
            ? {
                createMany: {
                  data: components.map((c) => ({
                    ingredient_name: c.ingredient_name,
                    portion_min: c.portion_min,
                    portion_max: c.portion_max,
                    portion_unit: c.portion_unit,
                    tool: c.tool,
                    notes: c.notes,
                    sort_order: c.sort_order ?? 0,
                  })),
                },
              }
            : undefined,
        },
        include: {
          components: { orderBy: { sort_order: 'asc' } },
          meal: { select: { id: true, meal_code: true, display_name: true } },
        },
      });
    }

    // Create new spec with components
    return this.prisma.portionSpec.create({
      data: {
        meal_id,
        ...specFields,
        components: components?.length
          ? {
              createMany: {
                data: components.map((c) => ({
                  ingredient_name: c.ingredient_name,
                  portion_min: c.portion_min,
                  portion_max: c.portion_max,
                  portion_unit: c.portion_unit,
                  tool: c.tool,
                  notes: c.notes,
                  sort_order: c.sort_order ?? 0,
                })),
              },
            }
          : undefined,
      },
      include: {
        components: { orderBy: { sort_order: 'asc' } },
        meal: { select: { id: true, meal_code: true, display_name: true } },
      },
    });
  }

  async update(id: string, dto: UpdatePortionSpecDto) {
    const existing = await this.prisma.portionSpec.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`PortionSpec ${id} not found`);
    }

    const { components, ...specFields } = dto;

    if (components !== undefined) {
      await this.prisma.portionSpecComponent.deleteMany({ where: { spec_id: id } });
    }

    return this.prisma.portionSpec.update({
      where: { id },
      data: {
        ...specFields,
        components:
          components !== undefined && components.length > 0
            ? {
                createMany: {
                  data: components.map((c) => ({
                    ingredient_name: c.ingredient_name,
                    portion_min: c.portion_min,
                    portion_max: c.portion_max,
                    portion_unit: c.portion_unit,
                    tool: c.tool,
                    notes: c.notes,
                    sort_order: c.sort_order ?? 0,
                  })),
                },
              }
            : undefined,
      },
      include: {
        components: { orderBy: { sort_order: 'asc' } },
        meal: { select: { id: true, meal_code: true, display_name: true } },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.portionSpec.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`PortionSpec ${id} not found`);
    }
    return this.prisma.portionSpec.delete({ where: { id } });
  }

  async findByPlan(planId: string) {
    const planItems = await this.prisma.productionPlanItem.findMany({
      where: { plan_id: planId },
      select: { meal_id: true },
    });

    const mealIds = planItems.map((item) => item.meal_id);

    if (mealIds.length === 0) {
      return [];
    }

    return this.prisma.portionSpec.findMany({
      where: { meal_id: { in: mealIds } },
      include: {
        components: { orderBy: { sort_order: 'asc' } },
        meal: { select: { id: true, meal_code: true, display_name: true } },
      },
      orderBy: {
        meal: { display_name: 'asc' },
      },
    });
  }
}
