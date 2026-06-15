import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  ApprovePosApprovalDto,
  RequestAndApprovePosApprovalDto,
  RequestPosApprovalDto,
  VerifySupervisorPinDto,
} from './dto/pos-approval.dto';
import { PosApprovalsService } from './pos-approvals.service';

@Controller('pos/approvals')
export class PosApprovalsController {
  constructor(
    private readonly approvalsService: PosApprovalsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private tenantSchema() {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      throw new BadRequestException('Tenant context required');
    }
    return tenant.schemaName;
  }

  @Post('request-and-approve')
  requestAndApprove(
    @Body() dto: RequestAndApprovePosApprovalDto,
    @Req() req: FastifyRequest,
  ) {
    if (!req.branchId) {
      throw new BadRequestException('Branch required');
    }
    return this.approvalsService.requestAndApprove(
      this.tenantSchema(),
      req.branchId,
      dto,
      req.userId ?? null,
      null,
    );
  }

  @Post('request')
  request(@Body() dto: RequestPosApprovalDto, @Req() req: FastifyRequest) {
    if (!req.branchId) {
      throw new BadRequestException('Branch required');
    }
    return this.approvalsService.requestApproval(
      this.tenantSchema(),
      req.branchId,
      dto,
      req.userId ?? null,
      null,
    );
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ApprovePosApprovalDto,
    @Req() req: FastifyRequest,
  ) {
    if (!req.branchId) {
      throw new BadRequestException('Branch required');
    }
    return this.approvalsService.approve(
      this.tenantSchema(),
      req.branchId,
      id,
      dto,
      null,
    );
  }

  @Post('verify-supervisor')
  verifySupervisor(@Body() dto: VerifySupervisorPinDto) {
    return this.approvalsService.verifySupervisorPin(
      this.tenantSchema(),
      dto.staffId,
      dto.pin,
    );
  }

  @Get('pending')
  listPending(@Req() req: FastifyRequest, @Query('limit') limit?: string) {
    if (!req.branchId) {
      throw new BadRequestException('Branch required');
    }
    const n = limit ? Number(limit) : 50;
    return this.approvalsService.listPending(
      this.tenantSchema(),
      req.branchId,
      Number.isFinite(n) ? n : 50,
    );
  }
}
