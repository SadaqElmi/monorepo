import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, TenantModule],
  controllers: [HealthController],
})
export class HealthModule {}
