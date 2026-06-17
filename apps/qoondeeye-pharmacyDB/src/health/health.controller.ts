import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('control-db')
  async getControlDbHealth() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return {
        status: 'ok',
        database: 'control',
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'control',
        message,
      });
    }
  }

  @Get('tenant-pool')
  getTenantPoolHealth() {
    const clients = this.tenantPrisma.activeClientSnapshot();
    return {
      status: 'ok',
      activeClients: clients.length,
      clients,
      timestamp: new Date().toISOString(),
    };
  }
}
