import type { ImportCenterFilters } from './types/import.types';
import { IMPORT_TYPES } from './types/import.types';

const JOB_STATUSES = [
  'draft',
  'validating',
  'preview',
  'confirmed',
  'committing',
  'completed',
  'failed',
  'reversed',
] as const;

export function sanitizeImportCenterFilters(
  input: Partial<ImportCenterFilters>,
): ImportCenterFilters {
  const filters: ImportCenterFilters = {
    limit: Math.min(100, Math.max(1, Number(input.limit) || 25)),
    offset: Math.max(0, Number(input.offset) || 0),
  };
  if (
    input.importType &&
    IMPORT_TYPES.includes(input.importType as (typeof IMPORT_TYPES)[number])
  ) {
    filters.importType = input.importType as ImportCenterFilters['importType'];
  }
  if (
    input.status &&
    JOB_STATUSES.includes(input.status as (typeof JOB_STATUSES)[number])
  ) {
    filters.status = input.status;
  }
  if (input.createdBy?.trim()) {
    filters.createdBy = input.createdBy.trim();
  }
  if (input.from?.trim()) {
    filters.from = input.from.trim();
  }
  if (input.to?.trim()) {
    filters.to = input.to.trim();
  }
  return filters;
}

export function buildImportCenterWhere(
  filters: ImportCenterFilters,
  alias = 'j',
): { whereSql: string; params: unknown[]; nextParam: number } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let n = 1;

  if (filters.importType) {
    conditions.push(`${alias}.import_type = $${n++}`);
    params.push(filters.importType);
  }
  if (filters.status) {
    conditions.push(`${alias}.status = $${n++}`);
    params.push(filters.status);
  }
  if (filters.createdBy) {
    conditions.push(`${alias}.created_by = $${n++}::uuid`);
    params.push(filters.createdBy);
  }
  if (filters.from) {
    conditions.push(`${alias}.created_at >= $${n++}::timestamptz`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`${alias}.created_at <= $${n++}::timestamptz`);
    params.push(filters.to);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereSql, params, nextParam: n };
}
