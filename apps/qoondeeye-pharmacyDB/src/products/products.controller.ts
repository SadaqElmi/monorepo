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
import type { Request } from 'express';
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
  async findAll(@Req() req: Request) {
    this.ensureTenant();
    return this.productsService.findAll(
      this.tenantContext.getSchemaName()!,
      req.allowedBranchIds ?? [],
    );
  }

  /** All products in the tenant (for purchases, stock views). Explicitly not branch-filtered. */
  @Get('catalog')
  async findCatalog() {
    this.ensureTenant();
    return this.productsService.findAllTenantCatalog(
      this.tenantContext.getSchemaName()!,
    );
  }

  /** Transfer picker catalog scoped to active branch visibility and stock rows. */
  @Get('transfer-catalog')
  async findTransferCatalog(@Req() req: Request) {
    this.ensureTenant();
    return this.productsService.findTransferCatalog(
      this.tenantContext.getSchemaName()!,
      req.allowedBranchIds ?? [],
    );
  }

  /** Id, barcode, or name search (for items-by-location, POS helpers). */
  @Get('lookup')
  async lookup(@Req() req: Request, @Query('q') q: string) {
    this.ensureTenant();
    return this.productsService.lookup(
      this.tenantContext.getSchemaName()!,
      q ?? '',
      req.allowedBranchIds ?? [],
    );
  }

  @Get('barcode/:barcode')
  async findByBarcode(@Req() req: Request, @Param('barcode') barcode: string) {
    this.ensureTenant();
    const decoded = decodeURIComponent(barcode);
    const row = await this.productsService.findByBarcode(
      this.tenantContext.getSchemaName()!,
      decoded,
      req.allowedBranchIds ?? [],
    );
    if (!row) {
      throw new NotFoundException('No product for this barcode');
    }
    return row;
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    this.ensureTenant();
    return this.productsService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateProductDto) {
    this.ensureTenant();
    return this.productsService.create(
      this.tenantContext.getSchemaName()!,
      dto,
    );
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    this.ensureTenant();
    return this.productsService.update(
      this.tenantContext.getSchemaName()!,
      id,
      dto,
      req.allowedBranchIds ?? [],
    );
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    this.ensureTenant();
    return this.productsService.remove(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1) or subdomain.',
      );
    }
  }
}
