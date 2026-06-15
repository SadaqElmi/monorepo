import { Module } from '@nestjs/common';
import { PosCashDrawerModule } from '../pos-cash-drawer/pos-cash-drawer.module';
import { SalesModule } from '../sales/sales.module';
import { TenantModule } from '../tenant/tenant.module';
import { PosSyncController } from './pos-sync.controller';
import { PosSyncService } from './pos-sync.service';

@Module({
  imports: [SalesModule, TenantModule, PosCashDrawerModule],
  controllers: [PosSyncController],
  providers: [PosSyncService],
  exports: [PosSyncService],
})
export class PosSyncModule {}
