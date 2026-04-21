import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { SaleReturnsModule } from '../sale-returns/sale-returns.module';
import { ReturnVouchersController } from './return-vouchers.controller';
import { ReturnVouchersService } from './return-vouchers.service';

@Module({
  imports: [TenantModule, SaleReturnsModule],
  controllers: [ReturnVouchersController],
  providers: [ReturnVouchersService],
})
export class ReturnVouchersModule {}
