import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CommercePrismaService } from './commerce-prisma.service';

/**
 * Global Prisma module. Exposes TWO separate Prisma clients:
 *
 *   - PrismaService         → culinary database (DATABASE_URL)
 *                             models: User, Ingredient, SubRecipe,
 *                             MealRecipe, ProductionPlan, Corporate*, ...
 *
 *   - CommercePrismaService → commerce database (COMMERCE_DATABASE_URL)
 *                             models: Customer, CustomerOrder,
 *                             Subscription, PaymentMethod, Coupon, ...
 *
 * Because this module is @Global(), any feature module in the app can
 * inject either service without importing PrismaModule explicitly.
 *
 * Bounded-context rule: culinary modules use PrismaService, commerce-*
 * modules use CommercePrismaService. Modules that need both (e.g., a
 * menu catalog endpoint that reads meals from culinary and decorates
 * them with customer-facing pricing from commerce) inject both.
 *
 * NEVER query across schemas via Prisma relations — they live in
 * different Neon projects with no FKs between them. Cross-database
 * joins happen at the application layer via two separate queries.
 */
@Global()
@Module({
  providers: [PrismaService, CommercePrismaService],
  exports: [PrismaService, CommercePrismaService],
})
export class PrismaModule {}
