import { Module } from '@nestjs/common';
import { CorporateSyncService } from './corporate-sync.service';
import { CorporateSyncController } from './corporate-sync.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CorporateSyncController],
  providers: [CorporateSyncService],
  exports: [CorporateSyncService],
})
export class CorporateSyncModule {}
