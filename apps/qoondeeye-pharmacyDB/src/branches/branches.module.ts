import { Module } from '@nestjs/common';
import { AppCacheModule } from '../cache/app-cache.module';
import { TenantModule } from '../tenant/tenant.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

@Module({
  imports: [TenantModule, AppCacheModule],
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
