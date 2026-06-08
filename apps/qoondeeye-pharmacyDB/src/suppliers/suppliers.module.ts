import { Module } from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { TenantModule } from '../tenant/tenant.module';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [TenantModule],
  controllers: [SuppliersController],
  providers: [SuppliersService, PermissionGuard],
  exports: [SuppliersService],
})
export class SuppliersModule {}
