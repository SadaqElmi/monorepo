import { Module } from '@nestjs/common';
import { SaleReturnsModule } from '../sale-returns/sale-returns.module';
import { TenantModule } from '../tenant/tenant.module';
import { ReturnsController } from './returns.controller';

@Module({
  imports: [TenantModule, SaleReturnsModule],
  controllers: [ReturnsController],
})
export class ReturnsModule {}
