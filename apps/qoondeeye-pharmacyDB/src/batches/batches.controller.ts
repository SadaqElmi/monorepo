import { Controller, Get, Param, BadRequestException } from '@nestjs/common';
import { TenantContextService } from '../tenant/tenant-context.service';
import { BatchesService } from './batches.service';

@Controller('batches')
export class BatchesController {
  constructor(
    private readonly batchesService: BatchesService,
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
    return this.batchesService.findAll(this.tenantContext.getSchemaName()!);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    this.ensureTenant();
    return this.batchesService.findOne(this.tenantContext.getSchemaName()!, id);
  }
}
