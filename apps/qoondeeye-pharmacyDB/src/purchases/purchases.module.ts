import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { TenantModule } from '../tenant/tenant.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { UomsModule } from '../uoms/uoms.module';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { PurchasesWorkflowService } from './purchases-workflow.service';

@Module({
  imports: [TenantModule, InventoryModule, AccountingModule, UomsModule],
  controllers: [PurchasesController],
  providers: [PurchasesService, PurchasesWorkflowService, PermissionGuard],
  exports: [PurchasesService, PurchasesWorkflowService],
})
export class PurchasesModule {}
