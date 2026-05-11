import {
  Controller,
  Get,
  Param,
  BadRequestException,
  ForbiddenException,
  MessageEvent,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import { assertAllowedBranches } from '../common/branch-scope';
import { parsePagedQueryParam } from '../common/pagination.util';
import { InventoryHistoryService } from './inventory-history.service';
import { InventoryService } from './inventory.service';
import type { Request } from 'express';
import { Observable, from, interval } from 'rxjs';
import { map, startWith, switchMap } from 'rxjs/operators';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly inventoryHistoryService: InventoryHistoryService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantService: TenantService,
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

  /** Paginated unified stock movement timeline (sales, purchases, returns, transfers). */
  @Get('history')
  async history(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('branch_id') branch_id?: string,
    @Query('product_id') product_id?: string,
    @Query('action_type') action_type?: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Query('search') search?: string,
    @Query('branch_ids') branch_ids?: string,
  ) {
    this.ensureTenant();
    const paged = parsePagedQueryParam(page, limit, { maxLimit: 200 });
    if (!paged) {
      throw new BadRequestException(
        'Query parameter "page" is required for inventory history',
      );
    }
    const schemaName = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const allowed = assertAllowedBranches(req);
    let branchIds = allowed;
    const csv = branch_ids?.trim();
    if (csv) {
      const requested = csv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const intersected = requested.filter((id) => allowed.includes(id));
      if (intersected.length !== requested.length) {
        throw new ForbiddenException(
          'One or more branch_ids are outside your allowed scope',
        );
      }
      if (requested.length) {
        branchIds = intersected;
      }
    } else {
      const narrow = branch_id?.trim();
      if (narrow && narrow.toLowerCase() !== 'all') {
        if (!allowed.includes(narrow)) {
          throw new ForbiddenException('Branch not in your allowed scope');
        }
        branchIds = [narrow];
      }
    }
    return this.inventoryHistoryService.list(schemaName, {
      branchIds,
      page: paged.page,
      limit: paged.limit,
      skip: paged.skip,
      productId: product_id,
      actionType: action_type,
      startDate: start_date,
      endDate: end_date,
      search: search,
    });
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
