import { Module } from '@nestjs/common';
import { AppCacheModule } from '../cache/app-cache.module';
import { TenantModule } from '../tenant/tenant.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [TenantModule, AppCacheModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
