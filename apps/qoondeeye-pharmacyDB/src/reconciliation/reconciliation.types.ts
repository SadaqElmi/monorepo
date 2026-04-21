export const RECONCILIATION_LOG_TYPES = [
  'transfer',
  'journal',
  'branch',
  'inventory',
  'event',
  /** Phase-level or engine failures (e.g. thrown check phase) */
  'system',
] as const;

export type ReconciliationLogType = (typeof RECONCILIATION_LOG_TYPES)[number];

export const RECONCILIATION_SEVERITY = ['critical', 'warning', 'info'] as const;

export type ReconciliationSeverity = (typeof RECONCILIATION_SEVERITY)[number];

/** Matches JournalService balance check */
export const EPS_JOURNAL = 0.005;

/** Cross-branch / transfer pair amounts */
export const EPS_CROSS = 0.02;

/** Inventory: log warning above this gap vs GL */
export const EPS_INV_WARN = 0.5;
/** Large material gap (metadata only; severity stays warning per policy) */
export const EPS_INV_CRITICAL = 100;
