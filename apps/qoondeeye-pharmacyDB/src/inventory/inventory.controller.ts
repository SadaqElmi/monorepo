import {
  Controller,
  Get,
  Param,
  BadRequestException,
  ForbiddenException,
  MessageEvent,
  Req,
  Sse,
} from '@nestjs/common';
import { TenantContextService } from '../tenant/tenant-context.service';
import { InventoryService } from './inventory.service';
import type { Request } from 'express';
import { Observable, from, interval } from 'rxjs';
import { map, startWith, switchMap } from 'rxjs/operators';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  /** Periodic inventory snapshot for the current branch scope (MVP "real-time"). */
  @Sse('stream')
  inventoryStream(@Req() req: Request): Observable<MessageEvent> {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    const schemaName = this.tenantContext.getSchemaName()!;
    return interval(4000).pipe(
      startWith(0),
      switchMap(() =>
        from(this.inventoryService.findAll(schemaName, allowedBranchIds)),
      ),
      map((payload) => ({
        data: JSON.stringify({
          inventory: payload,
          at: new Date().toISOString(),
        }),
      })),
    );
  }

  @Get()
  findAll(@Req() req: Request) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.inventoryService.findAll(
      this.tenantContext.getSchemaName()!,
      allowedBranchIds,
    );
  }

  @Get('product/:productId/stock')
  stockByProduct(@Param('productId') productId: string, @Req() req: Request) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.inventoryService.stockByProduct(
      this.tenantContext.getSchemaName()!,
      productId,
      allowedBranchIds,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.inventoryService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }
}
