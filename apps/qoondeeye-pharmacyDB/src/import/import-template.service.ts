import { Injectable } from '@nestjs/common';

import * as ExcelJS from 'exceljs';

import { PrismaService } from '../prisma/prisma.service';

import { PRODUCT_IMPORT_HEADERS } from './import-parser.service';

import { OPENING_STOCK_IMPORT_HEADERS } from './opening-stock-import-parser.service';

import { templateInstructionPreamble } from './import-template-meta';



const SAMPLE_FILL: ExcelJS.Fill = {

  type: 'pattern',

  pattern: 'solid',

  fgColor: { argb: 'FFF3F4F6' },

};



@Injectable()

export class ImportTemplateService {

  constructor(private readonly prisma: PrismaService) {}



  async generateProductTemplate(schemaName: string): Promise<Buffer> {

    const wb = new ExcelJS.Workbook();

    const instructions = wb.addWorksheet('Instructions');

    instructions.getColumn(1).width = 100;

    const lines = [

      ...templateInstructionPreamble('product'),

      'Product catalog import — master data only (no stock, no purchases).',

      'Product Import does NOT create inventory rows. Stock enters via Opening Stock import.',

      '',

      'Required columns: item_no, name, category_path',

      'UOM: use base_uom for the base stock unit; legacy unit is still accepted as an alias.',

      'Optional UOM columns: purchase_uom, sales_uom, pos_uom, strip_factor, box_factor, carton_factor, UOM prices, UOM barcodes.',

      'Optional product columns: barcode, generic_name, strength, formulation, description',

      '',

      'For opening balances use Inventory → Opening stock → Import.',

      '',

      'category_path format: Parent > Child > Leaf',

      '',

      'Column reference:',

      ...PRODUCT_IMPORT_HEADERS.map((h) => `  ${h}`),

    ];

    lines.forEach((line, i) => {

      instructions.getCell(i + 1, 1).value = line;

    });



    const sheet = wb.addWorksheet('Products');

    sheet.addRow([...PRODUCT_IMPORT_HEADERS]);

    sheet.getRow(1).font = { bold: true };



    const sample = [

      '130001',

      '6281001',

      'Paracetamol 500mg',

      'Paracetamol',

      '500mg',

      'Tablet',

      'Medicine > Analgesic',

      'PCS',

      '',

      'BOX',

      'PCS',

      'PCS',

      10,

      100,

      '',

      0.1,

      1,

      10,

      '6281001',

      '6281001-STRIP',

      '6281001-BOX',

      'Pain relief tablet',

    ];

    const row = sheet.addRow(sample);

    row.eachCell((cell) => {

      cell.fill = SAMPLE_FILL;

    });



    PRODUCT_IMPORT_HEADERS.forEach((_, i) => {

      sheet.getColumn(i + 1).width = 16;

    });



    return Buffer.from(await wb.xlsx.writeBuffer());

  }



  async generateOpeningStockTemplate(schemaName: string): Promise<Buffer> {

    void schemaName;

    const branches = await this.prisma.withTenantSchema(schemaName, (tx) =>

      tx.$queryRawUnsafe<Array<{ code: string | null; name: string | null }>>(

        `SELECT code, name FROM branches

         WHERE LOWER(TRIM(name)) <> 'consolidation'

         ORDER BY name`,

      ),

    );



    const wb = new ExcelJS.Workbook();

    const instructions = wb.addWorksheet('Instructions');

    instructions.getColumn(1).width = 100;

    const lines = [

      ...templateInstructionPreamble('opening_stock'),

      'Opening stock import — one-time migration / go-live balances.',

      'Products must already exist (import catalog first).',

      '',

      'Creates inventory, batches, and Dr Inventory / Cr Opening Balance Equity journals.',

      '',

      'Required: branch_code, item_no, opening_qty, cost_price, opening_date',

      'Pharmacy tenants: batch_number and expiry_date required when opening_qty > 0',

      '',

      'Available branch codes:',

      ...branches.map(

        (b) => `  ${b.code ?? '(no code)'} — ${b.name ?? 'Unnamed'}`,

      ),

    ];

    lines.forEach((line, i) => {

      instructions.getCell(i + 1, 1).value = line;

    });



    const sheet = wb.addWorksheet('OpeningStock');

    sheet.addRow([...OPENING_STOCK_IMPORT_HEADERS]);

    sheet.getRow(1).font = { bold: true };



    const primary = branches[0]?.code ?? 'MAIN';

    sheet

      .addRow([primary, '130001', 100, 0.25, 'B2026-01', '2027-06-30', '2026-01-01'])

      .eachCell((cell) => {

        cell.fill = SAMPLE_FILL;

      });



    return Buffer.from(await wb.xlsx.writeBuffer());

  }

}

