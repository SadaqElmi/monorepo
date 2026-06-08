export type PermissionAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'action';

export type PermissionGroupId =
  | 'inventory'
  | 'purchasing'
  | 'sales'
  | 'accounting'
  | 'administration'
  | 'imports'
  | 'customer_credit'
  | 'pricing'
  | 'audit'
  | 'consolidation';

export type PermissionDefinition = {
  code: string;
  group: PermissionGroupId;
  label: string;
  description: string;
  action: PermissionAction;
};

export const PERMISSION_GROUP_LABELS: Record<PermissionGroupId, string> = {
  inventory: 'Inventory',
  purchasing: 'Purchasing',
  sales: 'Sales',
  accounting: 'Accounting',
  administration: 'Administration',
  imports: 'Imports',
  customer_credit: 'Customer Credit',
  pricing: 'Pricing & Offers',
  audit: 'Audit',
  consolidation: 'Consolidation',
};

/** Canonical tenant permission catalog — single source of truth for RBAC Phase 2+. */
export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // Inventory
  { code: 'view_products', group: 'inventory', label: 'View products', description: 'View product catalog and details.', action: 'view' },
  { code: 'create_product', group: 'inventory', label: 'Create products', description: 'Create new products.', action: 'create' },
  { code: 'edit_product', group: 'inventory', label: 'Edit products', description: 'Edit products and UOM definitions.', action: 'update' },
  { code: 'delete_product', group: 'inventory', label: 'Delete products', description: 'Delete products from catalog.', action: 'delete' },
  { code: 'adjust_inventory', group: 'inventory', label: 'Adjust inventory', description: 'Manual inventory adjustments.', action: 'action' },
  { code: 'transfer_inventory', group: 'inventory', label: 'Transfer inventory', description: 'Create and operate stock transfers.', action: 'action' },
  { code: 'approve_transfer', group: 'inventory', label: 'Approve transfers', description: 'Approve or reject stock transfer requests.', action: 'action' },
  { code: 'view_expenses', group: 'accounting', label: 'View expenses', description: 'View operating expense records.', action: 'view' },
  { code: 'create_expense', group: 'accounting', label: 'Create expenses', description: 'Record operating expenses.', action: 'create' },
  { code: 'edit_expense', group: 'accounting', label: 'Edit expenses', description: 'Edit expense records.', action: 'update' },
  { code: 'delete_expense', group: 'accounting', label: 'Delete expenses', description: 'Delete expense records.', action: 'delete' },
  // Purchasing
  { code: 'view_suppliers', group: 'purchasing', label: 'View suppliers', description: 'View supplier records.', action: 'view' },
  { code: 'create_supplier', group: 'purchasing', label: 'Create suppliers', description: 'Create supplier records.', action: 'create' },
  { code: 'edit_supplier', group: 'purchasing', label: 'Edit suppliers', description: 'Edit supplier records.', action: 'update' },
  { code: 'delete_supplier', group: 'purchasing', label: 'Delete suppliers', description: 'Delete supplier records.', action: 'delete' },
  { code: 'view_purchases', group: 'purchasing', label: 'View purchases', description: 'View purchase bills and orders.', action: 'view' },
  { code: 'create_purchase', group: 'purchasing', label: 'Create purchases', description: 'Create purchase documents.', action: 'create' },
  { code: 'edit_purchase', group: 'purchasing', label: 'Edit purchases', description: 'Edit draft purchase documents.', action: 'update' },
  { code: 'delete_purchase', group: 'purchasing', label: 'Delete purchases', description: 'Delete purchase documents.', action: 'delete' },
  { code: 'receive_purchase', group: 'purchasing', label: 'Receive purchases', description: 'Receive stock against purchase orders.', action: 'action' },
  { code: 'post_purchase_invoice', group: 'purchasing', label: 'Post purchase invoice', description: 'Post purchase invoices to accounting.', action: 'action' },
  // Sales
  { code: 'view_sales', group: 'sales', label: 'View sales', description: 'View sales documents.', action: 'view' },
  { code: 'create_sale', group: 'sales', label: 'Create sales', description: 'Create sales and POS transactions.', action: 'create' },
  { code: 'refund_sale', group: 'sales', label: 'Refund sales', description: 'Process sale refunds and returns.', action: 'action' },
  { code: 'void_sale', group: 'sales', label: 'Void sales', description: 'Void sales transactions.', action: 'action' },
  { code: 'view_transaction_register', group: 'sales', label: 'View transaction register', description: 'View POS transaction register.', action: 'view' },
  // Pricing
  { code: 'manage_pricing', group: 'pricing', label: 'Manage pricing', description: 'Manage product pricing and bulk updates.', action: 'action' },
  { code: 'manage_price_groups', group: 'pricing', label: 'Manage price groups', description: 'Manage price group definitions.', action: 'action' },
  { code: 'manage_offers', group: 'pricing', label: 'Manage offers', description: 'Manage promotional offers.', action: 'action' },
  // Customer credit
  { code: 'view_customer_credit', group: 'customer_credit', label: 'View customer credit', description: 'View customer credit balances.', action: 'view' },
  { code: 'create_customer_credit_sale', group: 'customer_credit', label: 'Create credit sale', description: 'Create sales on customer credit.', action: 'create' },
  { code: 'record_customer_repayment', group: 'customer_credit', label: 'Record repayment', description: 'Record customer credit repayments.', action: 'action' },
  { code: 'override_credit_limit', group: 'customer_credit', label: 'Override credit limit', description: 'Override credit limits at checkout.', action: 'action' },
  { code: 'view_customers', group: 'customer_credit', label: 'View customers', description: 'View customer records.', action: 'view' },
  { code: 'create_customer', group: 'customer_credit', label: 'Create customers', description: 'Create customer records.', action: 'create' },
  { code: 'edit_customer', group: 'customer_credit', label: 'Edit customers', description: 'Edit customer records.', action: 'update' },
  { code: 'delete_customer', group: 'customer_credit', label: 'Delete customers', description: 'Delete customer records.', action: 'delete' },
  // Administration
  { code: 'manage_users', group: 'administration', label: 'Manage users (legacy)', description: 'Legacy alias for all staff and role permissions.', action: 'action' },
  { code: 'view_staff', group: 'administration', label: 'View staff', description: 'View staff list and details.', action: 'view' },
  { code: 'create_staff', group: 'administration', label: 'Create staff', description: 'Create staff accounts.', action: 'create' },
  { code: 'edit_staff', group: 'administration', label: 'Edit staff', description: 'Edit staff accounts.', action: 'update' },
  { code: 'delete_staff', group: 'administration', label: 'Delete staff', description: 'Delete staff accounts.', action: 'delete' },
  { code: 'view_roles', group: 'administration', label: 'View roles', description: 'View roles and permission assignments.', action: 'view' },
  { code: 'create_role', group: 'administration', label: 'Create roles', description: 'Create custom roles.', action: 'create' },
  { code: 'edit_role', group: 'administration', label: 'Edit roles', description: 'Edit role permissions.', action: 'update' },
  { code: 'delete_role', group: 'administration', label: 'Delete roles', description: 'Delete unused custom roles.', action: 'delete' },
  { code: 'assign_role', group: 'administration', label: 'Assign roles', description: 'Assign roles to staff.', action: 'action' },
  { code: 'edit_branch', group: 'administration', label: 'Edit branches', description: 'Edit branch settings (non lock-date).', action: 'update' },
  { code: 'change_lock_date', group: 'administration', label: 'Change lock date', description: 'Change accounting lock dates.', action: 'action' },
  // Imports
  { code: 'import_products', group: 'imports', label: 'Import products', description: 'Import products via spreadsheet.', action: 'action' },
  { code: 'import_opening_stock', group: 'imports', label: 'Import opening stock', description: 'Import opening stock balances.', action: 'action' },
  { code: 'view_import_center', group: 'imports', label: 'View import center', description: 'Access import center.', action: 'view' },
  { code: 'cleanup_import_products', group: 'imports', label: 'Cleanup imports', description: 'Cleanup failed product imports.', action: 'action' },
  // Accounting
  { code: 'manage_accounting_configuration', group: 'accounting', label: 'Manage accounting config', description: 'Configure chart of accounts and journals.', action: 'action' },
  { code: 'post_journal', group: 'accounting', label: 'Post journal', description: 'Post manual journal entries.', action: 'action' },
  { code: 'reverse_journal', group: 'accounting', label: 'Reverse journal', description: 'Reverse journal entries (when supported).', action: 'action' },
  { code: 'close_period', group: 'accounting', label: 'Close period', description: 'Close accounting period.', action: 'action' },
  { code: 'reopen_period', group: 'accounting', label: 'Reopen period', description: 'Reopen closed accounting period.', action: 'action' },
  { code: 'view_reports', group: 'accounting', label: 'View reports', description: 'View financial and business reports.', action: 'view' },
  // Audit
  { code: 'view_audit_logs', group: 'audit', label: 'View audit logs', description: 'View audit trail.', action: 'view' },
  { code: 'export_audit_package', group: 'audit', label: 'Export audit package', description: 'Export audit chain data.', action: 'action' },
  { code: 'view_disclosure_reports', group: 'audit', label: 'View disclosures', description: 'View consolidation disclosures.', action: 'view' },
  // Consolidation
  { code: 'run_consolidation', group: 'consolidation', label: 'Run consolidation', description: 'Run branch consolidation.', action: 'action' },
  { code: 'reverse_consolidation', group: 'consolidation', label: 'Reverse consolidation', description: 'Reverse consolidation runs.', action: 'action' },
  { code: 'view_consolidation_history', group: 'consolidation', label: 'View consolidation history', description: 'View consolidation run history.', action: 'view' },
  { code: 'finalize_consolidation', group: 'consolidation', label: 'Finalize consolidation', description: 'Finalize consolidation runs.', action: 'action' },
  { code: 'approve_consolidation_adjustments', group: 'consolidation', label: 'Approve consolidation adjustments', description: 'Approve consolidation adjustments.', action: 'action' },
];

