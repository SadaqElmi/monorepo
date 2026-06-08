import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  BadRequestException,
  ForbiddenException,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { parsePagedQueryParam } from '../common/pagination.util';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Controller('suppliers')
@UseGuards(PermissionGuard)
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  private paged(page?: string, limit?: string, defaultLimit = 50) {
    return parsePagedQueryParam(page ?? '1', limit, {
      defaultLimit,
      maxLimit: 200,
    })!;
  }

  private parseActive(active?: string): boolean | undefined {
    const value = active?.trim().toLowerCase();
    if (!value) return undefined;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return undefined;
  }

  private resolveBranchScope(req: FastifyRequest, branchId?: string) {
    const allowed = req.allowedBranchIds ?? [];
    if (!allowed.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    const requested = branchId?.trim();
    if (requested && requested !== 'all') {
      if (!allowed.includes(requested)) {
        throw new ForbiddenException('Access denied to this branch');
      }
      return [requested];
    }
    return allowed;
  }

  @RequirePermissions('view_suppliers')
  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('supplierType') supplierType?: 'local' | 'international',
    @Query('active') active?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const filters = {
      q,
      supplierType,
      active: this.parseActive(active),
    };
    const paged = parsePagedQueryParam(page, limit, {
      defaultLimit: 50,
      maxLimit: 200,
    });
    if (paged) {
      return this.suppliersService.findAllPaged(
        this.tenantContext.getSchemaName()!,
        filters,
        paged.page,
        paged.limit,
        paged.skip,
      );
    }
    return this.suppliersService.findAll(
      this.tenantContext.getSchemaName()!,
      filters,
    );
  }

  @RequirePermissions('view_suppliers')
  @Get('reports/products-by-supplier')
  productsBySupplierReport(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('q') q?: string,
    @Query('supplierType') supplierType?: 'local' | 'international',
    @Query('active') active?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const p = this.paged(page, limit);
    return this.suppliersService.productsBySupplierReport(
      this.tenantContext.getSchemaName()!,
      this.resolveBranchScope(req, branchId),
      {
        supplierId,
        q,
        supplierType,
        active: this.parseActive(active),
        page: p.page,
        limit: p.limit,
        skip: p.skip,
      },
    );
  }

  @RequirePermissions('view_suppliers')
  @Get('reports/purchases-by-supplier')
  purchasesBySupplierReport(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('q') q?: string,
    @Query('supplierType') supplierType?: 'local' | 'international',
    @Query('active') active?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const p = this.paged(page, limit);
    return this.suppliersService.purchasesBySupplierReport(
      this.tenantContext.getSchemaName()!,
      this.resolveBranchScope(req, branchId),
      {
        supplierId,
        q,
        supplierType,
        active: this.parseActive(active),
        from,
        to,
        page: p.page,
        limit: p.limit,
        skip: p.skip,
      },
    );
  }

  @RequirePermissions('view_suppliers')
  @Get('reports/top-by-spend')
  topSuppliersBySpendReport(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('q') q?: string,
    @Query('supplierType') supplierType?: 'local' | 'international',
    @Query('active') active?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const p = this.paged(page, limit);
    return this.suppliersService.topSuppliersBySpendReport(
      this.tenantContext.getSchemaName()!,
      this.resolveBranchScope(req, branchId),
      {
        supplierId,
        q,
        supplierType,
        active: this.parseActive(active),
        from,
        to,
        page: p.page,
        limit: p.limit,
        skip: p.skip,
      },
    );
  }

  @RequirePermissions('view_suppliers')
  @Get(':id/stats')
  stats(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
  ) {
    this.ensureTenant();
    return this.suppliersService.stats(
      this.tenantContext.getSchemaName()!,
      id,
      this.resolveBranchScope(req, branchId),
    );
  }

  @RequirePermissions('view_suppliers')
  @Get(':id/products')
  products(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const p = this.paged(page, limit);
    return this.suppliersService.products(
      this.tenantContext.getSchemaName()!,
      id,
      this.resolveBranchScope(req, branchId),
      p.page,
      p.limit,
      p.skip,
    );
  }

  @RequirePermissions('view_suppliers')
  @Get(':id/purchases')
  purchases(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query('branchId') branchId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const p = this.paged(page, limit);
    return this.suppliersService.purchases(
      this.tenantContext.getSchemaName()!,
      id,
      this.resolveBranchScope(req, branchId),
      p.page,
      p.limit,
      p.skip,
    );
  }

  @RequirePermissions('view_suppliers')
  @Get(':id/statement')
  statement(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const p = this.paged(page, limit);
    return this.suppliersService.statement(
      this.tenantContext.getSchemaName()!,
      id,
      this.resolveBranchScope(req, branchId),
      { from, to, page: p.page, limit: p.limit, skip: p.skip },
    );
  }

  @RequirePermissions('view_suppliers')
  @Get(':id/price-history')
  priceHistory(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query('productId') productId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const p = this.paged(page, limit);
    return this.suppliersService.priceHistory(
      this.tenantContext.getSchemaName()!,
      id,
      this.resolveBranchScope(req, branchId),
      { productId, from, to, page: p.page, limit: p.limit, skip: p.skip },
    );
  }

  @RequirePermissions('view_suppliers')
  @Get(':id')
  findOne(@Param('id') id: string) {
    this.ensureTenant();
    return this.suppliersService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }

  @Post()
  @RequirePermissions('create_supplier')
  create(@Req() req: FastifyRequest, @Body() dto: CreateSupplierDto) {
    this.ensureTenant();
    return this.suppliersService.create(
      this.tenantContext.getSchemaName()!,
      dto,
    );
  }

  @Patch(':id')
  @RequirePermissions('edit_supplier')
  update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    this.ensureTenant();
    return this.suppliersService.update(
      this.tenantContext.getSchemaName()!,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermissions('delete_supplier')
  remove(@Req() req: FastifyRequest, @Param('id') id: string) {
    this.ensureTenant();
    return this.suppliersService.remove(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }
}
