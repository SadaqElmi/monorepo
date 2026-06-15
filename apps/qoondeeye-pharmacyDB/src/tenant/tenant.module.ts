import { forwardRef, Module } from '@nestjs/common';
import { AdminTenantsModule } from '../admin-tenants/admin-tenants.module';
import { TenantService } from './tenant.service';import { TenantContextService } from './tenant-context.service';
import { TenantsController } from './tenants.controller';
import { TenantPrismaService } from './tenant-prisma.service';
import { TenantDatabaseProvisionerService } from './tenant-database-provisioner.service';
import { AdminPermissionGuard } from '../common/security/admin-permission.guard';

@Module({
  imports: [forwardRef(() => AdminTenantsModule)],
  controllers: [TenantsController],
  providers: [
    TenantService,
    TenantContextService,
    TenantPrismaService,
    TenantDatabaseProvisionerService,
    AdminPermissionGuard,
  ],
  exports: [TenantService, TenantContextService, TenantPrismaService],
})
export class TenantModule {}
