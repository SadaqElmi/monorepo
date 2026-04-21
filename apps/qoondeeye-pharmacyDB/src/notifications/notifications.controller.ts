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
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
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
    return this.notificationsService.findAll(
      this.tenantContext.getSchemaName()!,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    this.ensureTenant();
    return this.notificationsService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }

  @Post()
  create(@Body() dto: CreateNotificationDto) {
    this.ensureTenant();
    return this.notificationsService.create(
      this.tenantContext.getSchemaName()!,
      dto,
    );
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNotificationDto) {
    this.ensureTenant();
    return this.notificationsService.update(
      this.tenantContext.getSchemaName()!,
      id,
      dto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.ensureTenant();
    return this.notificationsService.remove(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }
}
