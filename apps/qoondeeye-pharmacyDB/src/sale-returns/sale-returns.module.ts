import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { TenantModule } from '../tenant/tenant.module';
import { SaleReturnsController } from './sale-returns.controller';
import { SaleReturnsService } from './sale-returns.service';

@Module({
  imports: [TenantModule, InventoryModule, AccountingModule],
  controllers: [SaleReturnsController],
  providers: [SaleReturnsService, PermissionGuard],
  exports: [SaleReturnsService],
})
export class SaleReturnsModule {}
