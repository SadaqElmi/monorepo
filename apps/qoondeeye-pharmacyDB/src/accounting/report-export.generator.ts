import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type {
  BalanceSheetReport,
  CashFlowReport,
  IncomeStatementReport,
} from './financial-reports.service';

function ensureDirForFile(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

type PdfDoc = InstanceType<typeof PDFDocument>;

function writePdfTable(
  doc: PdfDoc,
  rows: Array<{ label: string; value: string }>,
) {
  const left = doc.x;
  const labelW = 320;
  for (const row of rows) {
    doc
      .fontSize(9)
      .text(row.label, left, doc.y, { width: labelW, continued: false });
    doc.text(row.value, left + labelW, doc.y - doc.currentLineHeight(), {
      width: 200,
      align: 'right',
    });
    doc.moveDown(0.35);
  }
}

export async function writeProfitLossPdf(
  filePath: string,
  title: string,
  report: IncomeStatementReport,
): Promise<void> {
  ensureDirForFile(filePath);
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(16).text(title, { underline: true });
    doc.moveDown(0.5);
    doc
      .fontSize(9)
      .fillColor('#666')
      .text(`Generated ${report.generatedAt}`, { continued: false });
    doc.fillColor('#000');
    doc.moveDown();
    writePdfTable(doc, [
      { label: 'Total revenue', value: report.totalRevenue.toFixed(2) },
      { label: 'Total expenses', value: report.totalExpenses.toFixed(2) },
      { label: 'Net income', value: report.netIncome.toFixed(2) },
      { label: 'COGS', value: report.cogs.toFixed(2) },
      { label: 'Gross profit', value: report.grossProfit.toFixed(2) },
    ]);
    doc.moveDown();
    doc.fontSize(11).text('Lines', { underline: true });
    doc.moveDown(0.25);
    for (const ln of report.lines) {
      writePdfTable(doc, [
        {
          label: `${ln.accountType} — ${ln.name} (${ln.accountKey})`,
          value: ln.amount.toFixed(2),
        },
      ]);
    }
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

export async function writeProfitLossXlsx(
  filePath: string,
  title: string,
  report: IncomeStatementReport,
): Promise<void> {
  ensureDirForFile(filePath);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('P&L', {
    properties: { defaultRowHeight: 18 },
  });
  ws.addRow([title]);
  ws.addRow([`Generated ${report.generatedAt}`]);
  ws.addRow([]);
  ws.addRow(['Account type', 'Key', 'Name', 'Amount']);
  for (const ln of report.lines) {
    ws.addRow([ln.accountType, ln.accountKey, ln.name, ln.amount]);
  }
  ws.addRow([]);
  ws.addRow(['Total revenue', '', '', report.totalRevenue]);
  ws.addRow(['Total expenses', '', '', report.totalExpenses]);
  ws.addRow(['Net income', '', '', report.netIncome]);
  await wb.xlsx.writeFile(filePath);
}

export async function writeBalanceSheetPdf(
  filePath: string,
  title: string,
  report: BalanceSheetReport,
): Promise<void> {
  ensureDirForFile(filePath);
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(16).text(title, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#666').text(`Generated ${report.generatedAt}`);
    doc.fillColor('#000').moveDown();
    writePdfTable(doc, [
      { label: 'Assets', value: report.totals.assets.toFixed(2) },
      { label: 'Liabilities', value: report.totals.liabilities.toFixed(2) },
      { label: 'Total equity', value: report.totals.totalEquity.toFixed(2) },
    ]);
    doc.moveDown();
    doc.fontSize(11).text('Lines', { underline: true });
    doc.moveDown(0.25);
    for (const ln of report.lines) {
      writePdfTable(doc, [
        {
          label: `${ln.accountType} — ${ln.name}`,
          value: ln.balance.toFixed(2),
        },
      ]);
    }
    if (report.consolidation) {
      doc.moveDown();
      doc.fontSize(10).text('Consolidation (reporting-only)', { underline: true });
      doc.fontSize(9);
      writePdfTable(doc, [
        {
          label: 'Mode',
          value: report.consolidation.reportingMode,
        },
        {
          label: 'Eliminated accounts',
          value: (report.consolidation.eliminatedAccountKeys ?? []).join(', '),
        },
        {
          label: 'Residual',
          value: report.consolidation.residual.toFixed(2),
        },
        {
          label: 'Status',
          value: report.consolidation.consolidationStatus,
        },
      ]);
    }
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

export async function writeBalanceSheetXlsx(
  filePath: string,
  title: string,
  report: BalanceSheetReport,
): Promise<void> {
  ensureDirForFile(filePath);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Balance sheet');
  ws.addRow([title]);
  ws.addRow([`Generated ${report.generatedAt}`]);
  ws.addRow([]);
  ws.addRow(['Account type', 'Key', 'Name', 'Balance']);
  for (const ln of report.lines) {
    ws.addRow([ln.accountType, ln.accountKey, ln.name, ln.balance]);
  }
  ws.addRow([]);
  ws.addRow(['Assets', '', '', report.totals.assets]);
  ws.addRow(['Liabilities', '', '', report.totals.liabilities]);
  ws.addRow(['Total equity', '', '', report.totals.totalEquity]);
  if (report.consolidation) {
    ws.addRow([]);
    ws.addRow(['Consolidation (reporting-only)']);
    ws.addRow(['Mode', report.consolidation.reportingMode]);
    ws.addRow([
      'Eliminated accounts',
      (report.consolidation.eliminatedAccountKeys ?? []).join(', '),
    ]);
    ws.addRow(['Residual', report.consolidation.residual]);
    ws.addRow(['Status', report.consolidation.consolidationStatus]);
  }
  await wb.xlsx.writeFile(filePath);
}

export async function writeCashFlowPdf(
  filePath: string,
  title: string,
  report: CashFlowReport,
): Promise<void> {
  ensureDirForFile(filePath);
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(16).text(title, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#666').text(`Generated ${report.generatedAt}`);
    doc.fillColor('#000').moveDown();
    writePdfTable(doc, [
      {
        label: 'Operating total',
        value: report.sectionTotals.operating.toFixed(2),
      },
      {
        label: 'Investing total',
        value: report.sectionTotals.investing.toFixed(2),
      },
      {
        label: 'Financing total',
        value: report.sectionTotals.financing.toFixed(2),
      },
      { label: 'Net cash movement', value: report.netCashMovement.toFixed(2) },
    ]);
    doc.moveDown();
    for (const sec of ['operating', 'investing', 'financing'] as const) {
      doc.fontSize(11).text(sec.toUpperCase(), { underline: true });
      doc.moveDown(0.25);
      for (const ln of report.sections[sec]) {
        writePdfTable(doc, [
          {
            label: `${ln.name} (${ln.accountKey})`,
            value: ln.netMovement.toFixed(2),
          },
        ]);
      }
      doc.moveDown(0.25);
    }
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

export async function writeCashFlowXlsx(
  filePath: string,
  title: string,
  report: CashFlowReport,
): Promise<void> {
  ensureDirForFile(filePath);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cash flow');
  ws.addRow([title]);
  ws.addRow([`Generated ${report.generatedAt}`]);
  ws.addRow([]);
  ws.addRow(['Section', 'Source', 'Key', 'Name', 'Net']);
  for (const ln of report.lines) {
    ws.addRow([
      ln.section,
      ln.sourceType,
      ln.accountKey,
      ln.name,
      ln.netMovement,
    ]);
  }
  ws.addRow([]);
  ws.addRow(['Operating', '', '', '', report.sectionTotals.operating]);
  ws.addRow(['Investing', '', '', '', report.sectionTotals.investing]);
  ws.addRow(['Financing', '', '', '', report.sectionTotals.financing]);
  ws.addRow(['Net cash', '', '', '', report.netCashMovement]);
  await wb.xlsx.writeFile(filePath);
}
