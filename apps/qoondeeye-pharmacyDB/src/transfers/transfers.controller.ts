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
import type { Request } from 'express';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { RejectTransferDto } from './dto/reject-transfer.dto';
import { UpdateTransferDto } from './dto/update-transfer.dto';
import { parsePagedQueryParam } from '../common/pagination.util';
import { TransfersService } from './transfers.service';

@Controller('transfers')
export class TransfersController {
  constructor(
    private readonly transfersService: TransfersService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  private eventContext(req: Request) {
    const pick = (v: string | string[] | undefined | null): string | null => {
      if (typeof v === 'string' && v.trim()) return v.trim();
      return null;
    };
    return {
      idempotencyKey: pick(
        req.idempotencyKey ?? req.headers['x-idempotency-key'],
      ),
      correlationId: pick(req.correlationId ?? req.headers['x-correlation-id']),
      causationId: pick(req.causationId ?? req.headers['x-causation-id']),
    };
  }

  @Get()
  list(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('from_branch_id') fromBranchId?: string,
    @Query('to_branch_id') toBranchId?: string,
    @Query('approval_state') approvalState?: string,
    @Query('branch_id') branchScopeId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const q = {
      status,
      from_branch_id: fromBranchId,
      to_branch_id: toBranchId,
      approval_state: approvalState,
      branch_id: branchScopeId?.trim(),
    };
    const paged = parsePagedQueryParam(page, limit);
    if (paged) {
      return this.transfersService.listPaged(
        this.tenantContext.getSchemaName()!,
        req.allowedBranchIds ?? [],
        q,
        paged.skip,
        paged.limit,
      );
    }
    return this.transfersService.list(
      this.tenantContext.getSchemaName()!,
      req.allowedBranchIds ?? [],
      q,
    );
  }

  @Get('monitoring/overview')
  monitoringOverview(@Req() req: Request) {
    this.ensureTenant();
    return this.transfersService.monitoringOverview(
      this.tenantContext.getSchemaName()!,
      req.allowedBranchIds ?? [],
    );
  }

  /** GET counts per status (optional `branch_id` = either endpoint). */
  @Get('summary/status-counts')
  statusCounts(
    @Req() req: Request,
    @Query('branch_id') branchScopeId?: string,
  ) {
    this.ensureTenant();
    return this.transfersService.statusCounts(
      this.tenantContext.getSchemaName()!,
      req.allowedBranchIds ?? [],
      branchScopeId?.trim()
        ? { branch_id: branchScopeId.trim() }
        : undefined,
    );
  }

  /** Must be registered before @Get(':id') */
  @Get(':id/events')
  getEvents(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.transfersService.getEvents(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.transfersService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Post()
  create(@Body() dto: CreateTransferDto, @Req() req: Request) {
    this.ensureTenant();
    return this.transfersService.create(
      this.tenantContext.getSchemaName()!,
      dto,
      req.branchId!,
      req.userId ?? null,
      null,
      this.eventContext(req),
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTransferDto,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    return this.transfersService.update(
      this.tenantContext.getSchemaName()!,
      id,
      dto,
      req.branchId!,
      req.allowedBranchIds ?? [],
      req.userId ?? null,
      this.eventContext(req),
    );
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.transfersService.confirm(
      this.tenantContext.getSchemaName()!,
      id,
      req.branchId!,
      req.allowedBranchIds ?? [],
      { userId: req.userId ?? null, userRole: req.userRole ?? null },
      this.eventContext(req),
    );
  }

  @Post(':id/request-approval')
  requestApproval(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.transfersService.requestApproval(
      this.tenantContext.getSchemaName()!,
      id,
      req.branchId!,
      req.allowedBranchIds ?? [],
      { userId: req.userId ?? null, userRole: req.userRole ?? null },
      this.eventContext(req),
    );
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.transfersService.approve(
      this.tenantContext.getSchemaName()!,
      id,
      req.branchId!,
      req.allowedBranchIds ?? [],
      { userId: req.userId ?? null, userRole: req.userRole ?? null },
      this.eventContext(req),
    );
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: RejectTransferDto,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    return this.transfersService.reject(
      this.tenantContext.getSchemaName()!,
      id,
      req.branchId!,
      req.allowedBranchIds ?? [],
      { userId: req.userId ?? null, userRole: req.userRole ?? null },
      body?.reason,
      this.eventContext(req),
    );
  }

  @Post(':id/ship')
  ship(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.transfersService.ship(
      this.tenantContext.getSchemaName()!,
      id,
      req.branchId!,
      req.allowedBranchIds ?? [],
      { userId: req.userId ?? null, userRole: req.userRole ?? null },
      this.eventContext(req),
    );
  }

  @Post(':id/receive')
  receive(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.transfersService.receive(
      this.tenantContext.getSchemaName()!,
      id,
      req.branchId!,
      req.allowedBranchIds ?? [],
      { userId: req.userId ?? null, userRole: req.userRole ?? null },
      this.eventContext(req),
    );
  }

  @Post(':id/close')
  close(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.transfersService.close(
      this.tenantContext.getSchemaName()!,
      id,
      req.branchId!,
      req.allowedBranchIds ?? [],
      { userId: req.userId ?? null, userRole: req.userRole ?? null },
      this.eventContext(req),
    );
  }

  @Post(':id/reverse')
  reverse(
    @Param('id') id: string,
    @Body() body: RejectTransferDto,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    return this.transfersService.reverse(
      this.tenantContext.getSchemaName()!,
      id,
      req.branchId!,
      req.allowedBranchIds ?? [],
      { userId: req.userId ?? null, userRole: req.userRole ?? null },
      body?.reason,
      this.eventContext(req),
    );
  }
}
