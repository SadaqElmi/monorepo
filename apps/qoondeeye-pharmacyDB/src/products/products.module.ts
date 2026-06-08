import { Module } from '@nestjs/common';
import { AppCacheModule } from '../cache/app-cache.module';
import { TenantModule } from '../tenant/tenant.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { UomsModule } from '../uoms/uoms.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [TenantModule, AppCacheModule, UomsModule],
  controllers: [ProductsController],
  providers: [ProductsService, PermissionGuard],
  exports: [ProductsService],
})
export class ProductsModule {}
