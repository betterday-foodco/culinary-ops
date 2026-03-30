import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SystemConfigService } from '../system-config/system-config.service';
import { MealPrepOrderPayload, MealPrepWebhookService } from './mealprep-webhook.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('webhooks')
export class MealPrepWebhookController {
  private readonly logger = new Logger(MealPrepWebhookController.name);

  constructor(
    private svc: MealPrepWebhookService,
    private config: SystemConfigService,
    private prisma: PrismaService,
  ) {}

  /**
   * POST /webhooks/mealprep-order
   * Called by the MealPrep platform when orders are placed.
   * Optional: include X-Webhook-Secret header for verification.
   */
  @Post('mealprep-order')
  @HttpCode(200)
  async receiveOrder(
    @Body() payload: MealPrepOrderPayload,
    @Headers('x-webhook-secret') secret?: string,
    @Headers('x-mealprep-secret') secret2?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    // Verify secret if one is configured
    const expectedSecret = await this.config.get('mealprep_webhook_secret');
    if (expectedSecret) {
      const provided = secret ?? secret2 ?? authHeader?.replace('Bearer ', '');
      if (provided !== expectedSecret) {
        this.logger.warn('Webhook received with invalid secret');
        throw new UnauthorizedException('Invalid webhook secret');
      }
    }

    this.logger.log(`MealPrep webhook received: ${JSON.stringify(payload).slice(0, 200)}`);

    // Log the raw webhook
    const log = await this.prisma.webhookLog.create({
      data: {
        source: 'mealprep',
        event_type: payload.event ?? 'order',
        payload: payload as any,
        status: 'received',
      },
    });

    let result: object;
    try {
      result = await this.svc.handleOrderWebhook(payload);
      await this.prisma.webhookLog.update({
        where: { id: log.id },
        data: { status: 'processed', result: result as any },
      });
    } catch (err: any) {
      await this.prisma.webhookLog.update({
        where: { id: log.id },
        data: { status: 'error', error: err.message },
      });
      throw err;
    }

    return result;
  }

  /** GET /webhooks/logs — admin view of recent webhook calls */
  @UseGuards(JwtAuthGuard)
  @Get('logs')
  async getLogs() {
    return this.prisma.webhookLog.findMany({
      orderBy: { received_at: 'desc' },
      take: 50,
    });
  }
}
