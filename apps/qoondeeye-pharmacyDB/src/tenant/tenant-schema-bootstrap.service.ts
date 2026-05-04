import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from './tenant.service';

/**
 * Runs {@link TenantService.applyTenantSchemaPatches} for every active tenant once at startup
 * so all tenant schemas converge on the same tables/columns as new provisioning.
 *
 * Set `TENANT_SCHEMA_SYNC_ON_BOOT=false` to skip (e.g. many tenants / slow startup).
 */
@Injectable()
export class TenantSchemaBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TenantSchemaBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.TENANT_SCHEMA_SYNC_ON_BOOT === 'false') {
      this.logger.log(
        'Skipping tenant schema sync (TENANT_SCHEMA_SYNC_ON_BOOT=false)',
      );
      return;
    }

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { schemaName: true },
    });

    this.logger.log(
      `Applying schema patches to ${tenants.length} active tenant(s)...`,
    );

    let ok = 0;
    let failed = 0;
    for (const { schemaName } of tenants) {
      try {
        await this.tenantService.applyTenantSchemaPatches(schemaName);
        ok++;
      } catch (e) {
        failed++;
        this.logger.error(
          `Schema patch failed for ${schemaName}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    this.logger.log(
      `Tenant schema sync finished: ${ok} succeeded, ${failed} failed`,
    );
  }
}
