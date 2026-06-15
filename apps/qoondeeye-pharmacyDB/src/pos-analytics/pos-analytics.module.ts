import { Module } from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { PosAnalyticsController } from './pos-analytics.controller';
import { PosAnalyticsService } from './pos-analytics.service';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [PosAnalyticsController],
  providers: [PosAnalyticsService, PermissionGuard],
  exports: [PosAnalyticsService],
})
export class PosAnalyticsModule {}
