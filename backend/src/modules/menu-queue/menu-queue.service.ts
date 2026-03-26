import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AddToQueueDto,
  UpdateQueueItemDto,
  ReorderColumnDto,
  AdvanceQueueDto,
} from './dto/menu-queue.dto';

// The 12 fixed column slots
export const QUEUE_COLUMNS = [
  { id: 'meat_1',  label: 'Meat 1',  type: 'meat' },
  { id: 'meat_2',  label: 'Meat 2',  type: 'meat' },
  { id: 'meat_3',  label: 'Meat 3',  type: 'meat' },
  { id: 'meat_4',  label: 'Meat 4',  type: 'meat' },
  { id: 'meat_5',  label: 'Meat 5',  type: 'meat' },
  { id: 'omni_1',  label: 'Omni 1',  type: 'omni' },
  { id: 'omni_2',  label: 'Omni 2',  type: 'omni' },
  { id: 'omni_3',  label: 'Omni 3',  type: 'omni' },
  { id: 'omni_4',  label: 'Omni 4',  type: 'omni' },
  { id: 'omni_5',  label: 'Omni 5',  type: 'omni' },
  { id: 'omni_6',  label: 'Omni 6',  type: 'omni' },
  { id: 'vegan_1', label: 'Vegan',   type: 'vegan' },
];

@Injectable()
export class MenuQueueService {
  constructor(private prisma: PrismaService) {}

  async getQueue() {
    const items = await this.prisma.menuQueueItem.findMany({
      include: {
        meal: {
          select: {
            id: true,
            name: true,
            display_name: true,
            category: true,
            allergen_tags: true,
            computed_cost: true,
            image_url: true,
          },
        },
      },
      orderBy: [{ column_id: 'asc' }, { position: 'asc' }],
    });

    // Group by column
    const grouped: Record<string, typeof items> = {};
    for (const col of QUEUE_COLUMNS) {
      grouped[col.id] = [];
    }
    for (const item of items) {
      if (grouped[item.column_id]) {
        grouped[item.column_id].push(item);
      }
    }

    return { columns: QUEUE_COLUMNS, queue: grouped };
  }

  async addItem(dto: AddToQueueDto) {
    const validColumn = QUEUE_COLUMNS.find((c) => c.id === dto.column_id);
    if (!validColumn) {
      throw new NotFoundException(`Invalid column_id: ${dto.column_id}`);
    }

    // Check meal exists
    const meal = await this.prisma.mealRecipe.findUnique({ where: { id: dto.meal_id } });
    if (!meal) throw new NotFoundException('Meal not found');

    // Check not already in this column
    const existing = await this.prisma.menuQueueItem.findUnique({
      where: { column_id_meal_id: { column_id: dto.column_id, meal_id: dto.meal_id } },
    });
    if (existing) throw new ConflictException('Meal already in this column');

    // Get next position if not specified
    let position = dto.position;
    if (position === undefined) {
      const last = await this.prisma.menuQueueItem.findFirst({
        where: { column_id: dto.column_id },
        orderBy: { position: 'desc' },
      });
      position = last ? last.position + 1 : 0;
    }

    const item = await this.prisma.menuQueueItem.create({
      data: {
        column_id: dto.column_id,
        meal_id: dto.meal_id,
        position,
        repeat_weeks: dto.repeat_weeks ?? 4,
        weeks_remaining: position, // display: weeks until top
      },
      include: { meal: { select: { id: true, name: true, display_name: true, category: true } } },
    });

    return item;
  }

  async removeItem(id: string) {
    const item = await this.prisma.menuQueueItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Queue item not found');

    await this.prisma.menuQueueItem.delete({ where: { id } });

    // Re-number positions in that column
    await this.resequenceColumn(item.column_id);
    return { message: 'Removed' };
  }

  async updateItem(id: string, dto: UpdateQueueItemDto) {
    const item = await this.prisma.menuQueueItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Queue item not found');

    return this.prisma.menuQueueItem.update({
      where: { id },
      data: {
        ...(dto.repeat_weeks !== undefined && { repeat_weeks: dto.repeat_weeks }),
        ...(dto.weeks_remaining !== undefined && { weeks_remaining: dto.weeks_remaining }),
      },
      include: { meal: { select: { id: true, name: true, display_name: true, category: true } } },
    });
  }

  async reorderColumn(columnId: string, dto: ReorderColumnDto) {
    const validColumn = QUEUE_COLUMNS.find((c) => c.id === columnId);
    if (!validColumn) throw new NotFoundException(`Invalid column_id: ${columnId}`);

    // Update positions in bulk
    await Promise.all(
      dto.item_ids.map((itemId, index) =>
        this.prisma.menuQueueItem.update({
          where: { id: itemId },
          data: { position: index, weeks_remaining: index },
        }),
      ),
    );

    return this.getQueue();
  }

  async advanceQueue(dto: AdvanceQueueDto) {
    // For each column: rotate — item at position 0 moves to the bottom (position = max + 1)
    // All other items move up by 1 (position--)
    for (const col of QUEUE_COLUMNS) {
      const items = await this.prisma.menuQueueItem.findMany({
        where: { column_id: col.id },
        orderBy: { position: 'asc' },
      });

      if (items.length === 0) continue;

      const [top, ...rest] = items;

      // Move rest up
      await Promise.all(
        rest.map((item, idx) =>
          this.prisma.menuQueueItem.update({
            where: { id: item.id },
            data: { position: idx, weeks_remaining: idx },
          }),
        ),
      );

      // Move top to bottom
      await this.prisma.menuQueueItem.update({
        where: { id: top.id },
        data: { position: rest.length, weeks_remaining: rest.length },
      });
    }

    // Log the advance
    const log = await this.prisma.menuAdvanceLog.create({
      data: {
        week_label: dto.week_label ?? null,
        notes: dto.notes ?? null,
      },
    });

    return { message: 'Queue advanced', log, queue: await this.getQueue() };
  }

  async getLastAdvanced() {
    const log = await this.prisma.menuAdvanceLog.findFirst({
      orderBy: { advanced_at: 'desc' },
    });
    return log;
  }

  private async resequenceColumn(columnId: string) {
    const items = await this.prisma.menuQueueItem.findMany({
      where: { column_id: columnId },
      orderBy: { position: 'asc' },
    });
    await Promise.all(
      items.map((item, idx) =>
        this.prisma.menuQueueItem.update({
          where: { id: item.id },
          data: { position: idx, weeks_remaining: idx },
        }),
      ),
    );
  }
}
