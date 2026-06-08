import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { UomsController, ProductUomsController } from './uoms.controller';
import { UomsService } from './uoms.service';

@Module({
  imports: [TenantModule],
  controllers: [UomsController, ProductUomsController],
  providers: [UomsService, PermissionGuard],
  exports: [UomsService],
})
export class UomsModule {}
