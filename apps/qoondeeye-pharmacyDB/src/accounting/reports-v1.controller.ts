import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import { ConsolidationEngineService } from './consolidation-engine.service';
import { CreateConsolidationRunDto } from './dto/create-consolidation-run.dto';
import { ReverseConsolidationRunDto } from './dto/reverse-consolidation-run.dto';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';

/**
 * Version-stable surface for consolidation APIs (`/api/v1/reports/...`).
 * Mirrors legacy `/api/reports/...` contracts; additive fields may appear in responses.
 */
@Controller('v1/reports')
export class ReportsV1Controller {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tenantService: TenantService,
    private readonly consolidationEngine: ConsolidationEngineService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  @Post('consolidation/run')
  @UseGuards(PermissionGuard)
  @RequirePermissions('run_consolidation')
  async runConsolidation(
    @Req() req: Request,
    @Body() body: CreateConsolidationRunDto,
  ) {
    this.ensureTenant();
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const scopeHash =
      body.scopeHash?.trim() ||
      (body.entityId?.trim()
        ? `scope:entity:${body.entityId.trim()}`
        : 'scope:unspecified');
    return this.consolidationEngine.runConsolidation({
      schemaName: schema,
      periodKey: body.periodKey?.trim(),
      asOfDate: body.asOfDate?.trim(),
      fromDate: body.fromDate?.trim(),
      toDate: body.toDate?.trim(),
      scopeHash,
      branchIds: body.branchIds ?? [],
      entityId: body.entityId?.trim() || undefined,
      asOfFxDate: body.asOfFxDate?.trim(),
      groupCurrency: body.groupCurrency?.trim(),
      ratePolicy: body.ratePolicy,
      fxPolicy: body.fxPolicy,
      includeAdjustments: body.includeAdjustments,
      actorUserId: req.userId ?? null,
      dryRun: body.dryRun === true,
      asDraft: body.asDraft === true,
      replaceDraftRunId: body.replaceDraftRunId?.trim(),
    });
  }

  @Post('consolidation/runs/:runId/reverse')
  @UseGuards(PermissionGuard)
  @RequirePermissions('reverse_consolidation')
  async reverseConsolidation(
    @Req() req: Request,
    @Param('runId') runId: string,
    @Body() body: ReverseConsolidationRunDto,
  ) {
    this.ensureTenant();
    if (!/^[0-9a-f-]{36}$/i.test(runId)) {
      throw new BadRequestException('Invalid consolidation run id');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const run = await this.consolidationEngine.reverseConsolidationRun({
      schemaName: schema,
      runId,
      actorUserId: req.userId ?? null,
      reason: body.reason,
    });
    return { run };
  }

  @Post('consolidation/runs/:runId/finalize')
  @UseGuards(PermissionGuard)
  @RequirePermissions('finalize_consolidation')
  async finalizeConsolidation(
    @Req() req: Request,
    @Param('runId') runId: string,
  ) {
    this.ensureTenant();
    if (!/^[0-9a-f-]{36}$/i.test(runId)) {
      throw new BadRequestException('Invalid consolidation run id');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const run = await this.consolidationEngine.finalizeConsolidationRun({
      schemaName: schema,
      runId,
      actorUserId: req.userId ?? null,
    });
    return { run };
  }

  @Get('consolidation/runs')
  @UseGuards(PermissionGuard)
  @RequirePermissions('view_consolidation_history')
  async consolidationRuns(
    @Req() req: Request,
    @Query('scopeHash') scopeHash?: string,
    @Query('entityId') entityId?: string,
    @Query('periodKey') periodKey?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const rows = await this.consolidationEngine.listRuns({
      schemaName: schema,
      scopeHash: scopeHash?.trim(),
      entityId: entityId?.trim(),
      periodKey: periodKey?.trim(),
      limit: Number(limit ?? 50),
    });
    return { items: rows, requestedBy: req.userId ?? null };
  }

  @Get('consolidation/runs/:runId')
  @UseGuards(PermissionGuard)
  @RequirePermissions('view_consolidation_history')
  async consolidationRunDetail(@Param('runId') runId: string) {
    this.ensureTenant();
    if (!/^[0-9a-f-]{36}$/i.test(runId)) {
      throw new BadRequestException('Invalid consolidation run id');
    }
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.consolidationEngine.getRun({ schemaName: schema, runId });
  }
}
