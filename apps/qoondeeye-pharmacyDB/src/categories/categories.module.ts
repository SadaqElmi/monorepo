import { Module } from '@nestjs/common';
import { AppCacheModule } from '../cache/app-cache.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { TenantModule } from '../tenant/tenant.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [TenantModule, AppCacheModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, PermissionGuard],
  exports: [CategoriesService],
})
export class CategoriesModule {}
