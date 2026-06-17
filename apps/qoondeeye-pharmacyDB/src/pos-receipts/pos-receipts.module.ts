import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SalesModule } from '../sales/sales.module';
import { TenantModule } from '../tenant/tenant.module';
import { PosReceiptsController } from './pos-receipts.controller';
import { PosReceiptsService } from './pos-receipts.service';

@Module({
  imports: [PrismaModule, TenantModule, SalesModule],
  controllers: [PosReceiptsController],
  providers: [PosReceiptsService],
  exports: [PosReceiptsService],
})
export class PosReceiptsModule {}
