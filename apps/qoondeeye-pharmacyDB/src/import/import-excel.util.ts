import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as ExcelJS from 'exceljs';
import type { ImportType } from './types/import.types';
import {
  legacyColumnErrorMessage,
  PRODUCT_CATALOG_LEGACY_COLUMNS,
} from './import-template-meta';

const HEADER_ROW_SCAN_LIMIT = 10;

export function normalizeHeaderKey(value: unknown): string {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '_');
}

export function cellToString(val: ExcelJS.CellValue): string | null {
  if (val == null) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'object' && 'result' in val) {
    return cellToString((val as { result: ExcelJS.CellValue }).result);
  }
  if (typeof val === 'object' && 'text' in val) {
    return String((val as { text: string }).text).trim() || null;
  }
  if (
    typeof val === 'string' ||
    typeof val === 'number' ||
    typeof val === 'boolean'
  ) {
    const s = String(val).trim();
    return s || null;
  }
  if (typeof val === 'object' && 'richText' in val) {
    const richText = (val as { richText: Array<{ text: string }> }).richText;
    const s = richText.map((part) => part.text).join('').trim();
    return s || null;
  }
  return null;
}

export function str(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (
    typeof v !== 'string' &&
    typeof v !== 'number' &&
    typeof v !== 'boolean'
  ) {
    return null;
  }
  const s = String(v).trim();
  return s || null;
}