export const ALL_PERMISSION_CODES: string[] = PERMISSION_CATALOG.map((p) => p.code);

export const PERMISSION_CODE_SET = new Set(ALL_PERMISSION_CODES);

/** Coarse legacy permissions expand to granular codes for guard checks. */
export const COARSE_PERMISSION_ALIASES: ReadonlyArray<{
  coarse: string;
  implies: readonly string[];
}> = [
  {
    coarse: 'manage_users',
    implies: [
      'view_staff',
      'create_staff',
      'edit_staff',
      'delete_staff',
      'view_roles',
      'create_role',
      'edit_role',
      'delete_role',
      'assign_role',
    ],
  },
  {
    coarse: 'manage_pricing',
    implies: ['view_products', 'edit_product', 'manage_pricing'],
  },
  {
    coarse: 'manage_price_groups',
    implies: ['manage_price_groups'],
  },
  {
    coarse: 'manage_offers',
    implies: ['manage_offers'],
  },
  {
    coarse: 'manage_accounting_configuration',
    implies: ['manage_accounting_configuration', 'view_reports'],
  },
];

export const SYSTEM_ROLE_NAMES = [
  'admin',
  'manager',
  'cashier',
  'pharmacist',
  'auditor',
  'accountant',
  'finance_manager',
] as const;

