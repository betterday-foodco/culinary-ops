import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlanTastingController } from './plan-tasting.controller';
import { PlanTastingService } from './plan-tasting.service';

@Module({
  imports: [PrismaModule],
  controllers: [PlanTastingController],
  providers: [PlanTastingService],
})
export class PlanTastingModule {}
