import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Patch,
  Delete,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  async findAll() {
    return this.tenantService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.tenantService.findOne(id);
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(@Body() dto: CreateTenantDto) {
    return this.tenantService.create({
      name: dto.name,
      domain: dto.domain,
      schemaName: dto.schemaName,
      domains: dto.domains,
    });
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantService.update(id, dto);
  }

  /** Registered before `:id` so `schema/foo` is not captured as an id. */
  @Delete('schema/:schemaName')
  async removeBySchema(@Param('schemaName') schemaName: string) {
    return this.tenantService.removeBySchemaName(schemaName);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.tenantService.remove(id);
  }
}
