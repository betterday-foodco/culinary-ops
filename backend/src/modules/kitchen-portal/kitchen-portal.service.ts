import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductionPlansService } from '../production-plans/production-plans.service';
import {
  UpsertProductionLogDto,
  SubmitFeedbackDto,
  CreateStationRequestDto,
  UpdateStationRequestDto,
} from './dto/kitchen-portal.dto';

@Injectable()
export class KitchenPortalService {
  constructor(
    private prisma: PrismaService,
    private productionPlansService: ProductionPlansService,
  ) {}

  async getBoard(userId: string, station: string) {
    // 1. Get current week's plan
    const plan = await this.productionPlansService.getCurrentPlan();
    if (!plan) {
      return { plan: null, tasks: [], pendingRequests: [] };
    }

    // 2. Get full sub-recipe report (station-grouped)
    const report = await this.productionPlansService.getSubRecipeReport(plan.id);

    // 3. Filter to this station's tasks
    const stationTasks: any[] = report.grouped_by_station?.[station] ?? [];

    // 4. Inject production log status for each task
    const logs = await this.prisma.kitchenProductionLog.findMany({
      where: {
        plan_id: plan.id,
        user_id: userId,
        sub_recipe_id: { in: stationTasks.map((t: any) => t.sub_recipe_id) },
      },
    });
    const logMap = new Map(logs.map((l) => [l.sub_recipe_id, l]));

    const tasks = stationTasks.map((task: any) => {
      const log = logMap.get(task.sub_recipe_id);
      return {
        ...task,
        log: log
          ? {
              status: log.status,
              qty_cooked: log.qty_cooked,
              weight_recorded: log.weight_recorded,
              notes: log.notes,
            }
          : { status: 'not_started', qty_cooked: null, weight_recorded: null, notes: null },
      };
    });

    // 5. Get pending incoming station requests for this station
    const pendingRequests = await this.prisma.stationRequest.findMany({
      where: {
        to_station: station,
        status: { not: 'completed' },
      },
      include: {
        from_user: { select: { id: true, name: true, station: true } },
        sub_recipe: { select: { id: true, name: true, display_name: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return {
      plan: { id: plan.id, week_label: plan.week_label, week_start: plan.week_start },
      tasks,
      pendingRequests,
    };
  }

  async upsertLog(userId: string, dto: UpsertProductionLogDto) {
    return this.prisma.kitchenProductionLog.upsert({
      where: {
        plan_id_sub_recipe_id_user_id: {
          plan_id: dto.plan_id,
          sub_recipe_id: dto.sub_recipe_id,
          user_id: userId,
        },
      },
      update: {
        status: dto.status,
        qty_cooked: dto.qty_cooked ?? null,
        weight_recorded: dto.weight_recorded ?? null,
        notes: dto.notes ?? null,
      },
      create: {
        plan_id: dto.plan_id,
        sub_recipe_id: dto.sub_recipe_id,
        user_id: userId,
        status: dto.status,
        qty_cooked: dto.qty_cooked ?? null,
        weight_recorded: dto.weight_recorded ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async submitFeedback(userId: string, dto: SubmitFeedbackDto) {
    return this.prisma.kitchenFeedback.create({
      data: {
        sub_recipe_id: dto.sub_recipe_id,
        user_id: userId,
        plan_id: dto.plan_id ?? null,
        rating: dto.rating,
        comment: dto.comment ?? null,
      },
    });
  }

  async getRequests(userId: string, station: string) {
    const [incoming, sent] = await Promise.all([
      this.prisma.stationRequest.findMany({
        where: { to_station: station },
        include: {
          from_user: { select: { id: true, name: true, station: true } },
          sub_recipe: { select: { id: true, name: true, display_name: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.stationRequest.findMany({
        where: { from_user_id: userId },
        include: {
          sub_recipe: { select: { id: true, name: true, display_name: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);
    return { incoming, sent };
  }

  async createRequest(userId: string, dto: CreateStationRequestDto) {
    return this.prisma.stationRequest.create({
      data: {
        from_user_id: userId,
        to_station: dto.to_station,
        description: dto.description,
        quantity: dto.quantity ?? null,
        unit: dto.unit ?? null,
        sub_recipe_id: dto.sub_recipe_id ?? null,
        plan_id: dto.plan_id ?? null,
      },
      include: {
        from_user: { select: { id: true, name: true, station: true } },
        sub_recipe: { select: { id: true, name: true, display_name: true } },
      },
    });
  }

  async updateRequestStatus(
    requestId: string,
    userId: string,
    station: string,
    dto: UpdateStationRequestDto,
  ) {
    const req = await this.prisma.stationRequest.findUnique({
      where: { id: requestId },
    });
    if (!req) throw new NotFoundException('Request not found');
    if (req.to_station !== station) {
      throw new ForbiddenException('You can only update requests sent to your station');
    }
    return this.prisma.stationRequest.update({
      where: { id: requestId },
      data: { status: dto.status },
    });
  }
}
