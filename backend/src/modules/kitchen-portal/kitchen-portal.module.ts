import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProductionPlansModule } from '../production-plans/production-plans.module';
import { KitchenPortalController } from './kitchen-portal.controller';
import { KitchenPortalService } from './kitchen-portal.service';

@Module({
  imports: [PrismaModule, ProductionPlansModule],
  controllers: [KitchenPortalController],
  providers: [KitchenPortalService],
})
export class KitchenPortalModule {}
