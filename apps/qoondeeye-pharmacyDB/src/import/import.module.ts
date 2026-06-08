import { Module } from '@nestjs/common';

import { AccountingModule } from '../accounting/accounting.module';

import { InventoryModule } from '../inventory/inventory.module';

import { PrismaModule } from '../prisma/prisma.module';

import { TenantModule } from '../tenant/tenant.module';
import { UomsModule } from '../uoms/uoms.module';

import { PermissionGuard } from '../common/security/permission.guard';

import { ImportController } from './import.controller';

import { ImportJobsService } from './import-jobs.service';

import { ImportParserService } from './import-parser.service';

import { OpeningStockImportParserService } from './opening-stock-import-parser.service';

import { ImportProgressService } from './import-progress.service';

import { ImportTemplateService } from './import-template.service';

import { ImportWorkerService } from './import-worker.service';

import {

  OpeningStockImportHandler,

  ProductImportHandler,

} from './handlers';

import { OpeningStockService } from './opening-stock/opening-stock.service';

import { ImportRollbackService } from './import-rollback.service';

import { ImportHandlerRegistry } from './import-handler.registry';



@Module({

  imports: [

    PrismaModule,

    TenantModule,

    InventoryModule,

    AccountingModule,
    UomsModule,

  ],

  controllers: [ImportController],

  providers: [

    ImportJobsService,

    ImportParserService,

    OpeningStockImportParserService,

    ImportTemplateService,

    ImportProgressService,

    ImportWorkerService,

    ProductImportHandler,

    OpeningStockImportHandler,

    OpeningStockService,

    ImportRollbackService,

    ImportHandlerRegistry,

    PermissionGuard,

  ],

  exports: [ImportJobsService],

})

export class ImportModule {}

