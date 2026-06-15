import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { PosDevicesController } from './pos-devices.controller';
import { PosDevicesService } from './pos-devices.service';

@Module({
  imports: [PrismaModule, TenantModule, AuthModule],
  controllers: [PosDevicesController],
  providers: [PosDevicesService, PermissionGuard],
  exports: [PosDevicesService],
})
export class PosDevicesModule {}
