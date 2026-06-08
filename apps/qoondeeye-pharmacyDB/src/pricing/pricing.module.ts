import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { PermissionGuard } from '../common/security/permission.guard';
import { PriceGroupsController, PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';

@Module({
  imports: [TenantModule],
  controllers: [PricingController, PriceGroupsController],
  providers: [PricingService, PermissionGuard],
  exports: [PricingService],
})
export class PricingModule {}
