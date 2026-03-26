import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MenuQueueController } from './menu-queue.controller';
import { MenuQueueService } from './menu-queue.service';

@Module({
  imports: [PrismaModule],
  controllers: [MenuQueueController],
  providers: [MenuQueueService],
  exports: [MenuQueueService],
})
export class MenuQueueModule {}
