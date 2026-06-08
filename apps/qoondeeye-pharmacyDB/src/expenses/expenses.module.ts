import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { TenantModule } from '../tenant/tenant.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [TenantModule, AccountingModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, PermissionGuard],
  exports: [ExpensesService],
})
export class ExpensesModule {}
