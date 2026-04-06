import { Module } from '@nestjs/common';
import { MealPrepSyncController } from './mealprep-sync.controller';
import { MealPrepSyncService } from './mealprep-sync.service';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [SystemConfigModule],
  controllers: [MealPrepSyncController],
  providers: [MealPrepSyncService],
})
export class MealPrepSyncModule {}
