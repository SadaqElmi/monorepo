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
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Controller('branches')
export class BranchesController {
  constructor(
    private readonly branchesService: BranchesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ensureTenant(): { schema: string; tenantId: string } {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
    return { schema: tenant.schemaName, tenantId: tenant.id };
  }

  @Get()
  findAll() {
    const { schema, tenantId } = this.ensureTenant();
    return this.branchesService.findAll(schema, tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const { schema } = this.ensureTenant();
    return this.branchesService.findOne(schema, id);
  }

  @Post()
  create(@Body() dto: CreateBranchDto) {
    const { schema, tenantId } = this.ensureTenant();
    return this.branchesService.create(schema, tenantId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    const { schema, tenantId } = this.ensureTenant();
    return this.branchesService.update(schema, tenantId, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    const { schema } = this.ensureTenant();
    return this.branchesService.remove(schema, id);
  }
}
