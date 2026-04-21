/** Permission codes stored in tenant `permissions` and JWT `permissions` claim. */
export const ACCOUNTING_PERMISSION_CODES = [
  'run_consolidation',
  'reverse_consolidation',
  'view_consolidation_history',
  'finalize_consolidation',
  'approve_consolidation_adjustments',
  'view_audit_logs',
  'export_audit_package',
  'view_disclosure_reports',
] as const;

export type AccountingPermissionCode =
  (typeof ACCOUNTING_PERMISSION_CODES)[number];

export const ALL_ACCOUNTING_PERMISSIONS: string[] = [
  ...ACCOUNTING_PERMISSION_CODES,
];
