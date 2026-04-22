import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Tenant } from '@prisma/client';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);
  private readonly inventoryMatrixBackfillApplied = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find tenant by domain (e.g. pharmacy1.yourapp.com -> pharmacy1)
   */
  async findByDomain(domain: string): Promise<Tenant | null> {
    return this.prisma.domain
      .findUnique({
        where: { domain },
        include: { tenant: true },
      })
      .then((d) => d?.tenant ?? null);
  }

  /**
   * Find tenant by schema name
   */
  async findBySchemaName(schemaName: string): Promise<Tenant | null> {
    // Only return active tenants (used for tenant-scoped access).
    return this.prisma.tenant.findFirst({
      where: { schemaName, status: 'active' },
    });
  }

  /**
   * Find tenant by schema name regardless of status.
   * Use this when you need to show a helpful "inactive/suspended" error.
   */
  async findBySchemaNameAny(schemaName: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({
      where: { schemaName },
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { domains: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  /**
   * Get all tenants
   */
  async findAll(): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({
      include: { domains: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a new tenant and provision its schema
   */
  async create(input: {
    name: string;
    domain?: string;
    schemaName?: string;
    domains?: string[];
  }): Promise<Tenant> {
    const schemaName = this.resolveSchemaName(input);
    const allDomains = this.collectDomains(input);

    const existing = await this.prisma.tenant.findUnique({
      where: { schemaName },
    });
    if (existing) {
      throw new ConflictException(
        `Tenant with schema "${schemaName}" already exists`,
      );
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: input.name,
        schemaName,
        status: 'active',
      },
    });

    if (allDomains.length) {
      await this.prisma.domain.createMany({
        data: allDomains.map((domain) => ({
          tenantId: tenant.id,
          domain: domain.trim().toLowerCase(),
        })),
      });
    }

    await this.provisionTenantSchema(schemaName);

    this.logger.log(`Tenant "${tenant.name}" (${schemaName}) provisioned`);
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
      include: { domains: true },
    });
  }

  async update(id: string, input: { name?: string; status?: string }) {
    await this.findOne(id);
    return this.prisma.tenant.update({
      where: { id },
      data: { name: input.name, status: input.status },
      include: { domains: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.tenant.delete({ where: { id } });
    return { deleted: true };
  }

  private resolveSchemaName(input: {
    name: string;
    domain?: string;
    schemaName?: string;
  }): string {
    if (input.schemaName) {
      return input.schemaName.toLowerCase().replace(/\s+/g, '_');
    }
    if (input.domain) {
      const subdomain = input.domain.split('.')[0];
      return (
        subdomain
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '') || 'tenant'
      );
    }
    return (
      input.name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') || 'tenant'
    );
  }

  private collectDomains(input: {
    domain?: string;
    domains?: string[];
  }): string[] {
    const list: string[] = [];
    if (input.domain?.trim()) list.push(input.domain.trim());
    if (input.domains?.length) list.push(...input.domains);
    return [...new Set(list)];
  }

  /**
   * Provision a new tenant schema (creates schema + all tables).
   * If the schema already exists but has no "roles" table, creates missing tables (e.g. empty schema).
   */
  async provisionTenantSchema(schemaName: string): Promise<void> {
    const schemas = await this.prisma.$queryRawUnsafe<
      { schema_name: string }[]
    >(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      schemaName,
    );

    const schemaExists = schemas.length > 0;
    if (schemaExists) {
      const tablesExist = await this.prisma.$queryRawUnsafe<
        { table_name: string }[]
      >(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'roles'`,
        schemaName,
      );
      if (tablesExist.length > 0) {
        this.logger.warn(
          `Schema "${schemaName}" already provisioned, skipping`,
        );
        await this.ensureTenantBranchIsolationColumns(schemaName);
        return;
      }
      this.logger.log(
        `Schema "${schemaName}" exists but has no tables, provisioning...`,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`,
      );
    }

    const tables: string[] = [
      `CREATE TABLE "${schemaName}"."roles" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) UNIQUE NOT NULL
      )`,
      `CREATE TABLE "${schemaName}"."permissions" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE
      )`,
      `CREATE TABLE "${schemaName}"."branches" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "${schemaName}"."users" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200),
        cashier_id VARCHAR(120) UNIQUE,
        email VARCHAR(200) UNIQUE,
        password TEXT,
        pin_hash TEXT,
        role_id UUID REFERENCES "${schemaName}"."roles"(id),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "${schemaName}"."product_categories" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL
      )`,
      `CREATE TABLE "${schemaName}"."products" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        generic_name VARCHAR(255),
        barcode VARCHAR(100),
        list_price NUMERIC(10,2),
        strength VARCHAR(100),
        formulation VARCHAR(100),
        category_id UUID REFERENCES "${schemaName}"."product_categories"(id),
        unit VARCHAR(50),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_not_null ON "${schemaName}"."products"(barcode) WHERE barcode IS NOT NULL AND TRIM(barcode) <> ''`,
      `CREATE INDEX IF NOT EXISTS idx_products_barcode ON "${schemaName}"."products"(barcode)`,
      `CREATE TABLE "${schemaName}"."suppliers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "${schemaName}"."customers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "${schemaName}"."purchases" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id UUID REFERENCES "${schemaName}"."suppliers"(id),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        invoice_number VARCHAR(100),
        total_amount NUMERIC(12,2),
        purchase_date DATE,
        on_credit BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "${schemaName}"."supplier_payments" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id),
        supplier_id UUID NOT NULL REFERENCES "${schemaName}"."suppliers"(id),
        amount NUMERIC(14,2) NOT NULL,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        reference VARCHAR(255),
        notes TEXT,
        payment_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_supplier_payments_branch ON "${schemaName}"."supplier_payments"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON "${schemaName}"."supplier_payments"(supplier_id)`,
      `CREATE TABLE "${schemaName}"."purchase_items" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        purchase_id UUID REFERENCES "${schemaName}"."purchases"(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        product_id UUID REFERENCES "${schemaName}"."products"(id),
        batch_id UUID REFERENCES "${schemaName}"."batches"(id),
        quantity INTEGER,
        cost_price NUMERIC(10,2),
        selling_price NUMERIC(10,2),
        expiry_date DATE
      )`,
      `CREATE TABLE "${schemaName}"."batches" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        product_id UUID REFERENCES "${schemaName}"."products"(id),
        batch_number VARCHAR(100),
        expiry_date DATE,
        quantity INTEGER,
        cost_price NUMERIC(10,2),
        selling_price NUMERIC(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_batches_expiry ON "${schemaName}"."batches"(expiry_date)`,
      `CREATE INDEX IF NOT EXISTS idx_batches_fifo ON "${schemaName}"."batches"(branch_id, product_id, expiry_date, created_at)`,
      `CREATE TABLE "${schemaName}"."inventory" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES "${schemaName}"."products"(id),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        quantity INTEGER DEFAULT 0,
        reorder_level INTEGER DEFAULT 10,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_inventory_product ON "${schemaName}"."inventory"(product_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_branch_unique ON "${schemaName}"."inventory"(product_id, branch_id)`,
      `CREATE TABLE "${schemaName}"."sales" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        receipt_number VARCHAR(20),
        total_amount NUMERIC(12,2),
        discount NUMERIC(10,2) DEFAULT 0,
        tax NUMERIC(10,2) DEFAULT 0,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS sales_branch_receipt_unique ON "${schemaName}"."sales"(branch_id, receipt_number)`,
      `CREATE INDEX IF NOT EXISTS sales_branch_id_receipt_number_idx ON "${schemaName}"."sales"(branch_id, receipt_number)`,
      `CREATE INDEX IF NOT EXISTS idx_sales_date ON "${schemaName}"."sales"(sale_date)`,
      `CREATE TABLE "${schemaName}"."sale_items" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES "${schemaName}"."sales"(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        product_id UUID REFERENCES "${schemaName}"."products"(id),
        batch_id UUID REFERENCES "${schemaName}"."batches"(id),
        quantity INTEGER,
        price NUMERIC(10,2),
        total NUMERIC(10,2)
      )`,
      `CREATE TABLE "${schemaName}"."sale_returns" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES "${schemaName}"."sales"(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        reason TEXT,
        return_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON "${schemaName}"."sale_returns"(sale_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_date ON "${schemaName}"."sale_returns"(return_date)`,
      `CREATE TABLE "${schemaName}"."sale_return_items" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_return_id UUID REFERENCES "${schemaName}"."sale_returns"(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "${schemaName}"."products"(id),
        batch_id UUID REFERENCES "${schemaName}"."batches"(id),
        sale_item_id UUID REFERENCES "${schemaName}"."sale_items"(id),
        quantity INTEGER NOT NULL
      )`,
      `CREATE TABLE "${schemaName}"."payments" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES "${schemaName}"."sales"(id),
        method VARCHAR(50),
        amount NUMERIC(10,2),
        paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "${schemaName}"."expense_categories" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        gl_account_key VARCHAR(50)
      )`,
      `CREATE TABLE "${schemaName}"."expenses" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id UUID REFERENCES "${schemaName}"."expense_categories"(id),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        amount NUMERIC(12,2),
        description TEXT,
        expense_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "${schemaName}"."cash_accounts" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        type VARCHAR(50),
        balance NUMERIC(12,2) DEFAULT 0
      )`,
      `CREATE TABLE "${schemaName}"."cash_transactions" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        account_id UUID REFERENCES "${schemaName}"."cash_accounts"(id),
        type VARCHAR(10),
        amount NUMERIC(12,2),
        reference VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "${schemaName}"."chart_of_accounts" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id) ON DELETE CASCADE,
        code VARCHAR(32),
        name VARCHAR(255) NOT NULL,
        account_type VARCHAR(20) NOT NULL,
        account_key VARCHAR(50) NOT NULL,
        is_system BOOLEAN DEFAULT TRUE,
        payment_method_key VARCHAR(50),
        parent_id UUID REFERENCES "${schemaName}"."chart_of_accounts"(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, account_key)
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS chart_of_accounts_branch_payment_key_uq ON "${schemaName}"."chart_of_accounts"(branch_id, payment_method_key) WHERE payment_method_key IS NOT NULL`,
      `CREATE TABLE "${schemaName}"."journal_entries" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id),
        entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
        description TEXT,
        source_type VARCHAR(32) NOT NULL,
        source_id UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_source_uq ON "${schemaName}"."journal_entries"(branch_id, source_type, source_id) WHERE source_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS journal_entries_branch_date_idx ON "${schemaName}"."journal_entries"(branch_id, entry_date)`,
      `CREATE TABLE "${schemaName}"."journal_lines" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        journal_entry_id UUID NOT NULL REFERENCES "${schemaName}"."journal_entries"(id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES "${schemaName}"."chart_of_accounts"(id),
        debit NUMERIC(14,2) DEFAULT 0 NOT NULL,
        credit NUMERIC(14,2) DEFAULT 0 NOT NULL,
        CONSTRAINT journal_lines_one_side_positive CHECK (
          (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
        )
      )`,
      `CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON "${schemaName}"."journal_lines"(journal_entry_id)`,
      `CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON "${schemaName}"."journal_lines"(account_id)`,
      `CREATE TABLE "${schemaName}"."patient_loans" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES "${schemaName}"."customers"(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        sale_id UUID REFERENCES "${schemaName}"."sales"(id) ON DELETE SET NULL,
        total_amount NUMERIC(12,2) NOT NULL,
        amount_paid NUMERIC(12,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'ongoing',
        due_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "${schemaName}"."patient_loan_payments" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        loan_id UUID NOT NULL REFERENCES "${schemaName}"."patient_loans"(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL,
        payment_method VARCHAR(50),
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "${schemaName}"."notifications" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255),
        message TEXT,
        type VARCHAR(50),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE "${schemaName}"."role_permissions" (
        role_id UUID REFERENCES "${schemaName}"."roles"(id),
        permission_id UUID REFERENCES "${schemaName}"."permissions"(id),
        PRIMARY KEY(role_id, permission_id)
      )`,
    ];

    for (const sql of tables) {
      await this.prisma.$executeRawUnsafe(sql);
    }

    const seedSql: string[] = [
      `INSERT INTO "${schemaName}"."roles" (name) VALUES
        ('admin'),
        ('manager'),
        ('pharmacist'),
        ('cashier')`,
      `INSERT INTO "${schemaName}"."permissions" (name) VALUES
        ('create_product'),
        ('edit_product'),
        ('delete_product'),
        ('view_reports'),
        ('manage_users'),
        ('run_consolidation'),
        ('reverse_consolidation'),
        ('view_consolidation_history')`,
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
        SELECT r.id, p.id
        FROM "${schemaName}"."roles" r
        CROSS JOIN "${schemaName}"."permissions" p
        WHERE r.name = 'admin'`,
    ];

    for (const sql of seedSql) {
      await this.prisma.$executeRawUnsafe(sql);
    }

    this.logger.log(`Schema "${schemaName}" provisioned with all tables`);
  }

  /**
   * Apply idempotent upgrades for an existing tenant schema (e.g. `pin_hash`, branch columns).
   * Safe to call on every request; use when a code path bypasses provision (e.g. public PIN login).
   */
  async applyTenantSchemaPatches(schemaName: string): Promise<void> {
    await this.ensureTenantBranchIsolationColumns(schemaName);
    await this.ensureInventoryMatrixCoverage(schemaName);
    await this.ensureStockTransfersTables(schemaName);
    await this.ensureReportSnapshotsTable(schemaName);
    await this.ensureReportSnapshotsSnapshotDiffColumn(schemaName);
    await this.ensureReportExportJobsTable(schemaName);
    await this.ensureReportExportJobsRetryColumns(schemaName);
    await this.ensureChartOfAccountsIsInterbranchColumn(schemaName);
    await this.ensureChartOfAccountsInterbranchTypeColumn(schemaName);
    await this.ensureBranchAccountBalanceSnapshotTable(schemaName);
    await this.ensureJournalEntriesBranchDateSourceIndex(schemaName);
    await this.ensureAuditLogHashChainColumns(schemaName);
    await this.ensureAccountingPeriodWorkflowTable(schemaName);
    await this.ensureEntityStructure(schemaName);
    await this.ensureConsolidationTables(schemaName);
    await this.ensureEnterpriseConsolidationTables(schemaName);
    await this.ensureConsolidationBranch(schemaName);
    await this.ensureConsolidationPermissions(schemaName);
    await this.ensureAuditLogArchiveTable(schemaName);
  }

  private async ensureAuditLogArchiveTable(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."audit_log_archive" (
        id UUID NOT NULL,
        archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        row_data JSONB NOT NULL,
        PRIMARY KEY (id, archived_at)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_audit_log_archive_archived_at
       ON "${schemaName}"."audit_log_archive"(archived_at DESC)`,
    );
  }

  private async ensureAuditLogHashChainColumns(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."audit_logs"
       ADD COLUMN IF NOT EXISTS entity_type VARCHAR(128)`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."audit_logs"
       ADD COLUMN IF NOT EXISTS entity_id TEXT`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."audit_logs"
       ADD COLUMN IF NOT EXISTS user_id UUID`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."audit_logs"
       ADD COLUMN IF NOT EXISTS before_json JSONB`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."audit_logs"
       ADD COLUMN IF NOT EXISTS after_json JSONB`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."audit_logs"
       ADD COLUMN IF NOT EXISTS event_ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."audit_logs"
       ADD COLUMN IF NOT EXISTS prev_hash VARCHAR(128)`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."audit_logs"
       ADD COLUMN IF NOT EXISTS audit_hash VARCHAR(128)`,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."audit_logs"
       SET entity_type = COALESCE(entity_type, table_name),
           entity_id = COALESCE(entity_id, record_id::text),
           user_id = COALESCE(user_id, actor_user_id),
           before_json = COALESCE(before_json, old_payload),
           after_json = COALESCE(after_json, new_payload),
           event_ts = COALESCE(event_ts, created_at)
       WHERE entity_type IS NULL
          OR entity_id IS NULL
          OR user_id IS NULL
          OR before_json IS NULL
          OR after_json IS NULL
          OR event_ts IS NULL`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_event_ts
       ON "${schemaName}"."audit_logs"(event_ts DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_hash
       ON "${schemaName}"."audit_logs"(audit_hash)`,
    );
  }

  private async ensureAccountingPeriodWorkflowTable(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."accounting_period_workflow" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        scope_hash VARCHAR(64) NOT NULL,
        period_key VARCHAR(128) NOT NULL,
        period_end DATE NOT NULL,
        state VARCHAR(24) NOT NULL DEFAULT 'open',
        prepared_by UUID,
        prepared_at TIMESTAMP,
        approved_by UUID,
        approved_at TIMESTAMP,
        reopened_by UUID,
        reopened_at TIMESTAMP,
        closed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(scope_hash, period_key)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_period_workflow_state
       ON "${schemaName}"."accounting_period_workflow"(state, period_end DESC)`,
    );
  }

  private async ensureConsolidationTables(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."consolidation_runs" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        period_key VARCHAR(32) NOT NULL,
        as_of_date DATE NOT NULL,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        scope_hash VARCHAR(64) NOT NULL,
        scope_branch_ids JSONB NOT NULL,
        entity_id UUID REFERENCES "${schemaName}"."entities"(id) ON DELETE SET NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'posted',
        created_by UUID,
        reversed_by UUID,
        posted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reversed_at TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_consolidation_runs_period_created
       ON "${schemaName}"."consolidation_runs"(period_key, created_at DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_consolidation_runs_scope_created
       ON "${schemaName}"."consolidation_runs"(scope_hash, created_at DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."consolidation_runs"
       ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES "${schemaName}"."entities"(id) ON DELETE SET NULL`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_consolidation_runs_entity_period
       ON "${schemaName}"."consolidation_runs"(entity_id, period_key, created_at DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."consolidation_runs"
       ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP(6)`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."consolidation_runs"
       ADD COLUMN IF NOT EXISTS finalized_by UUID`,
    );
    await this.prisma.$executeRawUnsafe(
      `DROP INDEX IF EXISTS "${schemaName}".uq_consolidation_runs_active_scope_period`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_consolidation_runs_posted_final_scope_period
       ON "${schemaName}"."consolidation_runs"(period_key, scope_hash)
       WHERE reversed_at IS NULL AND status IN ('posted','finalized')`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_consolidation_runs_draft_scope_period
       ON "${schemaName}"."consolidation_runs"(period_key, scope_hash)
       WHERE reversed_at IS NULL AND status = 'draft'`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."consolidation_journal_links" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES "${schemaName}"."consolidation_runs"(id) ON DELETE CASCADE,
        journal_entry_id UUID NOT NULL REFERENCES "${schemaName}"."journal_entries"(id) ON DELETE CASCADE,
        elimination_type VARCHAR(24) NOT NULL,
        account_key VARCHAR(64),
        direction VARCHAR(8),
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        source_refs JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_consolidation_links_run_created
       ON "${schemaName}"."consolidation_journal_links"(run_id, created_at DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_consolidation_links_journal
       ON "${schemaName}"."consolidation_journal_links"(journal_entry_id)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."consolidation_run_events" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES "${schemaName}"."consolidation_runs"(id) ON DELETE CASCADE,
        event_type VARCHAR(32) NOT NULL,
        actor_user_id UUID,
        payload JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_consolidation_events_run_created
       ON "${schemaName}"."consolidation_run_events"(run_id, created_at DESC)`,
    );
  }

  private async ensureEntityStructure(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."entities" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        parent_entity_id UUID REFERENCES "${schemaName}"."entities"(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_entities_parent
       ON "${schemaName}"."entities"(parent_entity_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."entity_branches" (
        entity_id UUID NOT NULL REFERENCES "${schemaName}"."entities"(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (entity_id, branch_id)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_entity_branches_branch
       ON "${schemaName}"."entity_branches"(branch_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."entity_ownership" (
        parent_entity_id UUID NOT NULL REFERENCES "${schemaName}"."entities"(id) ON DELETE CASCADE,
        child_entity_id UUID NOT NULL REFERENCES "${schemaName}"."entities"(id) ON DELETE CASCADE,
        ownership_percent NUMERIC(5,2) NOT NULL DEFAULT 100.00,
        effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
        effective_to DATE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (parent_entity_id, child_entity_id),
        CONSTRAINT entity_ownership_no_self CHECK (parent_entity_id <> child_entity_id),
        CONSTRAINT entity_ownership_percent_range CHECK (ownership_percent > 0 AND ownership_percent <= 100.00),
        CONSTRAINT entity_ownership_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
      )`,
    );
    // Phase 2A created entity_ownership without effective dates; CREATE TABLE IF NOT EXISTS does not alter it.
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."entity_ownership"
       ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."entity_ownership"
       ADD COLUMN IF NOT EXISTS effective_to DATE`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."entity_ownership"
       DROP CONSTRAINT IF EXISTS entity_ownership_100_only`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."entity_ownership"
       DROP CONSTRAINT IF EXISTS entity_ownership_percent_range`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."entity_ownership"
       ADD CONSTRAINT entity_ownership_percent_range
       CHECK (ownership_percent > 0 AND ownership_percent <= 100.00)`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."entity_ownership"
       DROP CONSTRAINT IF EXISTS entity_ownership_effective_range`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."entity_ownership"
       ADD CONSTRAINT entity_ownership_effective_range
       CHECK (effective_to IS NULL OR effective_to >= effective_from)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_entity_ownership_parent
       ON "${schemaName}"."entity_ownership"(parent_entity_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_entity_ownership_child
       ON "${schemaName}"."entity_ownership"(child_entity_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_entity_ownership_effective
       ON "${schemaName}"."entity_ownership"(parent_entity_id, effective_from, effective_to)`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."entities"
       ADD COLUMN IF NOT EXISTS reporting_currency VARCHAR(8) NOT NULL DEFAULT 'USD'`,
    );

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."entities" (name, code)
       VALUES ('Group Root', 'ROOT')
       ON CONFLICT (code) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."entity_branches"(entity_id, branch_id)
       SELECT e.id, b.id
       FROM "${schemaName}"."entities" e
       CROSS JOIN "${schemaName}"."branches" b
       WHERE e.code = 'ROOT'
       ON CONFLICT (entity_id, branch_id) DO NOTHING`,
    );
  }

  private async ensureEnterpriseConsolidationTables(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."fx_rates" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        from_currency VARCHAR(8) NOT NULL,
        to_currency VARCHAR(8) NOT NULL,
        rate_type VARCHAR(24) NOT NULL DEFAULT 'closing',
        rate NUMERIC(18,8) NOT NULL,
        as_of_date DATE NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fx_rate_positive CHECK (rate > 0),
        UNIQUE(from_currency, to_currency, rate_type, as_of_date)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup
       ON "${schemaName}"."fx_rates"(as_of_date DESC, from_currency, to_currency, rate_type)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."consolidation_adjustments" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        period_key VARCHAR(32) NOT NULL,
        scope_hash VARCHAR(64) NOT NULL,
        entity_id UUID REFERENCES "${schemaName}"."entities"(id) ON DELETE SET NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'draft',
        title VARCHAR(255) NOT NULL,
        justification TEXT,
        lines JSONB NOT NULL,
        approved_by UUID,
        approved_at TIMESTAMP,
        applied_run_id UUID REFERENCES "${schemaName}"."consolidation_runs"(id) ON DELETE SET NULL,
        created_by UUID,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_consolidation_adjustments_scope
       ON "${schemaName}"."consolidation_adjustments"(period_key, scope_hash, status)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_consolidation_adjustments_entity
       ON "${schemaName}"."consolidation_adjustments"(entity_id, status)`,
    );
  }

  private async ensureConsolidationBranch(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."branches" (name)
       SELECT 'CONSOLIDATION'
       WHERE NOT EXISTS (
         SELECT 1 FROM "${schemaName}"."branches"
         WHERE LOWER(TRIM(name)) = 'consolidation'
       )`,
    );
  }

  private async ensureConsolidationPermissions(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."roles" (name)
       VALUES ('accountant'),
              ('finance_manager'),
              ('auditor')
       ON CONFLICT (name) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."permissions" (name)
       VALUES ('run_consolidation'),
              ('reverse_consolidation'),
              ('view_consolidation_history'),
              ('finalize_consolidation'),
              ('approve_consolidation_adjustments'),
              ('view_audit_logs'),
              ('export_audit_package'),
              ('view_disclosure_reports')
       ON CONFLICT (name) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p
         ON p.name IN (
           'run_consolidation',
           'reverse_consolidation',
           'view_consolidation_history',
           'finalize_consolidation',
           'approve_consolidation_adjustments',
           'view_audit_logs',
           'export_audit_package',
           'view_disclosure_reports'
         )
       WHERE r.name = 'admin'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p
         ON p.name IN (
           'run_consolidation',
           'view_consolidation_history',
           'view_disclosure_reports'
         )
       WHERE r.name = 'accountant'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p
         ON p.name IN (
           'run_consolidation',
           'reverse_consolidation',
           'finalize_consolidation',
           'approve_consolidation_adjustments',
           'view_consolidation_history',
           'view_audit_logs',
           'export_audit_package',
           'view_disclosure_reports'
         )
       WHERE r.name = 'finance_manager'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p
         ON p.name IN (
           'view_consolidation_history',
           'view_audit_logs',
           'export_audit_package',
           'view_disclosure_reports'
         )
       WHERE r.name = 'auditor'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
  }

  /** Inter-company GL flag on chart rows (consolidation / reports). */
  private async ensureChartOfAccountsIsInterbranchColumn(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."chart_of_accounts" ADD COLUMN IF NOT EXISTS is_interbranch BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."chart_of_accounts"
       SET is_interbranch = TRUE
       WHERE account_key IN ('due_from_branch', 'due_to_branch')`,
    );
  }

  /**
   * Receivable / payable / clearing role for inter-branch GL (P&amp;L and consolidation hooks).
   * Default `none`; canonical due_* keys are seeded.
   */
  private async ensureChartOfAccountsInterbranchTypeColumn(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."chart_of_accounts" ADD COLUMN IF NOT EXISTS interbranch_type VARCHAR(24) NOT NULL DEFAULT 'none'`,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."chart_of_accounts"
       SET interbranch_type = 'receivable'
       WHERE account_key = 'due_from_branch'`,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."chart_of_accounts"
       SET interbranch_type = 'payable'
       WHERE account_key = 'due_to_branch'`,
    );
  }

  /**
   * Optional pre-aggregated balances (populated by a future job). Schema only for now.
   */
  private async ensureBranchAccountBalanceSnapshotTable(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."branch_account_balance_snapshot" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES "${schemaName}"."chart_of_accounts"(id) ON DELETE CASCADE,
        period_start DATE NOT NULL,
        balance NUMERIC(18,4) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, account_id, period_start)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_branch_acct_snap_branch_period
       ON "${schemaName}"."branch_account_balance_snapshot"(branch_id, period_start)`,
    );
  }

  /** Speed multi-branch financial reports (branch + date + source). */
  private async ensureJournalEntriesBranchDateSourceIndex(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_date_source
       ON "${schemaName}"."journal_entries"(branch_id, entry_date, source_type)`,
    );
  }

  /**
   * Backfill missing inventory rows for legacy tenants:
   * ensure every product has a row for every branch (qty defaults to zero).
   */
  private async ensureInventoryMatrixCoverage(
    schemaName: string,
  ): Promise<void> {
    if (this.inventoryMatrixBackfillApplied.has(schemaName)) {
      return;
    }

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."inventory" (product_id, branch_id, quantity, reorder_level)
       SELECT p.id, b.id, 0, 10
       FROM "${schemaName}"."products" p
       CROSS JOIN "${schemaName}"."branches" b
       LEFT JOIN "${schemaName}"."inventory" i
         ON i.product_id = p.id
        AND i.branch_id = b.id
       WHERE i.id IS NULL
       ON CONFLICT (product_id, branch_id) DO NOTHING`,
    );

    this.inventoryMatrixBackfillApplied.add(schemaName);
  }

  private async ensureReportSnapshotsSnapshotDiffColumn(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."report_snapshots" ADD COLUMN IF NOT EXISTS snapshot_diff JSONB`,
    );
  }

  private async ensureReportExportJobsRetryColumns(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."report_export_jobs" ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."report_export_jobs" ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3`,
    );
  }

  /** Idempotent: financial report daily snapshots (may predate this patch on old tenants). */
  private async ensureReportSnapshotsTable(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."report_snapshots" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_type VARCHAR(64) NOT NULL,
        scope_hash VARCHAR(64) NOT NULL,
        period_key VARCHAR(128) NOT NULL,
        snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
        period_start DATE,
        period_end DATE,
        as_of_date DATE,
        report_status VARCHAR(16) NOT NULL,
        is_final BOOLEAN NOT NULL DEFAULT FALSE,
        lock_date_used DATE,
        payload JSONB NOT NULL,
        snapshot_diff JSONB,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(report_type, scope_hash, period_key, snapshot_date)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_report_snapshots_lookup
       ON "${schemaName}"."report_snapshots"(report_type, scope_hash, period_key, snapshot_date DESC)`,
    );
  }

  /** Async PDF/XLSX export jobs (tenant-scoped). */
  private async ensureReportExportJobsTable(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."report_export_jobs" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_type VARCHAR(32) NOT NULL,
        format VARCHAR(8) NOT NULL,
        params JSONB NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        storage_path TEXT,
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        created_by UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_report_export_jobs_status_created
       ON "${schemaName}"."report_export_jobs"(status, created_at ASC)`,
    );
  }

  /** Inter-branch stock transfers (GET /api/transfers). Idempotent for existing tenants. */
  private async ensureStockTransfersTables(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."stock_transfers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_number VARCHAR(40),
        from_branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id),
        to_branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id),
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        approval_state VARCHAR(20) NOT NULL DEFAULT 'none',
        lock_version INTEGER NOT NULL DEFAULT 0,
        expected_date DATE,
        expected_stock_snapshot JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        confirmed_at TIMESTAMP,
        approved_by UUID REFERENCES "${schemaName}"."users"(id),
        approved_at TIMESTAMP,
        ship_accounting_state VARCHAR(20) NOT NULL DEFAULT 'pending',
        receive_accounting_state VARCHAR(20) NOT NULL DEFAULT 'pending',
        last_accounting_error TEXT,
        shipped_at TIMESTAMP,
        received_at TIMESTAMP,
        shipped_journal_entry_id UUID REFERENCES "${schemaName}"."journal_entries"(id),
        receive_journal_entry_id UUID REFERENCES "${schemaName}"."journal_entries"(id),
        ship_reversal_journal_entry_id UUID REFERENCES "${schemaName}"."journal_entries"(id),
        receive_reversal_journal_entry_id UUID REFERENCES "${schemaName}"."journal_entries"(id),
        is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
        reversed_by UUID REFERENCES "${schemaName}"."users"(id),
        reversed_at TIMESTAMP,
        reversal_reason TEXT,
        processing_lock_owner UUID REFERENCES "${schemaName}"."users"(id),
        processing_lock_until TIMESTAMP,
        processing_stage VARCHAR(50),
        created_by_name VARCHAR(200),
        reject_reason TEXT
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_transfers_from ON "${schemaName}"."stock_transfers"(from_branch_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_transfers_to ON "${schemaName}"."stock_transfers"(to_branch_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON "${schemaName}"."stock_transfers"(status)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."stock_transfer_items" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_id UUID NOT NULL REFERENCES "${schemaName}"."stock_transfers"(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id),
        quantity INTEGER NOT NULL,
        received_quantity INTEGER,
        unit_cost_snapshot NUMERIC(14,4),
        line_cost_snapshot NUMERIC(14,2),
        CONSTRAINT stock_transfer_items_qty_positive CHECK (quantity > 0)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON "${schemaName}"."stock_transfer_items"(transfer_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `DO $$
       BEGIN
         ALTER TABLE "${schemaName}"."stock_transfers"
           ADD CONSTRAINT stock_transfers_from_to_different
           CHECK (from_branch_id <> to_branch_id) NOT VALID;
       EXCEPTION
         WHEN duplicate_object THEN NULL;
       END $$`,
    );
    await this.prisma.$executeRawUnsafe(
      `WITH duplicate_groups AS (
         SELECT
           transfer_id,
           product_id,
           MIN(id::text)::uuid AS keep_id,
           SUM(quantity)::int AS total_qty
         FROM "${schemaName}"."stock_transfer_items"
         GROUP BY transfer_id, product_id
         HAVING COUNT(*) > 1
       )
       UPDATE "${schemaName}"."stock_transfer_items" sti
       SET quantity = dg.total_qty
       FROM duplicate_groups dg
       WHERE sti.id = dg.keep_id`,
    );
    await this.prisma.$executeRawUnsafe(
      `WITH duplicate_groups AS (
         SELECT
           transfer_id,
           product_id,
           MIN(id::text)::uuid AS keep_id
         FROM "${schemaName}"."stock_transfer_items"
         GROUP BY transfer_id, product_id
         HAVING COUNT(*) > 1
       )
       DELETE FROM "${schemaName}"."stock_transfer_items" sti
       USING duplicate_groups dg
       WHERE sti.transfer_id = dg.transfer_id
         AND sti.product_id = dg.product_id
         AND sti.id <> dg.keep_id`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer_product_unique
       ON "${schemaName}"."stock_transfer_items"(transfer_id, product_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."stock_transfer_events" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_id UUID NOT NULL REFERENCES "${schemaName}"."stock_transfers"(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        actor_user_id UUID REFERENCES "${schemaName}"."users"(id),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        message TEXT,
        metadata JSONB,
        payload JSONB,
        aggregate_version INTEGER NOT NULL DEFAULT 1,
        schema_version INTEGER NOT NULL DEFAULT 1,
        correlation_id TEXT,
        causation_id TEXT,
        idempotency_key TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_transfer_events_transfer ON "${schemaName}"."stock_transfer_events"(transfer_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `DO $$
       BEGIN
         CREATE TABLE IF NOT EXISTS "${schemaName}"."api_idempotency" (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           idempotency_key TEXT NOT NULL,
           request_fingerprint TEXT NOT NULL,
           method VARCHAR(12) NOT NULL,
           path TEXT NOT NULL,
           status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
           response_status_code INTEGER,
           response_body JSONB,
           error_message TEXT,
           expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           completed_at TIMESTAMP
         );
       EXCEPTION
         WHEN duplicate_table OR unique_violation THEN NULL;
       END $$`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_api_idempotency_key ON "${schemaName}"."api_idempotency"(idempotency_key)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_api_idempotency_expires_at ON "${schemaName}"."api_idempotency"(expires_at)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."transfer_error_log" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_id UUID REFERENCES "${schemaName}"."stock_transfers"(id) ON DELETE SET NULL,
        stage VARCHAR(50) NOT NULL,
        error_message TEXT NOT NULL,
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_transfer_error_log_transfer ON "${schemaName}"."transfer_error_log"(transfer_id, created_at DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `DO $$
       BEGIN
         CREATE TABLE IF NOT EXISTS "${schemaName}"."ops_metric_counters" (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
           metric_key VARCHAR(100) NOT NULL,
           outcome VARCHAR(20) NOT NULL,
           metric_count INTEGER NOT NULL DEFAULT 0,
           last_payload JSONB,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           UNIQUE(metric_date, metric_key, outcome)
         );
       EXCEPTION
         WHEN duplicate_table OR unique_violation THEN NULL;
       END $$`,
    );
    const transferCols: Array<{ column: string; alterSql: string }> = [
      {
        column: 'approved_by',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN approved_by UUID REFERENCES "${schemaName}"."users"(id)`,
      },
      {
        column: 'approved_at',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN approved_at TIMESTAMP`,
      },
      {
        column: 'shipped_journal_entry_id',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN shipped_journal_entry_id UUID REFERENCES "${schemaName}"."journal_entries"(id)`,
      },
      {
        column: 'receive_journal_entry_id',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN receive_journal_entry_id UUID REFERENCES "${schemaName}"."journal_entries"(id)`,
      },
      {
        column: 'lock_version',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 0`,
      },
      {
        column: 'expected_stock_snapshot',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN expected_stock_snapshot JSONB`,
      },
      {
        column: 'ship_accounting_state',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN ship_accounting_state VARCHAR(20) NOT NULL DEFAULT 'pending'`,
      },
      {
        column: 'receive_accounting_state',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN receive_accounting_state VARCHAR(20) NOT NULL DEFAULT 'pending'`,
      },
      {
        column: 'last_accounting_error',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN last_accounting_error TEXT`,
      },
      {
        column: 'ship_reversal_journal_entry_id',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN ship_reversal_journal_entry_id UUID REFERENCES "${schemaName}"."journal_entries"(id)`,
      },
      {
        column: 'receive_reversal_journal_entry_id',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN receive_reversal_journal_entry_id UUID REFERENCES "${schemaName}"."journal_entries"(id)`,
      },
      {
        column: 'is_reversed',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN is_reversed BOOLEAN NOT NULL DEFAULT FALSE`,
      },
      {
        column: 'reversed_by',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN reversed_by UUID REFERENCES "${schemaName}"."users"(id)`,
      },
      {
        column: 'reversed_at',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN reversed_at TIMESTAMP`,
      },
      {
        column: 'reversal_reason',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN reversal_reason TEXT`,
      },
      {
        column: 'processing_lock_owner',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN processing_lock_owner UUID REFERENCES "${schemaName}"."users"(id)`,
      },
      {
        column: 'processing_lock_until',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN processing_lock_until TIMESTAMP`,
      },
      {
        column: 'processing_stage',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfers"
          ADD COLUMN processing_stage VARCHAR(50)`,
      },
    ];
    for (const { column, alterSql } of transferCols) {
      const [row] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
        `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'stock_transfers' AND column_name = $2
        ) AS ok
        `,
        schemaName,
        column,
      );
      if (!row?.ok) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }

    const itemCols: Array<{ column: string; alterSql: string }> = [
      {
        column: 'unit_cost_snapshot',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_items"
          ADD COLUMN unit_cost_snapshot NUMERIC(14,4)`,
      },
      {
        column: 'line_cost_snapshot',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_items"
          ADD COLUMN line_cost_snapshot NUMERIC(14,2)`,
      },
    ];
    for (const { column, alterSql } of itemCols) {
      const [row] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
        `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'stock_transfer_items' AND column_name = $2
        ) AS ok
        `,
        schemaName,
        column,
      );
      if (!row?.ok) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }

    const eventCols: Array<{ column: string; alterSql: string }> = [
      {
        column: 'actor_user_id',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_events"
          ADD COLUMN actor_user_id UUID REFERENCES "${schemaName}"."users"(id)`,
      },
      {
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_events"
          ADD COLUMN branch_id UUID REFERENCES "${schemaName}"."branches"(id)`,
      },
      {
        column: 'metadata',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_events"
          ADD COLUMN metadata JSONB`,
      },
      {
        column: 'aggregate_version',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_events"
          ADD COLUMN aggregate_version INTEGER NOT NULL DEFAULT 1`,
      },
      {
        column: 'schema_version',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_events"
          ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1`,
      },
      {
        column: 'correlation_id',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_events"
          ADD COLUMN correlation_id TEXT`,
      },
      {
        column: 'causation_id',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_events"
          ADD COLUMN causation_id TEXT`,
      },
      {
        column: 'idempotency_key',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_events"
          ADD COLUMN idempotency_key TEXT`,
      },
    ];
    for (const { column, alterSql } of eventCols) {
      const [row] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
        `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'stock_transfer_events' AND column_name = $2
        ) AS ok
        `,
        schemaName,
        column,
      );
      if (!row?.ok) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }

    const idemCols: Array<{ column: string; alterSql: string }> = [
      {
        column: 'expires_at',
        alterSql: `ALTER TABLE "${schemaName}"."api_idempotency"
          ADD COLUMN expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')`,
      },
    ];
    for (const { column, alterSql } of idemCols) {
      const [row] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
        `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'api_idempotency' AND column_name = $2
        ) AS ok
        `,
        schemaName,
        column,
      );
      if (!row?.ok) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }

    await this.normalizeStockTransferEventIndexes(schemaName);
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfer_events_transfer_version ON "${schemaName}"."stock_transfer_events"(transfer_id, aggregate_version)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfer_events_idempotency ON "${schemaName}"."stock_transfer_events"(transfer_id, idempotency_key) WHERE idempotency_key IS NOT NULL`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_api_idempotency_expires_at ON "${schemaName}"."api_idempotency"(expires_at)`,
    );
  }

  /**
   * Legacy tenants can contain duplicate aggregate_version or idempotency rows
   * before unique indexes are added. Normalize first so index creation is safe.
   */
  private async normalizeStockTransferEventIndexes(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `WITH ordered AS (
         SELECT
           id,
           ROW_NUMBER() OVER (
             PARTITION BY transfer_id
             ORDER BY created_at ASC, id ASC
           ) AS next_version
         FROM "${schemaName}"."stock_transfer_events"
       )
       UPDATE "${schemaName}"."stock_transfer_events" e
       SET aggregate_version = o.next_version
       FROM ordered o
       WHERE e.id = o.id
         AND COALESCE(e.aggregate_version, 0) <> o.next_version`,
    );

    await this.prisma.$executeRawUnsafe(
      `WITH ranked AS (
         SELECT
           id,
           ROW_NUMBER() OVER (
             PARTITION BY transfer_id, idempotency_key
             ORDER BY created_at ASC, id ASC
           ) AS rn
         FROM "${schemaName}"."stock_transfer_events"
         WHERE idempotency_key IS NOT NULL
       )
       DELETE FROM "${schemaName}"."stock_transfer_events" e
       USING ranked r
       WHERE e.id = r.id
         AND r.rn > 1`,
    );
  }

  /**
   * Lightweight schema upgrade for branch isolation.
   * Existing tenants may be missing branch_id columns; ensure they're present.
   */
  private async ensureTenantBranchIsolationColumns(
    schemaName: string,
  ): Promise<void> {
    const checks: Array<{
      table: string;
      column: string;
      alterSql: string;
    }> = [
      {
        table: 'users',
        column: 'pin_hash',
        alterSql: `ALTER TABLE "${schemaName}"."users"
                    ADD COLUMN pin_hash TEXT`,
      },
      {
        table: 'users',
        column: 'cashier_id',
        alterSql: `ALTER TABLE "${schemaName}"."users"
                    ADD COLUMN cashier_id VARCHAR(120)`,
      },
      {
        table: 'batches',
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."batches"
                    ADD COLUMN branch_id UUID REFERENCES "${schemaName}"."branches"(id)`,
      },
      {
        table: 'purchase_items',
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."purchase_items"
                    ADD COLUMN branch_id UUID REFERENCES "${schemaName}"."branches"(id)`,
      },
      {
        table: 'purchase_items',
        column: 'batch_id',
        alterSql: `ALTER TABLE "${schemaName}"."purchase_items"
                    ADD COLUMN batch_id UUID REFERENCES "${schemaName}"."batches"(id)`,
      },
      {
        table: 'sale_items',
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."sale_items"
                    ADD COLUMN branch_id UUID REFERENCES "${schemaName}"."branches"(id)`,
      },
      {
        table: 'sales',
        column: 'receipt_number',
        alterSql: `ALTER TABLE "${schemaName}"."sales"
                    ADD COLUMN receipt_number VARCHAR(20)`,
      },
      {
        table: 'cash_transactions',
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."cash_transactions"
                    ADD COLUMN branch_id UUID REFERENCES "${schemaName}"."branches"(id)`,
      },
    ];

    for (const { table, column, alterSql } of checks) {
      const [row] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
        `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = $2
            AND column_name = $3
        ) AS ok
        `,
        schemaName,
        table,
        column,
      );

      if (!row?.ok) {
        this.logger.log(
          `Adding missing column ${schemaName}.${table}.${column}`,
        );
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }

    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_cashier_id_unique_not_null
       ON "${schemaName}"."users"(cashier_id)
       WHERE cashier_id IS NOT NULL AND BTRIM(cashier_id) <> ''`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS sales_branch_receipt_unique ON "${schemaName}"."sales"(branch_id, receipt_number)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS sales_branch_id_receipt_number_idx ON "${schemaName}"."sales"(branch_id, receipt_number)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_branch_unique ON "${schemaName}"."inventory"(product_id, branch_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_batches_fifo ON "${schemaName}"."batches"(branch_id, product_id, expiry_date, created_at)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."sale_returns" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES "${schemaName}"."sales"(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        reason TEXT,
        return_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON "${schemaName}"."sale_returns"(sale_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_date ON "${schemaName}"."sale_returns"(return_date)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."sale_return_items" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_return_id UUID REFERENCES "${schemaName}"."sale_returns"(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "${schemaName}"."products"(id),
        batch_id UUID REFERENCES "${schemaName}"."batches"(id),
        sale_item_id UUID REFERENCES "${schemaName}"."sale_items"(id),
        quantity INTEGER NOT NULL
      )`,
    );
    await this.ensureAccountingSchema(schemaName);
  }

  /**
   * Double-entry accounting tables (chart of accounts, journals). Idempotent for existing tenants.
   */
  private async ensureAccountingSchema(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."chart_of_accounts" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id) ON DELETE CASCADE,
        code VARCHAR(32),
        name VARCHAR(255) NOT NULL,
        account_type VARCHAR(20) NOT NULL,
        account_key VARCHAR(50) NOT NULL,
        is_system BOOLEAN DEFAULT TRUE,
        payment_method_key VARCHAR(50),
        parent_id UUID REFERENCES "${schemaName}"."chart_of_accounts"(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, account_key)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS chart_of_accounts_branch_payment_key_uq ON "${schemaName}"."chart_of_accounts"(branch_id, payment_method_key) WHERE payment_method_key IS NOT NULL`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."journal_entries" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id),
        entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
        description TEXT,
        source_type VARCHAR(32) NOT NULL,
        source_id UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_source_uq ON "${schemaName}"."journal_entries"(branch_id, source_type, source_id) WHERE source_id IS NOT NULL`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS journal_entries_branch_date_idx ON "${schemaName}"."journal_entries"(branch_id, entry_date)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."journal_lines" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        journal_entry_id UUID NOT NULL REFERENCES "${schemaName}"."journal_entries"(id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES "${schemaName}"."chart_of_accounts"(id),
        debit NUMERIC(14,2) DEFAULT 0 NOT NULL,
        credit NUMERIC(14,2) DEFAULT 0 NOT NULL,
        CONSTRAINT journal_lines_one_side_positive CHECK (
          (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
        )
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON "${schemaName}"."journal_lines"(journal_entry_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON "${schemaName}"."journal_lines"(account_id)`,
    );

    const saleReturnCols: Array<{ column: string; alterSql: string }> = [
      {
        column: 'refund_method',
        alterSql: `ALTER TABLE "${schemaName}"."sale_returns"
          ADD COLUMN refund_method VARCHAR(50)`,
      },
      {
        column: 'refund_amount',
        alterSql: `ALTER TABLE "${schemaName}"."sale_returns"
          ADD COLUMN refund_amount NUMERIC(12,2)`,
      },
    ];
    for (const { column, alterSql } of saleReturnCols) {
      const [row] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
        `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'sale_returns' AND column_name = $2
        ) AS ok
        `,
        schemaName,
        column,
      );
      if (!row?.ok) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }

    const coaParent: { column: string; alterSql: string } = {
      column: 'parent_id',
      alterSql: `ALTER TABLE "${schemaName}"."chart_of_accounts"
        ADD COLUMN parent_id UUID REFERENCES "${schemaName}"."chart_of_accounts"(id)`,
    };
    const [coaHasParent] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'chart_of_accounts' AND column_name = $2
      ) AS ok
      `,
      schemaName,
      coaParent.column,
    );
    if (!coaHasParent?.ok) {
      await this.prisma.$executeRawUnsafe(coaParent.alterSql);
    }

    const purchaseCredit: { column: string; alterSql: string } = {
      column: 'on_credit',
      alterSql: `ALTER TABLE "${schemaName}"."purchases"
        ADD COLUMN on_credit BOOLEAN DEFAULT FALSE`,
    };
    const [purHasCredit] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'purchases' AND column_name = $2
      ) AS ok
      `,
      schemaName,
      purchaseCredit.column,
    );
    if (!purHasCredit?.ok) {
      await this.prisma.$executeRawUnsafe(purchaseCredit.alterSql);
    }

    const ecGl: { column: string; alterSql: string } = {
      column: 'gl_account_key',
      alterSql: `ALTER TABLE "${schemaName}"."expense_categories"
        ADD COLUMN gl_account_key VARCHAR(50)`,
    };
    const [ecHasGl] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'expense_categories' AND column_name = $2
      ) AS ok
      `,
      schemaName,
      ecGl.column,
    );
    if (!ecHasGl?.ok) {
      await this.prisma.$executeRawUnsafe(ecGl.alterSql);
    }

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."supplier_payments" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id),
        supplier_id UUID NOT NULL REFERENCES "${schemaName}"."suppliers"(id),
        amount NUMERIC(14,2) NOT NULL,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        reference VARCHAR(255),
        notes TEXT,
        payment_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_supplier_payments_branch ON "${schemaName}"."supplier_payments"(branch_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON "${schemaName}"."supplier_payments"(supplier_id)`,
    );

    await this.ensureAccountingExtensions(schemaName);
  }

  /**
   * AR/AP extensions, partner tagging on journal lines, lock dates, refunds, config books.
   */
  private async ensureAccountingExtensions(schemaName: string): Promise<void> {
    const salesCols: Array<{ column: string; alterSql: string }> = [
      {
        column: 'customer_id',
        alterSql: `ALTER TABLE "${schemaName}"."sales"
          ADD COLUMN customer_id UUID REFERENCES "${schemaName}"."customers"(id)`,
      },
      {
        column: 'on_account',
        alterSql: `ALTER TABLE "${schemaName}"."sales"
          ADD COLUMN on_account BOOLEAN NOT NULL DEFAULT FALSE`,
      },
    ];
    for (const { column, alterSql } of salesCols) {
      const [row] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
        `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'sales' AND column_name = $2
        ) AS ok
        `,
        schemaName,
        column,
      );
      if (!row?.ok) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }

    const branchLock = {
      column: 'accounting_lock_date',
      alterSql: `ALTER TABLE "${schemaName}"."branches"
        ADD COLUMN accounting_lock_date DATE`,
    };
    const [bl] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'branches' AND column_name = $2
      ) AS ok
      `,
      schemaName,
      branchLock.column,
    );
    if (!bl?.ok) {
      await this.prisma.$executeRawUnsafe(branchLock.alterSql);
    }

    const jlPartnerCols: Array<{ column: string; alterSql: string }> = [
      {
        column: 'partner_kind',
        alterSql: `ALTER TABLE "${schemaName}"."journal_lines"
          ADD COLUMN partner_kind VARCHAR(20)`,
      },
      {
        column: 'partner_id',
        alterSql: `ALTER TABLE "${schemaName}"."journal_lines"
          ADD COLUMN partner_id UUID`,
      },
    ];
    for (const { column, alterSql } of jlPartnerCols) {
      const [row] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
        `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'journal_lines' AND column_name = $2
        ) AS ok
        `,
        schemaName,
        column,
      );
      if (!row?.ok) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }

    const jeBook = {
      column: 'journal_book_id',
      alterSql: `ALTER TABLE "${schemaName}"."journal_entries"
        ADD COLUMN journal_book_id UUID`,
    };
    const [jeB] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'journal_entries' AND column_name = $2
      ) AS ok
      `,
      schemaName,
      jeBook.column,
    );
    if (!jeB?.ok) {
      await this.prisma.$executeRawUnsafe(jeBook.alterSql);
    }

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."accounting_journal_books" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id) ON DELETE CASCADE,
        code VARCHAR(32) NOT NULL,
        name VARCHAR(255) NOT NULL,
        book_kind VARCHAR(32) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, code)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_journal_books_branch ON "${schemaName}"."accounting_journal_books"(branch_id)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."payment_terms" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        days_until_due INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_payment_terms_branch ON "${schemaName}"."payment_terms"(branch_id)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."follow_up_levels" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        days_after_due INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."product_category_gl_map" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id) ON DELETE CASCADE,
        category_id UUID NOT NULL,
        income_account_key VARCHAR(50),
        expense_account_key VARCHAR(50),
        stock_account_key VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, category_id)
      )`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."online_payment_providers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id) ON DELETE CASCADE,
        provider_key VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, provider_key)
      )`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."payment_methods_catalog" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id) ON DELETE CASCADE,
        method_key VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, method_key)
      )`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."customer_payments" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id),
        customer_id UUID NOT NULL REFERENCES "${schemaName}"."customers"(id),
        amount NUMERIC(14,2) NOT NULL,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        reference VARCHAR(255),
        notes TEXT,
        payment_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_customer_payments_branch ON "${schemaName}"."customer_payments"(branch_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON "${schemaName}"."customer_payments"(customer_id)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."customer_payment_allocations" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_payment_id UUID NOT NULL REFERENCES "${schemaName}"."customer_payments"(id) ON DELETE CASCADE,
        sale_id UUID NOT NULL REFERENCES "${schemaName}"."sales"(id) ON DELETE CASCADE,
        amount NUMERIC(14,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_cpa_payment ON "${schemaName}"."customer_payment_allocations"(customer_payment_id)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."purchase_refunds" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id),
        purchase_id UUID NOT NULL REFERENCES "${schemaName}"."purchases"(id) ON DELETE CASCADE,
        amount NUMERIC(14,2) NOT NULL,
        refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
        on_credit BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_purchase_refunds_purchase ON "${schemaName}"."purchase_refunds"(purchase_id)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."audit_logs" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        actor_user_id UUID,
        table_name VARCHAR(128) NOT NULL,
        record_id UUID NOT NULL,
        action VARCHAR(32) NOT NULL,
        old_payload JSONB,
        new_payload JSONB,
        entity_type VARCHAR(128),
        entity_id TEXT,
        user_id UUID,
        before_json JSONB,
        after_json JSONB,
        event_ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        prev_hash VARCHAR(128),
        audit_hash VARCHAR(128),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON "${schemaName}"."audit_logs"(table_name, record_id)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."report_snapshots" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_type VARCHAR(64) NOT NULL,
        scope_hash VARCHAR(64) NOT NULL,
        period_key VARCHAR(128) NOT NULL,
        snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
        period_start DATE,
        period_end DATE,
        as_of_date DATE,
        report_status VARCHAR(16) NOT NULL,
        is_final BOOLEAN NOT NULL DEFAULT FALSE,
        lock_date_used DATE,
        payload JSONB NOT NULL,
        snapshot_diff JSONB,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(report_type, scope_hash, period_key, snapshot_date)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_report_snapshots_lookup
       ON "${schemaName}"."report_snapshots"(report_type, scope_hash, period_key, snapshot_date DESC)`,
    );
  }

  /**
   * Add domain to tenant
   */
  async addDomain(tenantId: string, domain: string) {
    return this.prisma.domain.create({
      data: { tenantId, domain },
    });
  }
}
