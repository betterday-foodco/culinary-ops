import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProductionNumbersController } from './production-numbers.controller';
import { ProductionNumbersService } from './production-numbers.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProductionNumbersController],
  providers: [ProductionNumbersService],
})
export class ProductionNumbersModule {}
