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
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { parsePagedQueryParam } from '../common/pagination.util';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { CategoriesService } from './categories.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
@UseGuards(PermissionGuard)
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions('view_products')
  findAll(
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { schema, tenantId } = this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    const paged = parsePagedQueryParam(page, limit);
    if (paged) {
      return this.categoriesService.findAllPaged(
        schema,
        allowedBranchIds,
        paged.skip,
        paged.limit,
      );
    }
    return this.categoriesService.findAll(schema, tenantId, allowedBranchIds);
  }

  @Get(':id')
  @RequirePermissions('view_products')
  findOne(@Req() req: FastifyRequest, @Param('id') id: string) {
    const { schema } = this.ensureTenant();
    return this.categoriesService.findOne(
      schema,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Post()
  @RequirePermissions('edit_product')
  create(@Req() req: FastifyRequest, @Body() dto: CreateCategoryDto) {
    const { schema, tenantId } = this.ensureTenant();
    const global = dto.global !== false;
    if (!global && !req.branchId) {
      throw new BadRequestException(
        'Branch required when global is false (set x-branch-id header)',
      );
    }
    return this.categoriesService.create(
      schema,
      tenantId,
      dto,
      global ? null : req.branchId!,
    );
  }

  @Patch(':id')
  @RequirePermissions('edit_product')
  update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.categoriesService.update(
      schema,
      tenantId,
      id,
      dto,
      req.allowedBranchIds ?? [],
    );
  }

  @Delete(':id')
  @RequirePermissions('edit_product')
  remove(@Req() req: FastifyRequest, @Param('id') id: string) {
    const { schema, tenantId } = this.ensureTenant();
    return this.categoriesService.remove(
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
