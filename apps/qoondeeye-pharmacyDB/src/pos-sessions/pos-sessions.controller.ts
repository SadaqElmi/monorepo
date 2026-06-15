import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { PosSessionsService } from './pos-sessions.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { OpenPosSessionDto } from './dto/open-pos-session.dto';
import { PatchStatementLineDto } from './dto/patch-statement-line.dto';
import { ListPosShiftsQueryDto } from './dto/list-pos-shifts.dto';
import { CurrentPosSessionQueryDto } from './dto/current-pos-session-query.dto';
import { RequirePermissions } from '../common/security/require-permissions.decorator';

@Controller('pos')
export class PosSessionsController {
  constructor(
    private readonly posSessionsService: PosSessionsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ensureTenant(): { schema: string; tenantId: string } {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
    return { schema: tenant.schemaName, tenantId: tenant.id };
  }

  /** Register catalog bundle (products + batches + categories) in one request. */
  @Get('register-catalog')
  getRegisterCatalog(@Req() req: FastifyRequest) {
    const { schema, tenantId } = this.ensureTenant();
    return this.posSessionsService.getRegisterCatalog(
      schema,
      tenantId,
      req.allowedBranchIds ?? [],
    );
  }

  @Post('sessions/open')
  openSession(@Body() dto: OpenPosSessionDto, @Req() req: FastifyRequest) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.openSession(
      this.tenantContext.getSchemaName()!,
      req.branchId,
      req.allowedBranchIds ?? [],
      {
        deviceId: dto.deviceId,
        staffUserId: dto.staffUserId,
        openingCash: dto.openingCash,
      },
    );
  }

  @Post('sessions/:sessionId/pause')
  pauseSession(@Param('sessionId') sessionId: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.pauseSession(
      this.tenantContext.getSchemaName()!,
      sessionId,
      req.branchId,
      req.allowedBranchIds ?? [],
    );
  }

  @Post('sessions/:sessionId/resume')
  resumeSession(@Param('sessionId') sessionId: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.resumeSession(
      this.tenantContext.getSchemaName()!,
      sessionId,
      req.branchId,
      req.allowedBranchIds ?? [],
    );
  }

  @Post('sessions/:sessionId/approve-variance')
  approveVariance(@Param('sessionId') sessionId: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    if (!req.userId) {
      throw new BadRequestException('Authentication required');
    }
    return this.posSessionsService.approveVariance(
      this.tenantContext.getSchemaName()!,
      sessionId,
      req.branchId,
      req.allowedBranchIds ?? [],
      req.userId,
    );
  }

  @Get('sessions/current')
  getCurrent(
    @Query() query: CurrentPosSessionQueryDto,
    @Req() req: FastifyRequest,
  ) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.getCurrentSession(
      this.tenantContext.getSchemaName()!,
      req.branchId,
      req.allowedBranchIds ?? [],
      query.deviceId,
    );
  }

  @Get('reports/shifts')
  @RequirePermissions('view_pos_terminals')
  listShifts(@Query() query: ListPosShiftsQueryDto, @Req() req: FastifyRequest) {
    const { tenantId } = this.ensureTenant();
    return this.posSessionsService.listShifts(
      tenantId,
      this.tenantContext.getSchemaName()!,
      req.allowedBranchIds ?? [],
      query,
    );
  }

  @Post('sessions/:sessionId/open-statement')
  openStatement(@Param('sessionId') sessionId: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.openStatement(
      this.tenantContext.getSchemaName()!,
      sessionId,
      req.branchId,
      req.allowedBranchIds ?? [],
    );
  }

  @Get('sessions/:sessionId/x-report')
  xReport(@Param('sessionId') sessionId: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.getXReport(
      this.tenantContext.getSchemaName()!,
      sessionId,
      req.branchId,
      req.allowedBranchIds ?? [],
    );
  }

  @Get('sessions/:sessionId/z-report')
  zReport(@Param('sessionId') sessionId: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.getZReport(
      this.tenantContext.getSchemaName()!,
      sessionId,
      req.branchId,
      req.allowedBranchIds ?? [],
    );
  }

  @Post('sessions/:sessionId/close')
  closeSession(
    @Param('sessionId') sessionId: string,
    @Body() body: { varianceApprovalId?: string },
    @Req() req: FastifyRequest,
  ) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.closeSession(
      this.tenantContext.getSchemaName()!,
      sessionId,
      req.branchId,
      req.allowedBranchIds ?? [],
      {
        varianceApprovalId: body?.varianceApprovalId,
        permissionCodes: req.permissionCodes ?? [],
      },
    );
  }

  @Patch('statements/:statementId/lines/:lineId')
  patchLine(
    @Param('statementId') statementId: string,
    @Param('lineId') lineId: string,
    @Body() dto: PatchStatementLineDto,
    @Req() req: FastifyRequest,
  ) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.patchStatementLine(
      this.tenantContext.getSchemaName()!,
      statementId,
      lineId,
      req.branchId,
      req.allowedBranchIds ?? [],
      dto.actualAmount,
    );
  }

  @Get('statements/:statementId')
  getStatement(@Param('statementId') statementId: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.getStatement(
      this.tenantContext.getSchemaName()!,
      statementId,
      req.branchId,
      req.allowedBranchIds ?? [],
    );
  }

  @Post('statements/:statementId/post')
  postStatement(
    @Param('statementId') statementId: string,
    @Body() body: { varianceApprovalId?: string },
    @Req() req: FastifyRequest,
  ) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.posSessionsService.postStatement(
      this.tenantContext.getSchemaName()!,
      statementId,
      req.branchId,
      req.allowedBranchIds ?? [],
      req.userId ?? null,
      {
        varianceApprovalId: body?.varianceApprovalId,
        permissionCodes: req.permissionCodes ?? [],
      },
    );
  }
}
