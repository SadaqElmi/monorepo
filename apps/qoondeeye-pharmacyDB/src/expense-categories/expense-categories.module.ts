import { Module } from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { TenantModule } from '../tenant/tenant.module';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { ExpenseCategoriesService } from './expense-categories.service';

@Module({
  imports: [TenantModule],
  controllers: [ExpenseCategoriesController],
  providers: [ExpenseCategoriesService, PermissionGuard],
  exports: [ExpenseCategoriesService],
})
export class ExpenseCategoriesModule {}
