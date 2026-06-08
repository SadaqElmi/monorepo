import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Req,
  Query,
  BadRequestException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { parsePagedQueryParam } from '../common/pagination.util';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { ProductsService } from './products.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
@UseGuards(PermissionGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions('view_products')
  async findAll(
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { schema, tenantId } = this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    const paged = parsePagedQueryParam(page, limit);
    if (paged) {
      return this.productsService.findAllPaged(
        schema,
        allowedBranchIds,
        paged.skip,
        paged.limit,
      );
    }
    return this.productsService.findAll(schema, tenantId, allowedBranchIds);
  }

  /** All products in the tenant (for purchases, stock views). Explicitly not branch-filtered. */
  @Get('catalog')
  @RequirePermissions('view_products')
  async findCatalog() {
    const { schema, tenantId } = this.ensureTenant();
    return this.productsService.findAllTenantCatalog(schema, tenantId);
  }

  /** Transfer picker catalog scoped to active branch visibility and stock rows. */
  @Get('transfer-catalog')
  @RequirePermissions('view_products')
  async findTransferCatalog(@Req() req: FastifyRequest) {
    const { schema } = this.ensureTenant();
    return this.productsService.findTransferCatalog(
      schema,
      req.allowedBranchIds ?? [],
    );
  }

  /** Id, barcode, or name search (for items-by-location, POS helpers). */
  @Get('lookup')
  @RequirePermissions('view_products')
  async lookup(@Req() req: FastifyRequest, @Query('q') q: string) {
    const { schema } = this.ensureTenant();
    return this.productsService.lookup(
      schema,
      q ?? '',
      req.allowedBranchIds ?? [],
    );
  }

  @Get('barcode/:barcode')
  @RequirePermissions('view_products')
  async findByBarcode(
    @Req() req: FastifyRequest,
    @Param('barcode') barcode: string,
  ) {
    const { schema } = this.ensureTenant();
    const decoded = decodeURIComponent(barcode);
    const row = await this.productsService.findByBarcode(
      schema,
      decoded,
      req.allowedBranchIds ?? [],
    );
    if (!row) {
      throw new NotFoundException('No product for this barcode');
    }
    return row;
  }

  @Get(':id/suppliers')
  @RequirePermissions('view_products')
  async listSuppliers(@Req() req: FastifyRequest, @Param('id') id: string) {
    const { schema } = this.ensureTenant();
    return this.productsService.listSuppliers(
      schema,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Post(':id/suppliers')
  @RequirePermissions('edit_product')
  async addSupplier(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body()
    dto: {
      supplierId: string;
      isPreferred?: boolean;
      lastCostPrice?: number | null;
      supplierItemCode?: string | null;
    },
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.productsService.addSupplier(
      schema,
      tenantId,
      id,
      req.allowedBranchIds ?? [],
      dto,
    );
  }

  @Patch(':id/suppliers/:supplierId')
  @RequirePermissions('edit_product')
  async updateSupplierLink(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('supplierId') supplierId: string,
    @Body()
    dto: {
      isPreferred?: boolean;
      lastCostPrice?: number | null;
      supplierItemCode?: string | null;
    },
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.productsService.updateSupplierLink(
      schema,
      tenantId,
      id,
      supplierId,
      req.allowedBranchIds ?? [],
      dto,
    );
  }

  @Delete(':id/suppliers/:supplierId')
  @RequirePermissions('edit_product')
  async removeSupplier(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('supplierId') supplierId: string,
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.productsService.removeSupplier(
      schema,
      tenantId,
      id,
      supplierId,
      req.allowedBranchIds ?? [],
    );
  }

  @Post(':id/suppliers/:supplierId/preferred')
  @RequirePermissions('edit_product')
  async setPreferredSupplier(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('supplierId') supplierId: string,
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.productsService.setPreferredSupplier(
      schema,
      tenantId,
      id,
      supplierId,
      req.allowedBranchIds ?? [],
    );
  }

  @Get(':id')
  @RequirePermissions('view_products')
  async findOne(@Req() req: FastifyRequest, @Param('id') id: string) {
    const { schema } = this.ensureTenant();
    return this.productsService.findOne(schema, id, req.allowedBranchIds ?? []);
  }

  @Post()
  @RequirePermissions('create_product')
  async create(@Body() dto: CreateProductDto) {
    const { schema, tenantId } = this.ensureTenant();
    return this.productsService.create(schema, tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions('edit_product')
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.productsService.update(
      schema,
      tenantId,
      id,
      dto,
      req.allowedBranchIds ?? [],
    );
  }

  @Delete(':id')
  @RequirePermissions('delete_product')
  async remove(@Req() req: FastifyRequest, @Param('id') id: string) {
    const { schema, tenantId } = this.ensureTenant();
    return this.productsService.remove(
      schema,
      tenantId,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  private ensureTenant(): { schema: string; tenantId: string } {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1) or subdomain.',
      );
    }
    return { schema: tenant.schemaName, tenantId: tenant.id };
  }
}
