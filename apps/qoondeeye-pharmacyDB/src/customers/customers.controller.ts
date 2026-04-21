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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
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
    return this.customersService.findAll(this.tenantContext.getSchemaName()!);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    this.ensureTenant();
    return this.customersService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    this.ensureTenant();
    return this.customersService.create(
      this.tenantContext.getSchemaName()!,
      dto,
    );
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    this.ensureTenant();
    return this.customersService.update(
      this.tenantContext.getSchemaName()!,
      id,
      dto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.ensureTenant();
    return this.customersService.remove(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }
}
