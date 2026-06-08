import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { TransactionRegisterController } from './transaction-register.controller';
import { TransactionRegisterService } from './transaction-register.service';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [TransactionRegisterController],
  providers: [TransactionRegisterService, PermissionGuard],
  exports: [TransactionRegisterService],
})
export class TransactionRegisterModule {}
