import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { AdminPermissionGuard } from '../common/security/admin-permission.guard';
import { AdminTenantsController } from './admin-tenants.controller';
import { AdminTenantsService } from './admin-tenants.service';

@Module({
  imports: [PrismaModule, forwardRef(() => TenantModule)],
  controllers: [AdminTenantsController],
  providers: [AdminTenantsService, AdminPermissionGuard],
  exports: [AdminTenantsService],
})
export class AdminTenantsModule {}
