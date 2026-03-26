import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { StationTasksController } from './station-tasks.controller';
import { StationTasksService } from './station-tasks.service';

@Module({
  imports: [PrismaModule],
  controllers: [StationTasksController],
  providers: [StationTasksService],
  exports: [StationTasksService],
})
export class StationTasksModule {}
