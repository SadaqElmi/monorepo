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
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { parsePagedQueryParam } from '../common/pagination.util';
import { ProductsService } from './products.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
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
  async findCatalog() {
    const { schema, tenantId } = this.ensureTenant();
    return this.productsService.findAllTenantCatalog(schema, tenantId);
  }

  /** Transfer picker catalog scoped to active branch visibility and stock rows. */
  @Get('transfer-catalog')
  async findTransferCatalog(@Req() req: FastifyRequest) {
    const { schema } = this.ensureTenant();
    return this.productsService.findTransferCatalog(
      schema,
      req.allowedBranchIds ?? [],
    );
  }

  /** Id, barcode, or name search (for items-by-location, POS helpers). */
  @Get('lookup')
  async lookup(@Req() req: FastifyRequest, @Query('q') q: string) {
    const { schema } = this.ensureTenant();
    return this.productsService.lookup(
      schema,
      q ?? '',
      req.allowedBranchIds ?? [],
    );
  }

  @Get('barcode/:barcode')
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

  @Get(':id')
  async findOne(@Req() req: FastifyRequest, @Param('id') id: string) {
    const { schema } = this.ensureTenant();
    return this.productsService.findOne(
      schema,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Post()
  async create(@Body() dto: CreateProductDto) {
    const { schema, tenantId } = this.ensureTenant();
    return this.productsService.create(schema, tenantId, dto);
  }

  @Patch(':id')
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
