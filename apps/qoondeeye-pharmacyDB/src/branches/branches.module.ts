import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { AppCacheModule } from '../cache/app-cache.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { TenantModule } from '../tenant/tenant.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  imports: [TenantModule, AppCacheModule, AccountingModule],
  controllers: [BranchesController],
  providers: [BranchesService, PermissionGuard],
  exports: [BranchesService],
})
export class BranchesModule {}
