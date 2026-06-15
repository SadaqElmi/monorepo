import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { PosTerminalsModule } from './pos-terminals/pos-terminals.module';
import { PosSyncModule } from './pos-sync/pos-sync.module';
import { PosApprovalsModule } from './pos-approvals/pos-approvals.module';
import { PosCashDrawerModule } from './pos-cash-drawer/pos-cash-drawer.module';
import { PosReceiptsModule } from './pos-receipts/pos-receipts.module';
import { PosMonitoringModule } from './pos-monitoring/pos-monitoring.module';
import { PosAnalyticsModule } from './pos-analytics/pos-analytics.module';
import { PosDevicesModule } from './pos-devices/pos-devices.module';
import { PosSecurityModule } from './pos-security/pos-security.module';
import { AdminPosOpsModule } from './admin-pos-ops/admin-pos-ops.module';
import { AdminTenantsModule } from './admin-tenants/admin-tenants.module';
import { AppCacheModule } from './cache/app-cache.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { LoggingModule } from './common/logging/logging.module';
import { RequestContextMiddleware } from './common/logging/request-context.middleware';
import { BranchScopeGuard } from './common/security/branch-scope.guard';
import { ImportModule } from './import/import.module';
import { UomsModule } from './uoms/uoms.module';
import { PricingModule } from './pricing/pricing.module';
import { OffersModule } from './offers/offers.module';
import { TransactionRegisterModule } from './transaction-register/transaction-register.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    AppCacheModule,
    LoggingModule,
    RateLimitModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    TenantModule,
    AuthModule,
    HealthModule,
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
    PosTerminalsModule,
    PosSyncModule,
    PosApprovalsModule,
    PosCashDrawerModule,
    PosReceiptsModule,
    PosMonitoringModule,
    PosAnalyticsModule,
    PosDevicesModule,
    PosSecurityModule,
    AdminPosOpsModule,
    AdminTenantsModule,
    ImportModule,
    UomsModule,
    PricingModule,
    OffersModule,
    TransactionRegisterModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    TenantMiddleware,
    BranchMiddleware,
    BranchScopeGuard,
    OpsMonitoringService,
    IdempotencyService,
    IdempotencyCleanupJob,
    {
      provide: APP_GUARD,
      useClass: BranchScopeGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestContextMiddleware, TenantMiddleware, BranchMiddleware)
      .forRoutes('*');
  }
}
