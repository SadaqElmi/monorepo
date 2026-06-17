import { Module } from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { AccountingModule } from '../accounting/accounting.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { PosAuditService } from '../auth/pos-audit.service';
import { PosControlAuditService } from '../auth/pos-control-audit.service';
import { PosAuditController } from './pos-audit.controller';
import { PosAuditQueryService } from './pos-audit-query.service';
import { PosTerminalsController } from './pos-terminals.controller';
import { PosTerminalActivityService } from './pos-terminal-activity.service';
import { PosTerminalsService } from './pos-terminals.service';

@Module({
  imports: [PrismaModule, TenantModule, AccountingModule],
  controllers: [PosTerminalsController, PosAuditController],
  providers: [
    PosTerminalsService,
    PosTerminalActivityService,
    PosAuditQueryService,
    PosAuditService,
    PosControlAuditService,
    PermissionGuard,
  ],
  exports: [PosTerminalsService, PosTerminalActivityService, PosAuditQueryService],
})
export class PosTerminalsModule {}
