import pg from 'pg';
import { resolveDatabaseUrl } from '../src/prisma/create-pg-adapter';
import {
  tenantHasDedicatedDatabase,
  tenantPhysicalSchema,
} from '../src/tenant/tenant-storage';
import { decryptTenantDatabaseUrl } from '../src/tenant/tenant-database-url.crypto';
import { tenantTable } from '../src/tenant/tenant-sql';
import { isMissingRelationError } from '../src/tenant/tenant-sql-errors';

describe('Tenant rollout (e2e-safe)', () => {
  it('detects missing relation errors from raw SQL', () => {
    expect(isMissingRelationError({ code: '42P01' })).toBe(true);
    expect(
      isMissingRelationError(new Error('relation "import_jobs" does not exist')),
    ).toBe(true);
    expect(isMissingRelationError(new Error('syntax error'))).toBe(false);
  });
  it('routes all tenants through dedicated database public schema', () => {
    expect(
      tenantPhysicalSchema('database', 'legacy_tenant', {
        databaseUrlEncrypted: 'v1:encrypted',
      }),
    ).toBe('public');
    expect(tenantPhysicalSchema('database', 'legacy_tenant', null)).toBe(
      'public',
    );
    expect(tenantHasDedicatedDatabase({ databaseUrlEncrypted: 'v1:x' })).toBe(
      true,
    );
  });

  it('tenantTable produces unqualified references for withTenantSchema', () => {
    expect(tenantTable('users')).toBe('"users"');
    expect(tenantTable('sale_items')).toBe('"sale_items"');
  });
});

describe('Tenant rollout smoke (integration)', () => {
  const tenant = process.env.TENANT_ROLLOUT_SMOKE_TENANT?.trim();
  const runIntegration = process.env.TENANT_ROLLOUT_INTEGRATION === '1';

  (runIntegration && tenant ? it : it.skip)(
    'database-mode tenant has core ERP tables (login/POS/sales/imports/accounting)',
    async () => {
      const controlUrl = resolveDatabaseUrl();
      if (!controlUrl) throw new Error('DATABASE_URL required');

      const control = new pg.Pool({ connectionString: controlUrl, max: 2 });
      try {
        const { rows } = await control.query<{
          database_url_encrypted: string;
        }>(
          `SELECT database_url_encrypted
           FROM "public"."Tenant"
           WHERE schema_name = $1 OR slug = $1
           LIMIT 1`,
          [tenant!],
        );
        const row = rows[0];
        if (!row?.database_url_encrypted) {
          throw new Error(`Tenant ${tenant} is not database-mode`);
        }

        const tenantUrl = decryptTenantDatabaseUrl(row.database_url_encrypted);
        const pool = new pg.Pool({ connectionString: tenantUrl, max: 2 });
        try {
          for (const table of [
            'users',
            'branches',
            'products',
            'sales',
            'chart_of_accounts',
            'journal_entries',
            'journal_lines',
            'import_jobs',
            'report_export_jobs',
            'tenant_settings',
            'stock_transfers',
          ]) {
            await pool.query(`SELECT 1 FROM "${table}" LIMIT 1`);
          }

          const dash = await pool.query<{ sales: string }>(
            `SELECT COALESCE(SUM(CASE WHEN coa.account_key = 'sales_revenue'
              THEN jl.credit - jl.debit ELSE 0 END), 0)::text AS sales
             FROM journal_lines jl
             INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
             INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
             LIMIT 1`,
          );
          expect(dash.rows[0]?.sales).toBeDefined();
        } finally {
          await pool.end();
        }
      } finally {
        await control.end();
      }
    },
    60_000,
  );
});
