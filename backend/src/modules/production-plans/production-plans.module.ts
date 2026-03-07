import { Module } from '@nestjs/common';
import { ProductionPlansController } from './production-plans.controller';
import { ProductionPlansService } from './production-plans.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProductionPlansController],
  providers: [ProductionPlansService],
  exports: [ProductionPlansService],
})
export class ProductionPlansModule {}
