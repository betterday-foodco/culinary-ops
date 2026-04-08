import { Module } from '@nestjs/common';
import { SystemConfigController } from './system-config.controller';
import { SystemConfigPublicController } from './system-config-public.controller';
import { SystemConfigService } from './system-config.service';

@Module({
  controllers: [SystemConfigController, SystemConfigPublicController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
