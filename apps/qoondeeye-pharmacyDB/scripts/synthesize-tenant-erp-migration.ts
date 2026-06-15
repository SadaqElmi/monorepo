/**
 * Generates prisma/tenant/migrations/*_erp_extensions/migration.sql from legacy
 * TenantService runtime DDL (git ab4db44). Run after editing extraction rules.
 *
 *   pnpm ts-node scripts/synthesize-tenant-erp-migration.ts
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const APP_ROOT = join(__dirname, '..');
const INIT_MIGRATION = readFileSync(
  join(
    APP_ROOT,
    'prisma/tenant/migrations/20260610091000_init_public_tenant/migration.sql',
  ),
  'utf8',
);

const EXISTING_TABLES = new Set<string>();
for (const m of INIT_MIGRATION.matchAll(/CREATE TABLE "([^"]+)"/g)) {
  EXISTING_TABLES.add(m[1]!);
}

/** Tables created in erp_extensions (not in init migration). */
const EXTENSION_TABLES = [
  'chart_of_accounts',
  'journal_entries',
  'journal_lines',
  'audit_logs',
  'audit_log_archive',
  'accounting_journal_books',
  'accounting_period_workflow',
  'tenant_settings',
  'import_jobs',
  'import_job_rows',
  'opening_stock_entries',
  'report_export_jobs',
  'report_snapshots',
  'stock_transfers',
  'stock_transfer_items',
  'stock_transfer_events',
  'transfer_error_log',
  'api_idempotency',
  'ops_metric_counters',
  'consolidation_runs',
  'consolidation_journal_links',
  'consolidation_run_events',
  'entities',
  'entity_branches',
  'entity_ownership',
  'fx_rates',
  'consolidation_adjustments',
  'branch_account_balance_snapshot',
  'payment_terms',
  'follow_up_levels',
  'product_category_gl_map',
  'online_payment_providers',
  'payment_methods_catalog',
  'customer_payments',
  'customer_payment_allocations',
  'supplier_payments',
  'purchase_refunds',
  'cash_accounts',
  'cash_transactions',
];

const METHOD_MARKERS = [
  'ensureAccountingSchema',
  'ensureAccountingExtensions',
  'ensureImportJobsTables',
  'ensureOpeningStockEntriesTable',
  'ensureReportExportJobsTable',
  'ensureStockTransfersTables',
  'ensureAuditLogArchiveTable',
  'ensureAccountingPeriodWorkflowTable',
  'ensureConsolidationTables',
  'ensureEntityStructure',
  'ensureEnterpriseConsolidationTables',
  'ensureBranchAccountBalanceSnapshotTable',
  'ensureJournalEntriesBranchDateSourceIndex',
  'ensureTenantSettingsTable',
  'ensureImportJobsReversalColumns',
  'ensureOpeningStockEntryColumns',
];

function loadLegacyTenantService(): string {
  try {
    return execSync(
      'git show ab4db44:apps/qoondeeye-pharmacyDB/src/tenant/tenant.service.ts',
      { cwd: join(APP_ROOT, '../..'), encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
    );
  } catch {
    const fallback = join(process.env.TEMP ?? '/tmp', 'old-tenant-service.ts');
    return readFileSync(fallback, 'utf8');
  }
}

function transformSql(raw: string): string {
  return raw
    .replace(/"\$\{schemaName\}"\."([^"]+)"/g, '"$1"')
    .replace(/"\$\{esc\}"\."([^"]+)"/g, '"$1"')
    .replace(/"tenant_template"\."([^"]+)"/g, '"$1"')
    .replace(/tenant_template\./g, '')
    .replace(/DROP INDEX IF EXISTS "public"\./g, 'DROP INDEX IF EXISTS ')
    .replace(/\$\{schemaName\}/g, 'public')
    .trim();
}

function extractSqlBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /`\s*((?:CREATE|ALTER|DROP|INSERT|DO|WITH)[\s\S]*?)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const sql = m[1]!;
    if (!sql.includes('schemaName') && !sql.includes('tenant_template')) continue;
    if (!/\b(CREATE|ALTER|DROP|INSERT)\b/.test(sql)) continue;
    blocks.push(transformSql(sql));
  }
  return blocks;
}

function tableFromCreate(sql: string): string | null {
  const m = sql.match(/CREATE TABLE IF NOT EXISTS "([^"]+)"/i);
  return m?.[1] ?? null;
}

function isRelevant(sql: string): boolean {
  if (sql.includes('${')) return false;
  const lower = sql.toLowerCase();
  if (lower.includes('information_schema')) return false;
  if (lower.includes('pg_catalog')) return false;
  if (lower.includes('duplicate_columnvalues') || lower.includes('duplicate_groups'))
    return false;

  const createTable = tableFromCreate(sql);
  if (createTable) {
    if (EXISTING_TABLES.has(createTable)) return false;
    return EXTENSION_TABLES.includes(createTable);
  }

  for (const table of EXTENSION_TABLES) {
    if (
      lower.includes(`"${table}"`) ||
      lower.includes(` ${table} `) ||
      lower.includes(` ${table}.`) ||
      lower.includes(`alter table "${table}"`)
    ) {
      return true;
    }
  }

  const alterTargets = [
    'branches',
    'journal_entries',
    'journal_lines',
    'import_jobs',
    'import_job_rows',
    'opening_stock_entries',
    'consolidation_runs',
    'entity_ownership',
    'entities',
    'sales',
    'purchases',
    'sale_returns',
    'expense_categories',
    'stock_transfers',
    'stock_transfer_items',
    'customers',
  ];
  if (/^ALTER TABLE/i.test(sql.trim())) {
    return alterTargets.some((t) => lower.includes(`"${t}"`));
  }

  if (/^INSERT INTO "entities"/i.test(sql.trim())) return true;
  if (/^INSERT INTO "entity_branches"/i.test(sql.trim())) return true;
  if (/^INSERT INTO "tenant_settings"/i.test(sql.trim())) return true;

  if (/^CREATE (UNIQUE )?INDEX/i.test(sql.trim())) {
    return EXTENSION_TABLES.some((t) => lower.includes(t));
  }

  return false;
}

function dedupe(statements: string[]): string[] {
  const seen = new Set<string>();
  const createByTable = new Map<string, string>();
  const out: string[] = [];
  for (const s of statements) {
    const key = s.replace(/\s+/g, ' ').trim();
    const createTable = tableFromCreate(s);
    if (createTable) {
      createByTable.set(createTable, s.endsWith(';') ? s : `${s};`);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s.endsWith(';') ? s : `${s};`);
  }
  const creates = CREATE_TABLE_ORDER.filter((t) => createByTable.has(t)).map(
    (t) => createByTable.get(t)!,
  );
  const extraCreates = [...createByTable.entries()]
    .filter(([t]) => !CREATE_TABLE_ORDER.includes(t))
    .map(([, sql]) => sql);
  return [...creates, ...extraCreates, ...out];
}

const CREATE_TABLE_ORDER = [
  'cash_accounts',
  'cash_transactions',
  'chart_of_accounts',
  'journal_entries',
  'accounting_journal_books',
  'journal_lines',
  'audit_logs',
  'audit_log_archive',
  'accounting_period_workflow',
  'entities',
  'entity_branches',
  'entity_ownership',
  'consolidation_runs',
  'consolidation_journal_links',
  'consolidation_run_events',
  'fx_rates',
  'consolidation_adjustments',
  'branch_account_balance_snapshot',
  'tenant_settings',
  'payment_terms',
  'follow_up_levels',
  'product_category_gl_map',
  'online_payment_providers',
  'payment_methods_catalog',
  'customer_payments',
  'customer_payment_allocations',
  'supplier_payments',
  'purchase_refunds',
  'report_snapshots',
  'report_export_jobs',
  'stock_transfers',
  'stock_transfer_items',
  'stock_transfer_events',
  'transfer_error_log',
  'api_idempotency',
  'ops_metric_counters',
  'import_jobs',
  'import_job_rows',
  'opening_stock_entries',
];

function tableFromStatement(sql: string): string | null {
  const create = sql.match(/CREATE TABLE IF NOT EXISTS "([^"]+)"/i);
  if (create) return create[1]!;
  const alter = sql.match(/ALTER TABLE "([^"]+)"/i);
  if (alter) return alter[1]!;
  const index = sql.match(/(?:ON|FROM) "([^"]+)"/i);
  if (index) return index[1]!;
  const insert = sql.match(/INSERT INTO "([^"]+)"/i);
  if (insert) return insert[1]!;
  return null;
}

function statementRank(sql: string): number {
  const trimmed = sql.trim();
  if (/^CREATE TABLE IF NOT EXISTS/i.test(trimmed)) return 0;
  if (/^ALTER TABLE/i.test(trimmed)) return 1;
  if (/^DO \$/i.test(trimmed)) return 1;
  if (/^DROP INDEX/i.test(trimmed)) return 2;
  if (/^CREATE (UNIQUE )?INDEX/i.test(trimmed)) return 3;
  if (/^INSERT INTO/i.test(trimmed)) return 4;
  if (/^WITH /i.test(trimmed)) return 1;
  return 5;
}

function sortStatements(statements: string[]): string[] {
  const tableOrder = new Map(
    CREATE_TABLE_ORDER.map((name, index) => [name, index]),
  );
  return [...statements].sort((a, b) => {
    const rankDiff = statementRank(a) - statementRank(b);
    if (rankDiff !== 0) return rankDiff;
    const ta = tableFromStatement(a);
    const tb = tableFromStatement(b);
    const oa = ta ? (tableOrder.get(ta) ?? 999) : 999;
    const ob = tb ? (tableOrder.get(tb) ?? 999) : 999;
    return oa - ob;
  });
}

function normalizeAlterColumns(sql: string): string {
  return sql.replace(/ADD COLUMN(?! IF NOT EXISTS)/gi, 'ADD COLUMN IF NOT EXISTS');
}

function postProcess(statements: string[]): string[] {
  const hasAuditLogsCreate = statements.some((s) =>
    /CREATE TABLE IF NOT EXISTS "audit_logs"/i.test(s),
  );
  const filtered = statements
    .filter((s) => {
      if (hasAuditLogsCreate && /^ALTER TABLE "audit_logs"/i.test(s.trim())) {
        return false;
      }
      return true;
    })
    .map(normalizeAlterColumns);
  return sortStatements(filtered);
}

function main(): void {
  const source = loadLegacyTenantService();
  const blocks = extractSqlBlocks(source).filter(isRelevant);
  const ordered = postProcess(dedupe(blocks));

  const header = `-- ERP extensions for dedicated tenant databases.
-- Synthesized from legacy TenantService runtime DDL (schema-per-tenant era).
-- Do not edit by hand; regenerate with: pnpm tenant:synthesize:erp-migration

`;

  const migrationDir = join(
    APP_ROOT,
    'prisma/tenant/migrations/20260610100000_erp_extensions',
  );
  mkdirSync(migrationDir, { recursive: true });
  const outPath = join(migrationDir, 'migration.sql');
  writeFileSync(outPath, header + ordered.join('\n\n') + '\n', 'utf8');
  console.log(`Wrote ${ordered.length} statements to ${outPath}`);
}

main();
