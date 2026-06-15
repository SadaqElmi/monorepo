import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PosAnalyticsService } from './pos-analytics.service';

@Controller('pos/analytics')
@UseGuards(PermissionGuard)
export class PosAnalyticsController {
  constructor(
    private readonly analyticsService: PosAnalyticsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private schema() {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) throw new BadRequestException('Tenant context required');
    return tenant.schemaName;
  }

  @RequirePermissions('view_sales')
  @Get('sales-by-branch')
  salesByBranch(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.salesByBranch(this.schema(), from, to);
  }

  @RequirePermissions('view_sales')
  @Get('sales-by-terminal')
  salesByTerminal(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.salesByTerminal(this.schema(), from, to);
  }

  @RequirePermissions('view_sales')
  @Get('sales-by-cashier')
  salesByCashier(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.salesByCashier(this.schema(), from, to);
  }

  @RequirePermissions('view_sales')
  @Get('sales-by-hour')
  salesByHour(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.salesByHour(this.schema(), from, to);
  }

  @RequirePermissions('view_sales')
  @Get('refund-trends')
  refundTrends(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.refundTrends(this.schema(), from, to);
  }

  @RequirePermissions('view_sales')
  @Get('discount-trends')
  discountTrends(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.discountTrends(this.schema(), from, to);
  }

  @RequirePermissions('view_sales')
  @Get('slow-movers')
  slowMovers(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const n = Number(limit) || 20;
    return this.analyticsService.slowMovers(
      this.schema(),
      from,
      to,
      Number.isFinite(n) ? n : 20,
    );
  }

  @RequirePermissions('view_sales')
  @Get('top-products')
  topProducts(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const n = Number(limit) || 20;
    return this.analyticsService.topProducts(
      this.schema(),
      from,
      to,
      Number.isFinite(n) ? n : 20,
    );
  }
}
