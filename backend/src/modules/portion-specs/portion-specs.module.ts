import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PortionSpecsService } from './portion-specs.service';
import { PortionSpecsController } from './portion-specs.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PortionSpecsController],
  providers: [PortionSpecsService],
  exports: [PortionSpecsService],
})
export class PortionSpecsModule {}
