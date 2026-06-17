import { Module } from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { PosSecurityController } from './pos-security.controller';
import { PosSecurityService } from './pos-security.service';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [PosSecurityController],
  providers: [PosSecurityService, PermissionGuard],
  exports: [PosSecurityService],
})
export class PosSecurityModule {}
