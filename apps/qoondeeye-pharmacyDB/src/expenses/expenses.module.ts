import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { TenantModule } from '../tenant/tenant.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [TenantModule, AccountingModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