export function isKnownPermission(code: string): boolean {
  return PERMISSION_CODE_SET.has(code.trim());
}

export function assertKnownPermissions(codes: string[]): void {
  const unknown = codes.filter((c) => !isKnownPermission(c));
  if (unknown.length) {
    throw new Error(`Unknown permission codes: ${unknown.join(', ')}`);
  }
}

export function expandPermissionCodes(codes: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const code of codes) {
    const trimmed = code.trim();
    if (!trimmed) continue;
    out.add(trimmed);
    for (const alias of COARSE_PERMISSION_ALIASES) {
      if (trimmed === alias.coarse) {
        for (const implied of alias.implies) out.add(implied);
      }
    }
  }
  return out;
}

export function hasEffectivePermission(
  codes: readonly string[],
  required: string,
): boolean {
  const expanded = expandPermissionCodes(codes);
  return expanded.has(required.trim());
}

export function hasAllEffectivePermissions(
  codes: readonly string[],
  required: readonly string[],
): boolean {
  return required.every((p) => hasEffectivePermission(codes, p));
}

export function permissionsByGroup(): Record<
  PermissionGroupId,
  PermissionDefinition[]
> {
  const map = {} as Record<PermissionGroupId, PermissionDefinition[]>;
  for (const id of Object.keys(PERMISSION_GROUP_LABELS) as PermissionGroupId[]) {
    map[id] = [];
  }
  for (const def of PERMISSION_CATALOG) {
    map[def.group].push(def);
  }
  return map;
}
