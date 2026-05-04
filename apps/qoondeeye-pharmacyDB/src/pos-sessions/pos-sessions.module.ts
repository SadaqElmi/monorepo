import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PosSessionsController } from './pos-sessions.controller';
import { PosSessionsService } from './pos-sessions.service';

@Module({
  imports: [PrismaModule, TenantModule, AccountingModule],
  controllers: [PosSessionsController],
  providers: [PosSessionsService],
  exports: [PosSessionsService],
})
export class PosSessionsModule {}
