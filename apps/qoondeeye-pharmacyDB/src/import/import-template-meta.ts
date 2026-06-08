import type { ImportType } from './types/import.types';

export const IMPORT_TEMPLATE_VERSION = '2.0.0';

export const TEMPLATE_TYPE_LABEL: Record<ImportType, string> = {
  product: 'product_catalog',
  opening_stock: 'opening_stock',
};

/** Columns from the old combined product template — not valid on product catalog v2. */
export const PRODUCT_CATALOG_LEGACY_COLUMNS = [
  'branch_code',
  'opening_qty',
  'cost_price',
  'batch_number',
  'expiry_date',
  'opening_date',
  'external_ref',
  'product_id',
] as const;

export function templateInstructionPreamble(importType: ImportType): string[] {
  return [
    `Template type: ${TEMPLATE_TYPE_LABEL[importType]}`,
    `Template version: ${IMPORT_TEMPLATE_VERSION}`,
    '',
  ];
}

export function legacyColumnErrorMessage(
  importType: ImportType,
  columns: string[],
): string {
  if (importType === 'product') {
    return [
      'This Excel file uses columns from the old combined product+stock template.',
      `Removed columns detected: ${columns.join(', ')}.`,
      'Use the correct import instead:',
      '  • Product master only → Inventory → Products → Import (download template v2)',
      '  • Opening / migration stock → Inventory → Opening stock → Import',
    ].join(' ');
  }
  return [
    `This file contains columns that are not valid for ${TEMPLATE_TYPE_LABEL[importType]} import (v${IMPORT_TEMPLATE_VERSION}).`,
    `Unexpected columns: ${columns.join(', ')}.`,
    'Download the current template for this import type and try again.',
  ].join(' ');
}
