import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStationTaskDto } from './dto/station-tasks.dto';

@Injectable()
export class StationTasksService {
  constructor(private prisma: PrismaService) {}

  async list(planId?: string) {
    return this.prisma.stationTask.findMany({
      where: planId ? { plan_id: planId } : {},
      include: {
        assigned_user: { select: { id: true, name: true, station: true } },
        completed_by: { select: { id: true, name: true } },
        created_by: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async create(createdById: string, dto: CreateStationTaskDto) {
    return this.prisma.stationTask.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        station: dto.station ?? null,
        assigned_user_id: dto.assigned_user_id ?? null,
        plan_id: dto.plan_id ?? null,
        created_by_id: createdById,
      },
      include: {
        assigned_user: { select: { id: true, name: true, station: true } },
        completed_by: { select: { id: true, name: true } },
        created_by: { select: { id: true, name: true } },
      },
    });
  }

  async complete(taskId: string, userId: string) {
    const task = await this.prisma.stationTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.stationTask.update({
      where: { id: taskId },
      data: { completed_by_id: userId, completed_at: new Date() },
      include: {
        assigned_user: { select: { id: true, name: true, station: true } },
        completed_by: { select: { id: true, name: true } },
        created_by: { select: { id: true, name: true } },
      },
    });
  }

  async uncomplete(taskId: string) {
    const task = await this.prisma.stationTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.stationTask.update({
      where: { id: taskId },
      data: { completed_by_id: null, completed_at: null },
      include: {
        assigned_user: { select: { id: true, name: true, station: true } },
        completed_by: { select: { id: true, name: true } },
        created_by: { select: { id: true, name: true } },
      },
    });
  }

  async remove(taskId: string) {
    const task = await this.prisma.stationTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.prisma.stationTask.delete({ where: { id: taskId } });
    return { message: 'Deleted' };
  }
}
