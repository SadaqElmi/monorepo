import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CategoriesService } from './categories.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  findAll(@Req() req: Request) {
    this.ensureTenant();
    return this.categoriesService.findAll(
      this.tenantContext.getSchemaName()!,
      req.allowedBranchIds ?? [],
    );
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    this.ensureTenant();
    return this.categoriesService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateCategoryDto) {
    this.ensureTenant();
    const global = dto.global !== false;
    if (!global && !req.branchId) {
      throw new BadRequestException(
        'Branch required when global is false (set x-branch-id header)',
      );
    }
    return this.categoriesService.create(
      this.tenantContext.getSchemaName()!,
      dto,
      global ? null : req.branchId!,
    );
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    this.ensureTenant();
    return this.categoriesService.update(
      this.tenantContext.getSchemaName()!,
      id,
      dto,
      req.allowedBranchIds ?? [],
    );
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    this.ensureTenant();
    return this.categoriesService.remove(
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
