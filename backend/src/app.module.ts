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
import { KitchenStationsModule } from './modules/kitchen-stations/kitchen-stations.module';
import { DailyChecklistModule } from './modules/daily-checklist/daily-checklist.module';
import { SystemConfigModule } from './modules/system-config/system-config.module';
import { MealPrepWebhookModule } from './modules/mealprep-webhook/mealprep-webhook.module';
import { MealPrepSyncModule } from './modules/mealprep-sync/mealprep-sync.module';
import { CorporateSyncModule } from './modules/corporate-sync/corporate-sync.module';
import { CorporateModule } from './modules/corporate/corporate.module';
import { CommerceCustomersModule } from './modules/commerce-customers/commerce-customers.module';
import { CommerceCheckoutModule } from './modules/commerce-checkout/commerce-checkout.module';
import { HealthController } from './health.controller';
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
    KitchenStationsModule,
    DailyChecklistModule,
    SystemConfigModule,
    MealPrepWebhookModule,
    MealPrepSyncModule,
    CorporateSyncModule,
    CorporateModule,
    CommerceCustomersModule,
    CommerceCheckoutModule,
  ],
  controllers: [HealthController, ShopifyWebhookController],
  providers: [CostEngineService, ProductionEngineService],
})
export class AppModule {}
