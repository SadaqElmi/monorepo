import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminPosOpsController } from './admin-pos-ops.controller';
import { AdminPosOpsService } from './admin-pos-ops.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminPosOpsController],
  providers: [AdminPosOpsService],
})
export class AdminPosOpsModule {}
