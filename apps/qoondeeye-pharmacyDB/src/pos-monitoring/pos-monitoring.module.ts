import { Module } from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { PosMonitoringController } from './pos-monitoring.controller';
import { PosMonitoringService } from './pos-monitoring.service';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [PosMonitoringController],
  providers: [PosMonitoringService, PermissionGuard],
  exports: [PosMonitoringService],
})
export class PosMonitoringModule {}
