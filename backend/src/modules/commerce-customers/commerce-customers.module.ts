import { Module } from '@nestjs/common';
import { CommerceCustomersController } from './commerce-customers.controller';
import { CommerceCustomersService } from './commerce-customers.service';

/**
 * First commerce feature module. Exposes customer profile endpoints
 * (read own profile, edit profile fields, manage addresses, manage
 * payment methods) backed by the commerce Neon database via
 * CommercePrismaService.
 *
 * Does NOT provide its own PrismaService — it pulls CommercePrismaService
 * from the global PrismaModule (see backend/src/prisma/prisma.module.ts),
 * which is exported globally so no explicit import is needed here.
 */
@Module({
  controllers: [CommerceCustomersController],
  providers: [CommerceCustomersService],
  exports: [CommerceCustomersService],
})
export class CommerceCustomersModule {}
