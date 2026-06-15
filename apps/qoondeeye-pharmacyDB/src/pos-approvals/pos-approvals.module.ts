import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { PosApprovalsController } from './pos-approvals.controller';
import { PosApprovalsService } from './pos-approvals.service';

@Module({
  imports: [PrismaModule, TenantModule, AuthModule],
  controllers: [PosApprovalsController],
  providers: [PosApprovalsService],
  exports: [PosApprovalsService],
})
export class PosApprovalsModule {}
