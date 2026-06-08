import { Module } from '@nestjs/common';
import { AppCacheModule } from '../cache/app-cache.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { TenantModule } from '../tenant/tenant.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  imports: [TenantModule, AppCacheModule],
  controllers: [BranchesController],
  providers: [BranchesService, PermissionGuard],
  exports: [BranchesService],
})
export class BranchesModule {}
