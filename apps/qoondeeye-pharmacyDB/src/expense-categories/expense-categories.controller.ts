import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ExpenseCategoriesService } from './expense-categories.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';

@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(
    private readonly expenseCategoriesService: ExpenseCategoriesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  @Get()
  findAll() {
    this.ensureTenant();
    return this.expenseCategoriesService.findAll(
      this.tenantContext.getSchemaName()!,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    this.ensureTenant();
    return this.expenseCategoriesService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }

  @Post()
  create(@Body() dto: CreateExpenseCategoryDto) {
    this.ensureTenant();
    return this.expenseCategoriesService.create(
      this.tenantContext.getSchemaName()!,
      dto,
    );
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    this.ensureTenant();
    return this.expenseCategoriesService.update(
      this.tenantContext.getSchemaName()!,
      id,
      dto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.ensureTenant();
    return this.expenseCategoriesService.remove(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }
}
