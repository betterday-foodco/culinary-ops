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
  SendMessageDto,
} from './dto/kitchen-portal.dto';

@Injectable()
export class KitchenPortalService {
  constructor(
    private prisma: PrismaService,
    private productionPlansService: ProductionPlansService,
  ) {}

  async getBoard(userId: string, station: string) {
    // 1. Find the most recently published plan (not restricted to current week)
    const plan = await this.prisma.productionPlan.findFirst({
      where: { published_to_kitchen: true },
      orderBy: { week_start: 'desc' },
    });
    if (!plan) {
      // Check if there's any plan at all (even unpublished) to distinguish the two empty states
      const anyPlan = await this.prisma.productionPlan.findFirst({
        orderBy: { week_start: 'desc' },
      });
      return { plan: null, tasks: [], pendingRequests: [], notPublished: !!anyPlan };
    }

    // 2. Get full sub-recipe report (station-grouped)
    const report = await this.productionPlansService.getSubRecipeReport(plan.id);

    // 3. Filter to this station's tasks (or return all tasks if no station specified)
    const grouped = report.grouped_by_station ?? {};
    const stationTasks: any[] = station
      ? (grouped[station] ?? [])
      : Object.values(grouped).flat();

    // 4. Inject production log status for each task (fetch ALL users' logs for completed_by)
    const allLogs = await this.prisma.kitchenProductionLog.findMany({
      where: {
        plan_id: plan.id,
        sub_recipe_id: { in: stationTasks.map((t: any) => t.id) },
      },
      select: {
        id: true, plan_id: true, sub_recipe_id: true, user_id: true,
        status: true, qty_cooked: true, weight_recorded: true, have_on_hand: true,
        notes: true, cooked_by: true, started_at: true,
        shortage_approved: true, shortage_approved_at: true,
        shortage_approved_by: { select: { id: true, name: true } },
        bulk_reason: true, bulk_approved: true, bulk_approved_at: true,
        bulk_approved_by: { select: { id: true, name: true } },
        assigned_to_id: true, lead_approved: true, lead_approved_at: true,
        assigned_to: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });
    // Per task: map sub_recipe_id → { myLog, completedByName }
    const allLogsByTask = new Map<string, typeof allLogs>();
    for (const l of allLogs) {
      if (!allLogsByTask.has(l.sub_recipe_id)) allLogsByTask.set(l.sub_recipe_id, []);
      allLogsByTask.get(l.sub_recipe_id)!.push(l);
    }

    const tasks = stationTasks.map((task: any) => {
      const taskLogs = allLogsByTask.get(task.id) ?? [];
      const myLog = taskLogs.find((l) => l.user_id === userId);
      const doneLog = taskLogs.find((l) => l.status === 'done');

      // Normalize quantity to Kgs (convert grams → Kgs, mL → L)
      let qty: number = task.total_quantity ?? 0;
      let unit: string = task.unit ?? 'Kgs';
      const u = unit.toLowerCase();
      if (u === 'g' || u === 'gr' || u === 'grams' || u === 'gram') { qty = qty / 1000; unit = 'Kgs'; }
      else if (u === 'ml' || u === 'milliliters' || u === 'millilitres') { qty = qty / 1000; unit = 'L'; }

      return {
        sub_recipe_id: task.id,
        name: task.name,
        display_name: task.display_name ?? null,
        sub_recipe_code: task.sub_recipe_code,
        station_tag: task.station_tag ?? null,
        production_day: task.production_day ?? null,
        priority: task.priority ?? null,
        instructions: task.instructions ?? null,
        total_quantity: parseFloat(qty.toFixed(3)),
        unit,
        ingredients: task.ingredients ?? [],
        completed_by: doneLog?.user?.name ?? null,
        log: myLog
          ? {
              status: myLog.status,
              qty_cooked: myLog.qty_cooked,
              weight_recorded: myLog.weight_recorded,
              have_on_hand: myLog.have_on_hand,
              notes: myLog.notes,
              cooked_by: myLog.cooked_by,
              shortage_approved: myLog.shortage_approved,
              shortage_approved_at: myLog.shortage_approved_at,
              shortage_approved_by: myLog.shortage_approved_by,
              assigned_to_id: myLog.assigned_to_id,
              assigned_to: myLog.assigned_to,
              lead_approved: myLog.lead_approved,
              lead_approved_at: myLog.lead_approved_at,
            }
          : { status: 'not_started', qty_cooked: null, weight_recorded: null, have_on_hand: null, notes: null, shortage_approved: false, assigned_to_id: null, assigned_to: null, lead_approved: false },
      };
    });

    // 5. Get station tasks visible to this station/user
    const stationTasksForBoard = await this.prisma.stationTask.findMany({
      where: {
        plan_id: plan.id,
        OR: [
          { station: station || null },
          { station: null },
          ...(station ? [{ station }] : []),
          { assigned_user_id: userId },
        ],
      },
      include: {
        assigned_user: { select: { id: true, name: true, station: true } },
        completed_by: { select: { id: true, name: true } },
        created_by: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    // 6. Get pending incoming station requests for this station
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
      plan: { id: plan.id, week_label: plan.week_label, week_start: plan.week_start, published_to_kitchen: plan.published_to_kitchen },
      tasks,
      pendingRequests,
      stationTasks: stationTasksForBoard,
    };
  }

  async getAllFeedback() {
    return (this.prisma.kitchenFeedback as any).findMany({
      include: {
        sub_recipe: { select: { id: true, name: true, display_name: true, station_tag: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: [{ is_fixed: 'asc' }, { created_at: 'desc' }],
    });
  }

  async updateFeedback(id: string, dto: { admin_notes?: string; is_fixed?: boolean }) {
    return (this.prisma.kitchenFeedback as any).update({
      where: { id },
      data: {
        ...(dto.admin_notes !== undefined && { admin_notes: dto.admin_notes }),
        ...(dto.is_fixed !== undefined && { is_fixed: dto.is_fixed }),
      },
      include: {
        sub_recipe: { select: { id: true, name: true, display_name: true, station_tag: true } },
        user: { select: { id: true, name: true } },
      },
    });
  }

  async getKitchenStaff() {
    return this.prisma.user.findMany({
      where: { role: 'kitchen' },
      select: { id: true, name: true, station: true },
      orderBy: { name: 'asc' },
    });
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
        have_on_hand: dto.have_on_hand ?? null,
        notes: dto.notes ?? null,
        cooked_by: dto.cooked_by ?? null,
        bulk_reason: dto.bulk_reason ?? null,
        ...(dto.status === 'in_progress' && dto.started_at
          ? { started_at: new Date(dto.started_at) }
          : {}),
      },
      create: {
        plan_id: dto.plan_id,
        sub_recipe_id: dto.sub_recipe_id,
        user_id: userId,
        status: dto.status,
        qty_cooked: dto.qty_cooked ?? null,
        weight_recorded: dto.weight_recorded ?? null,
        have_on_hand: dto.have_on_hand ?? null,
        notes: dto.notes ?? null,
        cooked_by: dto.cooked_by ?? null,
        bulk_reason: dto.bulk_reason ?? null,
        ...(dto.status === 'in_progress' ? { started_at: new Date() } : {}),
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
    dto: UpdateStationRequestDto,
  ) {
    const req = await this.prisma.stationRequest.findUnique({
      where: { id: requestId },
    });
    if (!req) throw new NotFoundException('Request not found');
    return this.prisma.stationRequest.update({
      where: { id: requestId },
      data: { status: dto.status },
    });
  }

  // ── Messaging ────────────────────────────────────────────────────────────

  async getMessages(userId: string, station: string) {
    // Kitchen user sees: messages to their station + broadcasts + direct messages to them
    // Admin/chef sees: everything they sent + direct messages to them
    return (this.prisma.kitchenMessage as any).findMany({
      where: {
        OR: [
          { from_user_id: userId },                    // messages I sent
          { to_user_id: userId },                      // direct to me
          { to_station: station, to_user_id: null },   // to my station
          { to_station: null, to_user_id: null },      // broadcast to all kitchen
        ],
      },
      include: {
        from_user: { select: { id: true, name: true, station: true, role: true } },
        to_user:   { select: { id: true, name: true, station: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  async sendMessage(userId: string, dto: SendMessageDto) {
    return (this.prisma.kitchenMessage as any).create({
      data: {
        from_user_id: userId,
        body: dto.body,
        to_station:  dto.to_station  ?? null,
        to_user_id:  dto.to_user_id  ?? null,
      },
      include: {
        from_user: { select: { id: true, name: true, station: true, role: true } },
        to_user:   { select: { id: true, name: true, station: true } },
      },
    });
  }

  async markMessagesRead(userId: string, station: string) {
    await (this.prisma.kitchenMessage as any).updateMany({
      where: {
        is_read: false,
        OR: [
          { to_user_id: userId },
          { to_station: station, to_user_id: null },
          { to_station: null, to_user_id: null },
        ],
        NOT: { from_user_id: userId },
      },
      data: { is_read: true },
    });
    return { ok: true };
  }

  async getUnreadCount(userId: string, station: string) {
    const count = await (this.prisma.kitchenMessage as any).count({
      where: {
        is_read: false,
        NOT: { from_user_id: userId },
        OR: [
          { to_user_id: userId },
          { to_station: station, to_user_id: null },
          { to_station: null, to_user_id: null },
        ],
      },
    });
    return { unread: count };
  }

  // ── Shortage Approval ─────────────────────────────────────────────────────

  async approveShortage(logId: string, adminId: string) {
    const log = await this.prisma.kitchenProductionLog.findUnique({ where: { id: logId } });
    if (!log) throw new NotFoundException('Log not found');
    return this.prisma.kitchenProductionLog.update({
      where: { id: logId },
      data: {
        shortage_approved: true,
        shortage_approved_by_id: adminId,
        shortage_approved_at: new Date(),
      },
    });
  }

  async getPendingShortages() {
    return this.prisma.kitchenProductionLog.findMany({
      where: { status: 'short', shortage_approved: false },
      include: {
        sub_recipe: { select: { id: true, name: true, display_name: true, station_tag: true } },
        user: { select: { id: true, name: true, station: true } },
        plan: { select: { id: true, week_label: true } },
      },
      orderBy: { logged_at: 'desc' },
    });
  }

  // ── Station Assignment (morning) ──────────────────────────────────────────

  async assignStation(staffId: string, station: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: staffId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'kitchen') throw new ForbiddenException('Can only assign station to kitchen staff');
    return this.prisma.user.update({
      where: { id: staffId },
      data: { station },
      select: { id: true, name: true, station: true, role: true },
    });
  }

  async getAllKitchenStaffWithStation() {
    return this.prisma.user.findMany({
      where: { role: 'kitchen' },
      select: { id: true, name: true, station: true, station_role: true },
      orderBy: [{ station: 'asc' }, { name: 'asc' }],
    });
  }

  async assignStationRole(staffId: string, station_role: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: staffId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'kitchen') throw new ForbiddenException('Can only assign role to kitchen staff');
    return this.prisma.user.update({
      where: { id: staffId },
      data: { station_role: station_role ?? null },
      select: { id: true, name: true, station: true, station_role: true },
    });
  }

  // ── Admin: all messages ────────────────────────────────────────────────────

  async getAllMessages() {
    return (this.prisma.kitchenMessage as any).findMany({
      include: {
        from_user: { select: { id: true, name: true, station: true, role: true } },
        to_user:   { select: { id: true, name: true, station: true } },
      },
      orderBy: { created_at: 'asc' },
      take: 200,
    });
  }

  // ── Bulk Cooking Approval ─────────────────────────────────────────────────

  async getPendingBulk() {
    return this.prisma.kitchenProductionLog.findMany({
      where: { status: 'bulk', bulk_approved: false },
      include: {
        sub_recipe: { select: { id: true, name: true, display_name: true, station_tag: true } },
        user: { select: { id: true, name: true, station: true } },
        plan: { select: { id: true, week_label: true } },
      },
      orderBy: { logged_at: 'desc' },
    });
  }

  async approveBulk(logId: string, adminId: string) {
    const log = await this.prisma.kitchenProductionLog.findUnique({ where: { id: logId } });
    if (!log) throw new NotFoundException('Log not found');
    return this.prisma.kitchenProductionLog.update({
      where: { id: logId },
      data: {
        bulk_approved: true,
        bulk_approved_by_id: adminId,
        bulk_approved_at: new Date(),
      },
    });
  }

  // ── Station Lead: assign task + lead approval ─────────────────────────────

  /** Get prep cooks for a given station (for the assignment dropdown) */
  async getStationPrepCooks(station: string) {
    return this.prisma.user.findMany({
      where: { role: 'kitchen', station },
      select: { id: true, name: true, station_role: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Station lead assigns a task to a prep cook */
  async assignTask(planId: string, subRecipeId: string, assignedToId: string | null) {
    return this.prisma.kitchenProductionLog.updateMany({
      where: { plan_id: planId, sub_recipe_id: subRecipeId },
      data: { assigned_to_id: assignedToId },
    });
  }

  /** Station lead approves a prep cook's completed task */
  async leadApproveTask(planId: string, subRecipeId: string, leadId: string) {
    return this.prisma.kitchenProductionLog.updateMany({
      where: { plan_id: planId, sub_recipe_id: subRecipeId },
      data: { lead_approved: true, lead_approved_at: new Date() },
    });
  }

  /** Update sub-recipe priority (used from production plan page) */
  async updateSubRecipePriority(subRecipeId: string, priority: number) {
    return this.prisma.subRecipe.update({
      where: { id: subRecipeId },
      data: { priority },
      select: { id: true, priority: true },
    });
  }
}
