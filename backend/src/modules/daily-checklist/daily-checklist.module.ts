import { Module } from '@nestjs/common';
import { DailyChecklistController } from './daily-checklist.controller';
import { DailyChecklistService } from './daily-checklist.service';

@Module({
  controllers: [DailyChecklistController],
  providers: [DailyChecklistService],
})
export class DailyChecklistModule {}
