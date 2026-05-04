import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantContextService } from './tenant-context.service';
import { TenantSchemaBootstrapService } from './tenant-schema-bootstrap.service';
import { TenantsController } from './tenants.controller';

@Module({
  controllers: [TenantsController],
  providers: [
    TenantService,
    TenantContextService,
    TenantSchemaBootstrapService,
  ],
  exports: [TenantService, TenantContextService],
})
export class TenantModule {}
