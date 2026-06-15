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
import { CreateCashMovementDto } from './dto/cash-movement.dto';
import { PosCashDrawerService } from './pos-cash-drawer.service';

@Controller('pos')
export class PosCashDrawerController {
  constructor(
    private readonly cashDrawerService: PosCashDrawerService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private schema() {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) throw new BadRequestException('Tenant context required');
    return tenant.schemaName;
  }

  @Post('sessions/:sessionId/cash-movements')
  createMovement(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateCashMovementDto,
    @Req() req: FastifyRequest,
  ) {
    if (!req.branchId) throw new BadRequestException('Branch required');
    return this.cashDrawerService.createMovement(
      this.schema(),
      sessionId,
      req.branchId,
      dto,
      req.userId ?? null,
    );
  }

  @Get('sessions/:sessionId/cash-movements')
  listMovements(
    @Param('sessionId') sessionId: string,
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!req.branchId) throw new BadRequestException('Branch required');
    const p = Math.max(0, (Number(page) || 1) - 1);
    const l = Number(limit) || 100;
    return this.cashDrawerService.listSessionMovements(
      this.schema(),
      sessionId,
      req.branchId,
      p * l,
      l,
    );
  }

  @Get('sessions/:sessionId/drawer-balance')
  drawerBalance(
    @Param('sessionId') sessionId: string,
    @Req() req: FastifyRequest,
  ) {
    if (!req.branchId) throw new BadRequestException('Branch required');
    return this.cashDrawerService.getDrawerBalance(
      this.schema(),
      sessionId,
      req.branchId,
    );
  }

  @Get('reports/cash-movements')
  report(
    @Req() req: FastifyRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sessionId') sessionId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!req.branchId) throw new BadRequestException('Branch required');
    const p = Math.max(0, (Number(page) || 1) - 1);
    const l = Number(limit) || 50;
    return this.cashDrawerService.reportMovements(this.schema(), req.branchId, {
      from,
      to,
      sessionId,
      skip: p * l,
      limit: l,
    });
  }
}
