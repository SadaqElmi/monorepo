import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

@Module({
  imports: [TenantModule],
  controllers: [OffersController],
  providers: [OffersService, PermissionGuard],
  exports: [OffersService],
})
export class OffersModule {}
