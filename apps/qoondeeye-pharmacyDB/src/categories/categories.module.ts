import { Module } from '@nestjs/common';
import { AppCacheModule } from '../cache/app-cache.module';
import { TenantModule } from '../tenant/tenant.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [TenantModule, AppCacheModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
