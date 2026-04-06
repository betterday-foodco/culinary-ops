import { Module } from '@nestjs/common';
import { MealPrepWebhookController } from './mealprep-webhook.controller';
import { MealPrepWebhookService } from './mealprep-webhook.service';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [SystemConfigModule],
  controllers: [MealPrepWebhookController],
  providers: [MealPrepWebhookService],
})
export class MealPrepWebhookModule {}
