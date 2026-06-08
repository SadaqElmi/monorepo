import { Module } from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { TenantModule } from '../tenant/tenant.module';
import { UomsModule } from '../uoms/uoms.module';
import { InventoryController } from './inventory.controller';
import { InventoryHistoryService } from './inventory-history.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [TenantModule, UomsModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryHistoryService, PermissionGuard],
  exports: [InventoryService, InventoryHistoryService],
})
export class InventoryModule {}
