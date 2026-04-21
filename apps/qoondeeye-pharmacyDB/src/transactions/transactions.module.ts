import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { TenantModule } from '../tenant/tenant.module';
import { TransactionsController } from './transactions.controller';

@Module({
  imports: [TenantModule, SalesModule],
  controllers: [TransactionsController],
})
export class TransactionsModule {}
