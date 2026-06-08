import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { TenantModule } from '../tenant/tenant.module';
import { UomsModule } from '../uoms/uoms.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [
    TenantModule,
    InventoryModule,
    AccountingModule,
    UomsModule,
    CustomersModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, PermissionGuard],
  exports: [SalesService],
})
export class SalesModule {}
