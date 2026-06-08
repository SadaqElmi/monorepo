import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { UomsModule } from '../uoms/uoms.module';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';

@Module({
  imports: [TenantModule, UomsModule],
  controllers: [BatchesController],
  providers: [BatchesService],
  exports: [BatchesService],
})
export class BatchesModule {}
