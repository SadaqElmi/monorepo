import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [TenantModule, AccountingModule],
  controllers: [CustomersController],
  providers: [CustomersService, PermissionGuard],
  exports: [CustomersService],
})
export class CustomersModule {}
