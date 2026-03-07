import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KitchenStaffController } from './kitchen-staff.controller';
import { KitchenStaffService } from './kitchen-staff.service';

@Module({
  imports: [PrismaModule],
  controllers: [KitchenStaffController],
  providers: [KitchenStaffService],
})
export class KitchenStaffModule {}
