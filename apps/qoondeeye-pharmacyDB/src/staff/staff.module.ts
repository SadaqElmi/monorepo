import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [TenantModule],
  controllers: [StaffController],
  providers: [StaffService, PermissionGuard],
  exports: [StaffService],
})
export class StaffModule {}
