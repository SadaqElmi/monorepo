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
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  BulkPriceUpdateDto,
  CreatePriceGroupDto,
  PricingHistoryQueryDto,
  PricingProductsQueryDto,
  UpdatePriceGroupDto,
  UpdateProductPricingDto,
} from './dto/pricing.dto';
import { PricingService } from './pricing.service';

@Controller('pricing')
@UseGuards(PermissionGuard)
@RequirePermissions('manage_pricing')
export class PricingController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly pricingService: PricingService,
  ) {}

  @Get('products')
  listProducts(
    @Req() req: FastifyRequest,
    @Query() query: PricingProductsQueryDto,
  ) {
    const { schema } = this.ensureTenant();
    return this.pricingService.listProducts(
      schema,
      req.allowedBranchIds ?? [],
      query,
    );
  }

  @Patch('products/:productId')
  updateProductPricing(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductPricingDto,
    @Req() req: FastifyRequest,
  ) {
    const { schema } = this.ensureTenant();
    return this.pricingService.updateProductPricing(
      schema,
      productId,
      dto,
      req.userId ?? null,
    );
  }

  @Post('bulk-update')
  bulkUpdate(@Body() dto: BulkPriceUpdateDto, @Req() req: FastifyRequest) {
    const { schema } = this.ensureTenant();
    return this.pricingService.bulkUpdate(
      schema,
      req.allowedBranchIds ?? [],
      dto,
      req.userId ?? null,
    );
  }

  @Get('history')
  history(@Query() query: PricingHistoryQueryDto) {
    const { schema } = this.ensureTenant();
    return this.pricingService.history(schema, query);
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

@Controller('price-groups')
@UseGuards(PermissionGuard)
@RequirePermissions('manage_price_groups')
export class PriceGroupsController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly pricingService: PricingService,
  ) {}

  @Get()
  list() {
    const { schema } = this.ensureTenant();
    return this.pricingService.listPriceGroups(schema);
  }

  @Post()
  create(@Body() dto: CreatePriceGroupDto) {
    const { schema } = this.ensureTenant();
    return this.pricingService.createPriceGroup(schema, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePriceGroupDto) {
    const { schema } = this.ensureTenant();
    return this.pricingService.updatePriceGroup(schema, id, dto);
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
