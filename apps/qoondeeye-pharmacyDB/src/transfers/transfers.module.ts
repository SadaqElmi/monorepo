import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { OpsMonitoringService } from '../common/services/ops-monitoring.service';
import { InventoryModule } from '../inventory/inventory.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { TenantModule } from '../tenant/tenant.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { TransfersController } from './transfers.controller';
import { TransferRepairController } from './transfer-repair.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [
    TenantModule,
    InventoryModule,
    AccountingModule,
    ReconciliationModule,
  ],
  controllers: [TransfersController, TransferRepairController],
  providers: [TransfersService, OpsMonitoringService, PermissionGuard],
})
export class TransfersModule {}
