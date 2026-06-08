import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  CreateUomDto,
  UpdateProductUomDto,
  UpdateUomDto,
  UpsertProductUomDto,
} from './dto/uom.dto';
import { UomsService } from './uoms.service';

@Controller('uoms')
@UseGuards(PermissionGuard)
@RequirePermissions('edit_product')
export class UomsController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly uomsService: UomsService,
  ) {}

  @Get()
  list() {
    const { schema } = this.ensureTenant();
    return this.uomsService.listUoms(schema);
  }

  @Post()
  create(@Body() dto: CreateUomDto) {
    const { schema } = this.ensureTenant();
    return this.uomsService.createUom(schema, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUomDto) {
    const { schema } = this.ensureTenant();
    return this.uomsService.updateUom(schema, id, dto);
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

@Controller('products/:productId/uoms')
@UseGuards(PermissionGuard)
@RequirePermissions('edit_product')
export class ProductUomsController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly uomsService: UomsService,
  ) {}

  @Get()
  list(@Req() req: FastifyRequest, @Param('productId') productId: string) {
    const { schema } = this.ensureTenant();
    return this.uomsService.listProductUoms(
      schema,
      productId,
      req.allowedBranchIds ?? [],
    );
  }

  @Post()
  upsert(
    @Req() req: FastifyRequest,
    @Param('productId') productId: string,
    @Body() dto: UpsertProductUomDto,
  ) {
    const { schema } = this.ensureTenant();
    return this.uomsService.upsertProductUom(
      schema,
      productId,
      req.allowedBranchIds ?? [],
      dto,
    );
  }

  @Patch(':productUomId')
  update(
    @Req() req: FastifyRequest,
    @Param('productId') productId: string,
    @Param('productUomId') productUomId: string,
    @Body() dto: UpdateProductUomDto,
  ) {
    const { schema } = this.ensureTenant();
    return this.uomsService.updateProductUom(
      schema,
      productId,
      productUomId,
      req.allowedBranchIds ?? [],
      dto,
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
