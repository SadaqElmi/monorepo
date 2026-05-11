import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BatchesModule } from './batches/batches.module';
import { BranchesModule } from './branches/branches.module';
import { CategoriesModule } from './categories/categories.module';
import { CustomersModule } from './customers/customers.module';
import { DomainsModule } from './domains/domains.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';
import { ExpensesModule } from './expenses/expenses.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PatientLoansModule } from './patient-loans/patient-loans.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { PurchasesModule } from './purchases/purchases.module';
import { SaleReturnsModule } from './sale-returns/sale-returns.module';
import { ReturnVouchersModule } from './return-vouchers/return-vouchers.module';
import { SalesModule } from './sales/sales.module';
import { RolesModule } from './roles/roles.module';
import { StaffModule } from './staff/staff.module';
import { SystemUsersModule } from './system-users/system-users.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TenantModule } from './tenant/tenant.module';
import { AuthModule } from './auth/auth.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { BranchMiddleware } from './common/middleware/branch.middleware';
import { TransactionsModule } from './transactions/transactions.module';
import { ReturnsModule } from './returns/returns.module';
import { AccountingModule } from './accounting/accounting.module';
import { TransfersModule } from './transfers/transfers.module';
import { IdempotencyCleanupJob } from './common/services/idempotency-cleanup.job';
import { IdempotencyService } from './common/services/idempotency.service';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { OpsMonitoringService } from './common/services/ops-monitoring.service';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { PosSessionsModule } from './pos-sessions/pos-sessions.module';
import { AppCacheModule } from './cache/app-cache.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppCacheModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    TenantModule,
    AuthModule,
    DomainsModule,
    CategoriesModule,
    ProductsModule,
    BranchesModule,
    SuppliersModule,
    CustomersModule,
    StaffModule,
    SystemUsersModule,
    ExpenseCategoriesModule,
    ExpensesModule,
    BatchesModule,
    PurchasesModule,
    SaleReturnsModule,
    ReturnVouchersModule,
    InventoryModule,
    SalesModule,
    TransactionsModule,
    ReturnsModule,
    RolesModule,
    PatientLoansModule,
    NotificationsModule,
    AccountingModule,
    TransfersModule,
    ReconciliationModule,
    PosSessionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    TenantMiddleware,
    BranchMiddleware,
    OpsMonitoringService,
    IdempotencyService,
    IdempotencyCleanupJob,
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware, BranchMiddleware).forRoutes('*');
  }
}
