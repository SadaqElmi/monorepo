import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { InventoryController } from './inventory.controller';
import { InventoryHistoryService } from './inventory-history.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [TenantModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryHistoryService],
  exports: [InventoryService, InventoryHistoryService],
})
export class InventoryModule {}