export function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function dateStr(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function extractRawHeaders(sheet: ExcelJS.Worksheet, rowNumber: number): string[] {
  const row = sheet.getRow(rowNumber);
  const lastCol = Math.max(row.cellCount, sheet.columnCount ?? 0, 1);
  const headers: string[] = [];
  for (let col = 1; col <= lastCol; col++) {
    headers.push(cellToString(row.getCell(col).value) ?? '');
  }
  while (headers.length && headers[headers.length - 1] === '') {
    headers.pop();
  }
  return headers;
}

function buildHeaderMap(rawHeaders: string[]): {
  headerMap: Map<string, number>;
  normalizedHeaders: string[];
} {
  const headerMap = new Map<string, number>();
  const normalizedHeaders = rawHeaders.map((header) =>
    normalizeHeaderKey(header),
  );

  rawHeaders.forEach((header, index) => {
    const key = normalizeHeaderKey(header);
    if (key) headerMap.set(key, index + 1);
  });

  return { headerMap, normalizedHeaders };
}

function scoreHeaderRow(
  headerMap: Map<string, number>,
  requiredHeaders: readonly string[],
): number {
  return requiredHeaders.filter((header) => headerMap.has(header)).length;
}

function findHeaderRowInSheet(
  sheet: ExcelJS.Worksheet,
  requiredHeaders: readonly string[],
): { headerRowNumber: number; rawHeaders: string[]; headerMap: Map<string, number> } | null {
  let best:
    | {
        headerRowNumber: number;
        rawHeaders: string[];
        headerMap: Map<string, number>;
        score: number;
      }
    | undefined;

  for (let rowNumber = 1; rowNumber <= HEADER_ROW_SCAN_LIMIT; rowNumber++) {
    const rawHeaders = extractRawHeaders(sheet, rowNumber);
    if (!rawHeaders.some((header) => header.trim())) continue;

    const { headerMap } = buildHeaderMap(rawHeaders);
    const score = scoreHeaderRow(headerMap, requiredHeaders);
    if (!best || score > best.score) {
      best = { headerRowNumber: rowNumber, rawHeaders, headerMap, score };
    }
    if (score === requiredHeaders.length) {
      return { headerRowNumber: rowNumber, rawHeaders, headerMap };
    }
  }

  if (!best || best.score === 0) return null;
  return {
    headerRowNumber: best.headerRowNumber,
    rawHeaders: best.rawHeaders,
    headerMap: best.headerMap,
  };
}

function selectWorksheet(
  workbook: ExcelJS.Workbook,
  sheetNames: string[],
  requiredHeaders: readonly string[],
): {
  sheet: ExcelJS.Worksheet;
  headerRowNumber: number;
  rawHeaders: string[];
  headerMap: Map<string, number>;
} {
  const lowerNames = sheetNames.map((name) => name.toLowerCase());
  const candidates = new Map<ExcelJS.Worksheet, ReturnType<typeof findHeaderRowInSheet>>();

  for (const worksheet of workbook.worksheets) {
    candidates.set(worksheet, findHeaderRowInSheet(worksheet, requiredHeaders));
  }

  const preferredByName = sheetNames
    .map((name) => workbook.getWorksheet(name))
    .filter(Boolean) as ExcelJS.Worksheet[];

  const namedMatch = preferredByName.find((worksheet) => {
    const match = candidates.get(worksheet);
    return match && scoreHeaderRow(match.headerMap, requiredHeaders) > 0;
  });
  if (namedMatch) {
    const match = candidates.get(namedMatch)!;
    return { sheet: namedMatch, ...match! };
  }

  const caseInsensitiveMatch = workbook.worksheets.find((worksheet) => {
    if (!lowerNames.includes(worksheet.name.toLowerCase())) return false;
    const match = candidates.get(worksheet);
    return match && scoreHeaderRow(match.headerMap, requiredHeaders) > 0;
  });
  if (caseInsensitiveMatch) {
    const match = candidates.get(caseInsensitiveMatch)!;
    return { sheet: caseInsensitiveMatch, ...match! };
  }

  let bestSheet: ExcelJS.Worksheet | undefined;
  let bestMatch: NonNullable<ReturnType<typeof findHeaderRowInSheet>> | undefined;
  let bestScore = -1;

  for (const worksheet of workbook.worksheets) {
    const match = candidates.get(worksheet);
    if (!match) continue;
    const score = scoreHeaderRow(match.headerMap, requiredHeaders);
    if (score > bestScore) {
      bestScore = score;
      bestSheet = worksheet;
      bestMatch = match;
    }
  }

  if (bestSheet && bestMatch) {
    return { sheet: bestSheet, ...bestMatch };
  }

  const fallback =
    workbook.worksheets.find((worksheet) => lowerNames.includes(worksheet.name.toLowerCase())) ??
    preferredByName[0] ??
    workbook.worksheets[1] ??
    workbook.worksheets[0];

  if (!fallback) {
    throw new BadRequestException('Excel file has no worksheets');
  }

  const rawHeaders = extractRawHeaders(fallback, 1);
  const { headerMap } = buildHeaderMap(rawHeaders);
  return { sheet: fallback, headerRowNumber: 1, rawHeaders, headerMap };
}

function formatMissingHeadersError(
  requiredHeaders: readonly string[],
  allHeaders: readonly string[],
  rawHeaders: readonly string[],
): string {
  const found = rawHeaders.filter((header) => header.trim()).join(', ') || '(none)';
  return [
    `Expected:\n${allHeaders.join(', ')}`,
    `\nFound:\n${found}`,
  ].join('');
}

function isZipWorkbook(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseDelimitedImportBuffer(buffer: Buffer): {
  rawHeaders: string[];
  dataRows: string[][];
} {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!text) {
    throw new BadRequestException('File is empty');
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) {
    throw new BadRequestException('File is empty');
  }

  const firstLine = lines[0] ?? '';
  const delimiter =
    firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rawHeaders = parseDelimitedLine(firstLine, delimiter);
  const dataRows = lines
    .slice(1)
    .map((line) => parseDelimitedLine(line, delimiter))
    .filter((row) => row.some((cell) => cell.trim()));

  return { rawHeaders, dataRows };
}

function validateImportHeaders(
  options: {
    headers: readonly string[];
    requiredHeaders: readonly string[];
    importType: ImportType;
    foreignHeaders?: readonly string[];
  },
  rawHeaders: string[],
): Map<string, number> {
  const { headerMap } = buildHeaderMap(rawHeaders);

  const legacyCandidates =
    options.importType === 'product'
      ? [...PRODUCT_CATALOG_LEGACY_COLUMNS]
      : [...(options.foreignHeaders ?? [])];

  const legacyRemoved = legacyCandidates.filter(
    (h) => headerMap.has(h) && !options.headers.includes(h),
  );
  if (legacyRemoved.length) {
    throw new BadRequestException(
      legacyColumnErrorMessage(options.importType, legacyRemoved),
    );
  }

  const missing = options.requiredHeaders.filter((h) => !headerMap.has(h));
  if (missing.length) {
    throw new BadRequestException(
      formatMissingHeadersError(
        options.requiredHeaders,
        options.headers,
        rawHeaders,
      ),
    );
  }

  return headerMap;
}

function buildRowsFromDelimitedData(
  options: {
    headers: readonly string[];
    maxRows: number;
  },
  headerMap: Map<string, number>,
  dataRows: string[][],
): Array<{ rowNumber: number; rawData: Record<string, unknown> }> {
  const out: Array<{ rowNumber: number; rawData: Record<string, unknown> }> =
    [];
  let dataRowCount = 0;

  dataRows.forEach((cells, index) => {
    const raw: Record<string, unknown> = {};
    let hasData = false;
    for (const h of options.headers) {
      const col = headerMap.get(h);
      if (!col) continue;
      const val = cells[col - 1] ?? '';
      const normalized = str(val);
      if (normalized !== null && normalized !== '') {
        hasData = true;
      }
      raw[h] = normalized;
    }
    if (!hasData) return;
    dataRowCount += 1;
    if (dataRowCount > options.maxRows) {
      throw new BadRequestException(
        `File exceeds maximum of ${options.maxRows} data rows`,
      );
    }
    out.push({ rowNumber: index + 2, rawData: raw });
  });

  if (!out.length) {
    throw new BadRequestException('No data rows found in Excel file');
  }

  return out;
}

export async function parseExcelSheetRows(
  buffer: Buffer,
  options: {
    sheetNames: string[];
    headers: readonly string[];
    requiredHeaders: readonly string[];
    maxRows: number;
    importType: ImportType;
    /** Extra headers that indicate the wrong template (beyond product legacy set). */
    foreignHeaders?: readonly string[];
    debug?: boolean;
    onDebug?: (info: {
      workbookSheetNames: string[];
      selectedSheetName: string;
      headerRowNumber: number;
      rawHeaders: string[];
      normalizedHeaders: string[];
    }) => void;
  },
): Promise<{
  rows: Array<{ rowNumber: number; rawData: Record<string, unknown> }>;
  fileSha256: string;
}> {
  const fileSha256 = createHash('sha256').update(buffer).digest('hex');

  if (!isZipWorkbook(buffer)) {
    const { rawHeaders, dataRows } = parseDelimitedImportBuffer(buffer);
    const normalizedHeaders = rawHeaders.map((header) =>
      normalizeHeaderKey(header),
    );

    if (options.debug) {
      console.log('Workbook Sheets:', ['CSV']);
      console.log('Selected Sheet:', 'CSV');
      console.log('Header Row:', rawHeaders);
    }

    options.onDebug?.({
      workbookSheetNames: ['CSV'],
      selectedSheetName: 'CSV',
      headerRowNumber: 1,
      rawHeaders,
      normalizedHeaders,
    });

    const headerMap = validateImportHeaders(options, rawHeaders);
    const rows = buildRowsFromDelimitedData(options, headerMap, dataRows);
    return { rows, fileSha256 };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException(
      'File is not a valid Excel (.xlsx) workbook. Download the import template or save your sheet as .xlsx before uploading.',
    );
  }

  const { sheet, headerRowNumber, rawHeaders, headerMap } = selectWorksheet(
    workbook,
    options.sheetNames,
    options.requiredHeaders,
  );

  const normalizedHeaders = rawHeaders.map((header) => normalizeHeaderKey(header));

  if (options.debug) {
    console.log('Workbook Sheets:', workbook.worksheets.map((ws) => ws.name));
    console.log('Selected Sheet:', sheet.name);
    console.log('Header Row:', rawHeaders);
  }

  options.onDebug?.({
    workbookSheetNames: workbook.worksheets.map((ws) => ws.name),
    selectedSheetName: sheet.name,
    headerRowNumber,
    rawHeaders,
    normalizedHeaders,
  });

  validateImportHeaders(options, rawHeaders);

  const out: Array<{ rowNumber: number; rawData: Record<string, unknown> }> =
    [];
  let dataRowCount = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const raw: Record<string, unknown> = {};
    let hasData = false;
    for (const h of options.headers) {
      const col = headerMap.get(h);
      if (!col) continue;
      const val = row.getCell(col).value;
      const normalized = cellToString(val);
      if (normalized !== null && normalized !== '') {
        hasData = true;
      }
      raw[h] = normalized;
    }
    if (!hasData) return;
    dataRowCount += 1;
    if (dataRowCount > options.maxRows) {
      throw new BadRequestException(
        `File exceeds maximum of ${options.maxRows} data rows`,
      );
    }
    out.push({ rowNumber, rawData: raw });
  });

  if (!out.length) {
    throw new BadRequestException('No data rows found in Excel file');
  }

  return { rows: out, fileSha256 };
}
