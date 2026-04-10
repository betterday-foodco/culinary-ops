import { Injectable, Logger } from '@nestjs/common';

/**
 * CorporateParSchedulerService — stub
 * Full implementation requires @nestjs/schedule and expanded Prisma schema.
 * Par cart auto-rebuild will be enabled once schema sync with Conner is complete.
 */
@Injectable()
export class CorporateParSchedulerService {
  private readonly logger = new Logger(CorporateParSchedulerService.name);

  constructor() {
    this.logger.log('Par scheduler: stub mode (awaiting schema sync)');
  }
}
