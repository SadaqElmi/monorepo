import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { AccountingModule } from '../accounting/accounting.module';
import { BatchesModule } from '../batches/batches.module';
import { CategoriesModule } from '../categories/categories.module';
import { ProductsModule } from '../products/products.module';
import { UomsModule } from '../uoms/uoms.module';
import { PosSessionsController } from './pos-sessions.controller';
import { PosSessionsService } from './pos-sessions.service';

@Module({
  imports: [
    PrismaModule,
    TenantModule,
    AccountingModule,
    ProductsModule,
    UomsModule,
    BatchesModule,
    CategoriesModule,
  ],
  controllers: [PosSessionsController],
  providers: [PosSessionsService],
  exports: [PosSessionsService],
})
export class PosSessionsModule {}
