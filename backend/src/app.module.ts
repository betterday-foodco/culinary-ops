import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { IngredientsModule } from './modules/ingredients/ingredients.module';
import { SubRecipesModule } from './modules/sub-recipes/sub-recipes.module';
import { MealsModule } from './modules/meals/meals.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductionModule } from './modules/production/production.module';
import { ProductionPlansModule } from './modules/production-plans/production-plans.module';
import { KitchenStaffModule } from './modules/kitchen-staff/kitchen-staff.module';
import { KitchenPortalModule } from './modules/kitchen-portal/kitchen-portal.module';
import { StationTasksModule } from './modules/station-tasks/station-tasks.module';
import { MenuQueueModule } from './modules/menu-queue/menu-queue.module';
import { PortionSpecsModule } from './modules/portion-specs/portion-specs.module';
import { PlanTastingModule } from './modules/plan-tasting/plan-tasting.module';
import { TagsModule } from './modules/tags/tags.module';
import { ProductionNumbersModule } from './modules/production-numbers/production-numbers.module';
import { ShopifyWebhookController } from './webhooks/shopify.controller';
import { CostEngineService } from './services/cost-engine.service';
import { ProductionEngineService } from './services/production-engine.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    IngredientsModule,
    SubRecipesModule,
    MealsModule,
    OrdersModule,
    ProductionModule,
    ProductionPlansModule,
    KitchenStaffModule,
    KitchenPortalModule,
    StationTasksModule,
    MenuQueueModule,
    PortionSpecsModule,
    PlanTastingModule,
    TagsModule,
    ProductionNumbersModule,
  ],
  controllers: [ShopifyWebhookController],
  providers: [CostEngineService, ProductionEngineService],
})
export class AppModule {}
