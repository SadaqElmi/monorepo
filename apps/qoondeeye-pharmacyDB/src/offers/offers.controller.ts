import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  CreateOfferDto,
  OffersQueryDto,
  ResolveOfferDto,
  UpdateOfferDto,
} from './dto/offers.dto';
import { OffersService } from './offers.service';

@Controller('offers')
@UseGuards(PermissionGuard)
@RequirePermissions('manage_offers')
export class OffersController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly offersService: OffersService,
  ) {}

  @Get()
  list(@Query() query: OffersQueryDto) {
    const { schema } = this.ensureTenant();
    return this.offersService.list(schema, query);
  }

  @Post('resolve')
  resolve(@Body() dto: ResolveOfferDto) {
    const { schema } = this.ensureTenant();
    return this.offersService.resolve(schema, dto);
  }

  @Post()
  create(@Body() dto: CreateOfferDto) {
    const { schema } = this.ensureTenant();
    return this.offersService.create(schema, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const { schema } = this.ensureTenant();
    return this.offersService.findOne(schema, id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOfferDto) {
    const { schema } = this.ensureTenant();
    return this.offersService.update(schema, id, dto);
  }

  @Post(':id/enable')
  enable(@Param('id') id: string) {
    const { schema } = this.ensureTenant();
    return this.offersService.setStatus(schema, id, 'enabled');
  }

  @Post(':id/disable')
  disable(@Param('id') id: string) {
    const { schema } = this.ensureTenant();
    return this.offersService.setStatus(schema, id, 'disabled');
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
