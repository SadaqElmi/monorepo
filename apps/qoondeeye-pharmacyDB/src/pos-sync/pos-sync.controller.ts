import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TenantContextService } from '../tenant/tenant-context.service';
import { BatchSyncDto } from './dto/batch-sync.dto';
import { BatchSyncCashMovementsDto } from './dto/batch-sync-cash.dto';
import { PosSyncService } from './pos-sync.service';

@Controller('pos/sync')
export class PosSyncController {
  constructor(
    private readonly posSyncService: PosSyncService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post('batch')
  batchSync(@Body() dto: BatchSyncDto, @Req() req: FastifyRequest) {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header',
      );
    }
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSyncService.batchSync(
      tenant.schemaName,
      req.branchId,
      dto.sales,
      {
        actorUserId: req.userId,
        requestUserRole: req.userRole ?? null,
        permissionCodes: req.permissionCodes ?? [],
        authMode: req.authMode ?? null,
      },
    );
  }

  @Post('cash-movements/batch')
  batchSyncCashMovements(
    @Body() dto: BatchSyncCashMovementsDto,
    @Req() req: FastifyRequest,
  ) {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header',
      );
    }
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSyncService.batchSyncCashMovements(
      tenant.schemaName,
      req.branchId,
      dto.movements,
      req.userId ?? null,
    );
  }
}
