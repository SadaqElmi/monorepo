import { BadRequestException, Injectable } from '@nestjs/common';
import type { ImportType } from './types/import.types';
import {
  OpeningStockImportHandler,
  ProductImportHandler,
  type ImportHandler,
} from './handlers';

@Injectable()
export class ImportHandlerRegistry {
  private readonly handlers: Map<string, ImportHandler> = new Map();

  constructor(
    productHandler: ProductImportHandler,
    openingStockHandler: OpeningStockImportHandler,
  ) {
    this.handlers.set(productHandler.importType, productHandler);
    this.handlers.set(openingStockHandler.importType, openingStockHandler);
  }

  get(importType: string): ImportHandler {
    const handler = this.handlers.get(importType);
    if (!handler) {
      throw new BadRequestException(`Unsupported import type: ${importType}`);
    }
    return handler;
  }

  getTyped(importType: ImportType): ImportHandler {
    return this.get(importType);
  }
}
