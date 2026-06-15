import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { PosCashDrawerController } from './pos-cash-drawer.controller';
import { PosCashDrawerService } from './pos-cash-drawer.service';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [PosCashDrawerController],
  providers: [PosCashDrawerService],
  exports: [PosCashDrawerService],
})
export class PosCashDrawerModule {}
