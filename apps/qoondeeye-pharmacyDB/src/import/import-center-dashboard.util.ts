import type { ImportCenterDashboard, ImportType } from './types/import.types';
import { IMPORT_TYPES } from './types/import.types';

/** Pure aggregation used by getImportCenterDashboard (mirrors import_jobs GROUP BY). */
export function aggregateImportCenterDashboard(
  statusRows: Array<{ status: string; c: number }>,
  typeRows: Array<{ import_type: string; c: number }>,
): ImportCenterDashboard {
  let total = 0;
  let running = 0;
  let completed = 0;
  let failed = 0;
  let rolledBack = 0;

  for (const row of statusRows) {
    const c = Number(row.c ?? 0);
    total += c;
    if (row.status === 'validating' || row.status === 'committing') {
      running += c;
    } else if (row.status === 'completed') {
      completed += c;
    } else if (row.status === 'failed') {
      failed += c;
    } else if (row.status === 'reversed') {
      rolledBack += c;
    }
  }

  const byType: Record<ImportType, number> = {
    product: 0,
    opening_stock: 0,
  };
  const legacyByType: Record<string, number> = {};
  for (const row of typeRows) {
    const t = row.import_type;
    const c = Number(row.c ?? 0);
    if (IMPORT_TYPES.includes(t as ImportType)) {
      byType[t as ImportType] = c;
    } else {
      legacyByType[t] = c;
    }
  }

  return { total, running, completed, failed, rolledBack, byType, legacyByType };
}
