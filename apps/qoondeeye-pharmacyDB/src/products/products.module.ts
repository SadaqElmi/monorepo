import { Module } from '@nestjs/common';
import { AppCacheModule } from '../cache/app-cache.module';
import { TenantModule } from '../tenant/tenant.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [TenantModule, AppCacheModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
