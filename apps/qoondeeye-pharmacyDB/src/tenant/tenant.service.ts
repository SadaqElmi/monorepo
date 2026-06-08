import {
  BadRequestException,
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Tenant } from '@prisma/client';

export type TenantSchemaHealth = {
  schemaName: string;
  checkedAt: string;
  ok: boolean;
  missingTables: string[];
  missingColumns: Array<{ table: string; column: string }>;
  missingIndexes: string[];
  duplicateItemNos: Array<{ itemNo: string; count: number }>;
  duplicateBarcodes: Array<{ barcode: string; count: number }>;
};

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);
  private readonly inventoryMatrixBackfillApplied = new Set<string>();
  /** Per-process: skip re-running full patch chain after first success per schema. */
  private readonly schemaPatchesApplied = new Set<string>();

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
   * Find tenant by schema name (active only).
   */
  async findBySchemaName(schemaName: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { schemaName, status: 'active' },
    });
  }

  /**
   * Case-insensitive schema name lookup for X-Tenant header (active only).
   */
  async findBySchemaNameInsensitive(
    schemaName: string,
  ): Promise<Tenant | null> {
    const slug = schemaName.trim();
    if (!slug) return null;
    return this.prisma.tenant.findFirst({
      where: {
        schemaName: { equals: slug, mode: 'insensitive' },
        status: 'active',
      },
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

    try {
      if (allDomains.length) {
        await this.prisma.domain.createMany({
          data: allDomains.map((domain) => ({
            tenantId: tenant.id,
            domain: domain.trim().toLowerCase(),
          })),
        });
      }

      await this.provisionTenantSchema(schemaName);
    } catch (e) {
      try {
        await this.cleanupFailedTenantCreation(tenant.id, schemaName);
      } catch (cleanupErr) {
        this.logger.error(
          `cleanupFailedTenantCreation failed for ${schemaName}: ${
            cleanupErr instanceof Error
              ? cleanupErr.message
              : String(cleanupErr)
          }`,
        );
      }
      throw e;
    }

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
    const tenant = await this.findOne(id);
    await this.dropTenantPostgresSchema(tenant.schemaName);
    await this.prisma.$transaction(async (tx) => {
      await tx.reconciliationLog.deleteMany({ where: { tenantId: id } });
      await tx.reconciliationRun.deleteMany({ where: { tenantId: id } });
      await tx.domain.deleteMany({ where: { tenantId: id } });
      await tx.posDevice.deleteMany({ where: { tenantId: id } });
      await tx.tenant.delete({ where: { id } });
    });
    return { deleted: true };
  }

  /**
   * Best-effort rollback when tenant row exists but provisioning failed.
   * Same ordering as {@link remove}: drop schema, then delete public rows.
   */
  private async cleanupFailedTenantCreation(
    tenantId: string,
    schemaName: string,
  ): Promise<void> {
    await this.dropTenantPostgresSchema(schemaName);
    await this.prisma.$transaction(async (tx) => {
      await tx.reconciliationLog.deleteMany({ where: { tenantId } });
      await tx.reconciliationRun.deleteMany({ where: { tenantId } });
      await tx.domain.deleteMany({ where: { tenantId } });
      await tx.posDevice.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });
    this.logger.warn(
      `Rolled back failed tenant creation: removed tenant ${tenantId}, dropped schema "${schemaName}"`,
    );
  }

  /** Must never drop system/template schemas. Tenant slug is lowercase `[a-z0-9_]+`. */
  private assertSafeTenantSchemaName(schemaName: string): void {
    const n = schemaName.trim().toLowerCase();
    if (!n || !/^[a-z][a-z0-9_]*$/.test(n)) {
      throw new BadRequestException(
        `Invalid tenant schema name: ${schemaName}`,
      );
    }
    const reserved = new Set([
      'public',
      'pg_catalog',
      'information_schema',
      'tenant_template',
      'pg_toast',
    ]);
    if (reserved.has(n)) {
      throw new BadRequestException(`Cannot drop reserved schema: ${n}`);
    }
  }

  /** Removes all tables/objects for this pharmacy schema (per-tenant data lives here). */
  private async dropTenantPostgresSchema(schemaName: string): Promise<void> {
    this.assertSafeTenantSchemaName(schemaName);
    const esc = schemaName.replace(/"/g, '""');
    await this.prisma.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${esc}" CASCADE`,
    );
    this.schemaPatchesApplied.delete(schemaName);
    this.inventoryMatrixBackfillApplied.delete(schemaName);
    this.logger.log(`Dropped Postgres schema "${schemaName}"`);
  }

  /** Delete tenant row by schema name (same rules as {@link resolveSchemaName} for explicit schema). */
  async removeBySchemaName(schemaName: string): Promise<{ deleted: boolean }> {
    const normalized = schemaName.trim().toLowerCase().replace(/\s+/g, '_');
    const tenant = await this.prisma.tenant.findUnique({
      where: { schemaName: normalized },
    });
    if (!tenant) {
      throw new NotFoundException(
        `Tenant with schema "${normalized}" not found`,
      );
    }
    return this.remove(tenant.id);
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
   * Provision a new tenant schema (creates schema + all tables + patches).
   * Uses `roles` + `batches` as the “base provisioned” signal; partial schemas are repaired idempotently.
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
      const coreTables = await this.prisma.$queryRawUnsafe<
        { table_name: string }[]
      >(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_name IN ('roles', 'batches')`,
        schemaName,
      );
      const hasRoles = coreTables.some((r) => r.table_name === 'roles');
      const hasBatches = coreTables.some((r) => r.table_name === 'batches');
      if (hasRoles && hasBatches) {
        this.logger.warn(
          `Schema "${schemaName}" base tables already exist; applying isolation + patches only`,
        );
        await this.ensureTenantBranchIsolationColumns(schemaName);
        await this.applyTenantSchemaPatches(schemaName, { force: true });
        return;
      }
      if (hasRoles && !hasBatches) {
        this.logger.warn(
          `Schema "${schemaName}" partially provisioned (missing batches); completing base tables...`,
        );
      } else if (!hasRoles) {
        this.logger.log(
          `Schema "${schemaName}" exists but has no roles table; provisioning base tables...`,
        );
      }
    } else {
      await this.prisma.$executeRawUnsafe(
        `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`,
      );
    }

    const tables: string[] = [
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."roles" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) UNIQUE NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."permissions" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."branches" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."users" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200),
        staff_id VARCHAR(120) UNIQUE,
        email VARCHAR(200) UNIQUE,
        password TEXT,
        pin_hash TEXT,
        role_id UUID REFERENCES "${schemaName}"."roles"(id),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."product_categories" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."products" (
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
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."suppliers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        supplier_type VARCHAR(20) NOT NULL DEFAULT 'local',
        country VARCHAR(100),
        city VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT suppliers_supplier_type_check CHECK (supplier_type IN ('local', 'international'))
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."product_suppliers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES "${schemaName}"."suppliers"(id) ON DELETE CASCADE,
        is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
        last_cost_price NUMERIC(10,2),
        supplier_item_code VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS product_suppliers_product_supplier_uq
        ON "${schemaName}"."product_suppliers"(product_id, supplier_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS product_suppliers_one_preferred_per_product
        ON "${schemaName}"."product_suppliers"(product_id)
        WHERE is_preferred`,
      `CREATE INDEX IF NOT EXISTS idx_product_suppliers_product_preferred
        ON "${schemaName}"."product_suppliers"(product_id, is_preferred)`,
      `CREATE INDEX IF NOT EXISTS idx_product_suppliers_supplier_product
        ON "${schemaName}"."product_suppliers"(supplier_id, product_id)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."customers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."purchases" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id UUID REFERENCES "${schemaName}"."suppliers"(id),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        invoice_number VARCHAR(100),
        total_amount NUMERIC(12,2),
        purchase_date DATE,
        on_credit BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
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
      `CREATE INDEX IF NOT EXISTS idx_supplier_payments_branch ON "${schemaName}"."supplier_payments"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON "${schemaName}"."supplier_payments"(supplier_id)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."batches" (
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
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."purchase_items" (
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
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."inventory" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES "${schemaName}"."products"(id),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        quantity INTEGER DEFAULT 0,
        reorder_level INTEGER DEFAULT 10,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_inventory_product ON "${schemaName}"."inventory"(product_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_branch_unique ON "${schemaName}"."inventory"(product_id, branch_id)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."sales" (
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
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."sale_items" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES "${schemaName}"."sales"(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        product_id UUID REFERENCES "${schemaName}"."products"(id),
        batch_id UUID REFERENCES "${schemaName}"."batches"(id),
        quantity INTEGER,
        price NUMERIC(10,2),
        total NUMERIC(10,2)
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."sale_returns" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES "${schemaName}"."sales"(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        reason TEXT,
        return_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON "${schemaName}"."sale_returns"(sale_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_date ON "${schemaName}"."sale_returns"(return_date)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."sale_return_items" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_return_id UUID REFERENCES "${schemaName}"."sale_returns"(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "${schemaName}"."products"(id),
        batch_id UUID REFERENCES "${schemaName}"."batches"(id),
        sale_item_id UUID REFERENCES "${schemaName}"."sale_items"(id),
        quantity INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."return_vouchers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id),
        sale_id UUID NOT NULL REFERENCES "${schemaName}"."sales"(id) ON DELETE CASCADE,
        sale_item_id UUID NOT NULL REFERENCES "${schemaName}"."sale_items"(id),
        quantity INTEGER NOT NULL,
        unit_price NUMERIC(10,2) NOT NULL,
        token VARCHAR(80) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        reason TEXT,
        sale_return_id UUID REFERENCES "${schemaName}"."sale_returns"(id) ON DELETE SET NULL,
        expires_at TIMESTAMP,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS return_vouchers_token_key ON "${schemaName}"."return_vouchers"(token)`,
      `CREATE INDEX IF NOT EXISTS idx_return_vouchers_sale_id ON "${schemaName}"."return_vouchers"(sale_id)`,
      `CREATE INDEX IF NOT EXISTS idx_return_vouchers_branch_id ON "${schemaName}"."return_vouchers"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_return_vouchers_token ON "${schemaName}"."return_vouchers"(token)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."payments" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES "${schemaName}"."sales"(id),
        method VARCHAR(50),
        amount NUMERIC(10,2),
        paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."expense_categories" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        gl_account_key VARCHAR(50)
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."expenses" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id UUID REFERENCES "${schemaName}"."expense_categories"(id),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        amount NUMERIC(12,2),
        description TEXT,
        expense_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."cash_accounts" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        type VARCHAR(50),
        balance NUMERIC(12,2) DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."cash_transactions" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        account_id UUID REFERENCES "${schemaName}"."cash_accounts"(id),
        type VARCHAR(10),
        amount NUMERIC(12,2),
        reference VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."chart_of_accounts" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id) ON DELETE CASCADE,
        code VARCHAR(32),
        name VARCHAR(255) NOT NULL,
        account_type VARCHAR(20) NOT NULL,
        account_key VARCHAR(50) NOT NULL,
        is_system BOOLEAN DEFAULT TRUE,
        allow_reconciliation BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        description TEXT,
        payment_method_key VARCHAR(50),
        parent_id UUID REFERENCES "${schemaName}"."chart_of_accounts"(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, account_key)
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS chart_of_accounts_branch_payment_key_uq ON "${schemaName}"."chart_of_accounts"(branch_id, payment_method_key) WHERE payment_method_key IS NOT NULL`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."journal_entries" (
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
      `CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON "${schemaName}"."journal_lines"(journal_entry_id)`,
      `CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON "${schemaName}"."journal_lines"(account_id)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."patient_loans" (
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
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."patient_loan_payments" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        loan_id UUID NOT NULL REFERENCES "${schemaName}"."patient_loans"(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL,
        payment_method VARCHAR(50),
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."notifications" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255),
        message TEXT,
        type VARCHAR(50),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."role_permissions" (
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
        ('cashier')
       ON CONFLICT (name) DO NOTHING`,
      `INSERT INTO "${schemaName}"."permissions" (name) VALUES
        ('create_product'),
        ('edit_product'),
        ('delete_product'),
        ('view_reports'),
        ('manage_users'),
        ('import_products'),
        ('import_opening_stock'),
        ('view_import_center'),
        ('run_consolidation'),
        ('reverse_consolidation'),
        ('view_consolidation_history'),
        ('manage_accounting_configuration'),
        ('manage_pricing'),
        ('manage_price_groups'),
        ('manage_offers'),
        ('view_transaction_register'),
        ('view_customer_credit'),
        ('create_customer_credit_sale'),
        ('record_customer_repayment'),
        ('override_credit_limit'),
        ('delete_supplier'),
        ('delete_customer'),
        ('delete_purchase'),
        ('post_journal'),
        ('reverse_journal'),
        ('close_period'),
        ('reopen_period'),
        ('change_lock_date')
       ON CONFLICT (name) DO NOTHING`,
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
        SELECT r.id, p.id
        FROM "${schemaName}"."roles" r
        CROSS JOIN "${schemaName}"."permissions" p
        WHERE r.name = 'admin'
        ON CONFLICT (role_id, permission_id) DO NOTHING`,
    ];

    for (const sql of seedSql) {
      await this.prisma.$executeRawUnsafe(sql);
    }

    await this.applyTenantSchemaPatches(schemaName);

    const provisionCheck = await this.verifyTenantCoreTablesPresent(schemaName);
    if (!provisionCheck.ok) {
      this.logger.error(
        `provision verification failed for "${schemaName}": missing ${provisionCheck.missing.join(', ')}`,
      );
    }

    this.logger.log(`Schema "${schemaName}" provisioned with all tables`);
  }

  /** Sanity check after provision: base tables + staff table (users or User). */
  private async verifyTenantCoreTablesPresent(schemaName: string): Promise<{
    ok: boolean;
    missing: string[];
  }> {
    const rows = await this.prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1
         AND table_name IN ('roles', 'batches', 'users', 'User')`,
      schemaName,
    );
    const names = new Set(rows.map((r) => r.table_name));
    const missing: string[] = [];
    if (!names.has('roles')) missing.push('roles');
    if (!names.has('batches')) missing.push('batches');
    if (!names.has('users') && !names.has('User')) {
      missing.push('users or User');
    }
    return { ok: missing.length === 0, missing };
  }

  /**
   * Apply idempotent upgrades for an existing tenant schema (e.g. `pin_hash`, branch columns).
   * Safe to call on every request; use when a code path bypasses provision (e.g. public PIN login).
   */
  async applyTenantSchemaPatches(
    schemaName: string,
    options?: { force?: boolean },
  ): Promise<void> {
    if (!options?.force && this.schemaPatchesApplied.has(schemaName)) {
      return;
    }
    try {
      await this.runTenantSchemaPatches(schemaName);
      this.schemaPatchesApplied.add(schemaName);
    } catch (e) {
      this.schemaPatchesApplied.delete(schemaName);
      throw e;
    }
  }

  async getTenantSchemaHealth(schemaName: string): Promise<TenantSchemaHealth> {
    const requiredTables = [
      'products',
      'branches',
      'tenant_settings',
      'import_jobs',
      'import_job_rows',
      'opening_stock_entries',
      'suppliers',
      'product_suppliers',
      'uoms',
      'product_uoms',
      'product_uom_prices',
      'product_uom_barcodes',
      'product_supplier_uom_costs',
      'supplier_price_history',
      'price_groups',
      'product_price_group_prices',
      'product_price_history',
      'offer_lists',
      'offer_rules',
      'offer_redemptions',
    ];
    const requiredColumns = [
      { table: 'products', column: 'item_no' },
      { table: 'branches', column: 'code' },
      { table: 'suppliers', column: 'supplier_type' },
      { table: 'suppliers', column: 'country' },
      { table: 'suppliers', column: 'city' },
      { table: 'suppliers', column: 'active' },
      { table: 'suppliers', column: 'updated_at' },
      { table: 'product_suppliers', column: 'product_id' },
      { table: 'product_suppliers', column: 'supplier_id' },
      { table: 'product_suppliers', column: 'is_preferred' },
      { table: 'product_suppliers', column: 'last_cost_price' },
      { table: 'import_jobs', column: 'reversed_at' },
      { table: 'import_jobs', column: 'reversed_by' },
      { table: 'import_job_rows', column: 'resolved_batch_id' },
      { table: 'import_job_rows', column: 'opening_stock_record_id' },
      { table: 'opening_stock_entries', column: 'reversed_at' },
      { table: 'opening_stock_entries', column: 'reversal_journal_entry_id' },
      { table: 'product_uoms', column: 'conversion_factor_to_base' },
      { table: 'product_uoms', column: 'is_base' },
      { table: 'product_uoms', column: 'is_purchase_default' },
      { table: 'product_uoms', column: 'is_sales_default' },
      { table: 'product_uoms', column: 'is_pos_default' },
      { table: 'product_uom_prices', column: 'initial_cost_price' },
      { table: 'product_uom_prices', column: 'last_purchase_cost' },
      { table: 'product_uom_prices', column: 'last_purchase_at' },
      { table: 'product_supplier_uom_costs', column: 'current_cost_price' },
      { table: 'supplier_price_history', column: 'new_cost_price' },
      { table: 'purchase_items', column: 'uom_id' },
      { table: 'purchase_items', column: 'conversion_factor_snapshot' },
      { table: 'purchase_items', column: 'base_quantity' },
      { table: 'purchase_items', column: 'base_unit_cost' },
      { table: 'purchase_items', column: 'update_selling_price' },
      { table: 'sale_items', column: 'uom_id' },
      { table: 'sale_items', column: 'entered_quantity' },
      { table: 'sale_items', column: 'conversion_factor_snapshot' },
      { table: 'sale_items', column: 'base_quantity' },
      { table: 'sale_items', column: 'price_group_id' },
      { table: 'sale_items', column: 'offer_id' },
      { table: 'sale_items', column: 'line_discount' },
      { table: 'sale_items', column: 'discount_source' },
      { table: 'return_vouchers', column: 'uom_id' },
      { table: 'return_vouchers', column: 'base_quantity' },
      { table: 'sale_return_items', column: 'uom_id' },
      { table: 'sale_return_items', column: 'base_quantity' },
      { table: 'price_groups', column: 'code' },
      { table: 'product_price_group_prices', column: 'price_group_id' },
      { table: 'product_price_history', column: 'new_selling_price' },
      { table: 'offer_lists', column: 'priority' },
      { table: 'offer_rules', column: 'product_id' },
      { table: 'offer_redemptions', column: 'discount_amount' },
    ];
    const requiredIndexes = [
      'products_item_no_unique',
      'idx_products_item_no',
      'products_barcode_unique_not_null',
      'branches_code_unique',
      'idx_import_jobs_type_status',
      'idx_import_job_rows_job',
      'idx_import_job_rows_commit',
      'opening_stock_import_row_unique',
      'product_suppliers_product_supplier_uq',
      'product_suppliers_one_preferred_per_product',
      'idx_product_suppliers_product_preferred',
      'idx_product_suppliers_supplier_product',
      'journal_lines_partner_account_entry_idx',
      'journal_entries_branch_entry_created_idx',
      'idx_purchases_supplier_branch_date',
      'idx_purchase_items_product_purchase',
      'uoms_code_key',
      'product_uoms_product_uom_uq',
      'product_uoms_one_base_per_product',
      'product_uoms_one_purchase_default',
      'product_uoms_one_sales_default',
      'product_uoms_one_pos_default',
      'idx_product_uoms_product_id',
      'product_uom_prices_active_product_uom_uq',
      'product_uom_barcodes_active_barcode_uq',
      'idx_product_uom_barcodes_barcode',
      'product_supplier_uom_costs_product_supplier_uom_uq',
      'idx_product_supplier_uom_costs_lookup',
      'idx_supplier_price_history_lookup',
      'idx_return_vouchers_uom_id',
      'idx_sale_return_items_uom_id',
      'price_groups_code_key',
      'price_groups_one_default',
      'product_price_group_prices_active_uq',
      'idx_product_price_group_prices_lookup',
      'idx_product_price_history_product_created',
      'offer_lists_no_key',
      'idx_offer_lists_status_dates_priority',
      'idx_offer_rules_product_id',
      'idx_offer_redemptions_offer_created',
    ];

    const [tableRows, columnRows, indexRows, duplicateItemNos, duplicateBarcodes] =
      await Promise.all([
        this.prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
          `SELECT table_name
           FROM information_schema.tables
           WHERE table_schema = $1
             AND table_name = ANY($2::text[])`,
          schemaName,
          requiredTables,
        ),
        this.prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
          `SELECT table_name, column_name
           FROM information_schema.columns
           WHERE table_schema = $1
             AND table_name = ANY($2::text[])`,
          schemaName,
          [...new Set(requiredColumns.map((c) => c.table))],
        ),
        this.prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
          `SELECT indexname
           FROM pg_indexes
           WHERE schemaname = $1
             AND indexname = ANY($2::text[])`,
          schemaName,
          requiredIndexes,
        ),
        this.duplicateColumnValues(schemaName, 'products', 'item_no'),
        this.duplicateColumnValues(schemaName, 'products', 'barcode'),
      ]);

    const tableSet = new Set(tableRows.map((r) => r.table_name));
    const columnSet = new Set(
      columnRows.map((r) => `${r.table_name}.${r.column_name}`),
    );
    const indexSet = new Set(indexRows.map((r) => r.indexname));
    const missingTables = requiredTables.filter((t) => !tableSet.has(t));
    const missingColumns = requiredColumns.filter(
      (c) => !columnSet.has(`${c.table}.${c.column}`),
    );
    const missingIndexes = requiredIndexes.filter((i) => !indexSet.has(i));

    return {
      schemaName,
      checkedAt: new Date().toISOString(),
      ok:
        missingTables.length === 0 &&
        missingColumns.length === 0 &&
        missingIndexes.length === 0 &&
        duplicateItemNos.length === 0 &&
        duplicateBarcodes.length === 0,
      missingTables,
      missingColumns,
      missingIndexes,
      duplicateItemNos: duplicateItemNos.map((r) => ({
        itemNo: r.value,
        count: r.count,
      })),
      duplicateBarcodes: duplicateBarcodes.map((r) => ({
        barcode: r.value,
        count: r.count,
      })),
    };
  }

  private async runTenantSchemaPatches(schemaName: string): Promise<void> {
    await this.ensureTenantBranchIsolationColumns(schemaName);
    await this.ensureProductCategoryColumns(schemaName);
    await this.ensureProductCatalogColumns(schemaName);
    await this.ensureSaleItemsMiscChargeKindColumn(schemaName);
    await this.ensurePosSessionsAndStatements(schemaName);
    await this.ensureInventoryTable(schemaName);
    await this.ensureInventoryMatrixCoverage(schemaName);
    await this.ensureStockTransfersTables(schemaName);
    await this.ensureReportSnapshotsTable(schemaName);
    await this.ensureReportSnapshotsSnapshotDiffColumn(schemaName);
    await this.ensureReportExportJobsTable(schemaName);
    await this.ensureReportExportJobsRetryColumns(schemaName);
    await this.ensureChartOfAccountsIsInterbranchColumn(schemaName);
    await this.ensureChartOfAccountsInterbranchTypeColumn(schemaName);
    await this.ensureChartOfAccountsAllowReconciliationColumn(schemaName);
    await this.ensureChartOfAccountsCrudColumns(schemaName);
    await this.ensureBranchAccountBalanceSnapshotTable(schemaName);
    await this.ensureJournalEntriesBranchDateSourceIndex(schemaName);
    await this.ensureAuditLogHashChainColumns(schemaName);
    await this.ensureAccountingPeriodWorkflowTable(schemaName);
    await this.ensureEntityStructure(schemaName);
    await this.ensureConsolidationTables(schemaName);
    await this.ensureEnterpriseConsolidationTables(schemaName);
    await this.ensureConsolidationBranch(schemaName);
    await this.ensureConsolidationPermissions(schemaName);
    await this.ensureAccountingConfigurationPermission(schemaName);
    await this.ensureAuditLogArchiveTable(schemaName);
    await this.ensureTenantPerformanceIndexes(schemaName);
    await this.ensureProductItemNoColumn(schemaName);
    await this.ensureProductSupplierIdColumn(schemaName);
    await this.ensureSupplierManagementV1(schemaName);
    await this.ensureBranchCodeColumn(schemaName);
    await this.ensureTenantSettingsTable(schemaName);
    await this.ensureImportJobsTables(schemaName);
    await this.ensureOpeningStockEntriesTable(schemaName);
    await this.ensureOpeningStockReversalColumns(schemaName);
    await this.ensureImportJobsReversalColumns(schemaName);
    await this.ensureImportProductsPermission(schemaName);
    await this.ensureUomSystem(schemaName);
    await this.ensurePricingAndOffersV1(schemaName);
    await this.ensurePurchaseWorkflowExtensions(schemaName);
    await this.ensureBaseUomCostConsolidation(schemaName);
    await this.ensureSaleItemsCostSnapshotColumns(schemaName);
    await this.ensureTransactionRegisterIndexes(schemaName);
    await this.ensureTransactionRegisterPermission(schemaName);
    await this.ensureCustomerCreditV1(schemaName);
    await this.ensureRbacPhase1Permissions(schemaName);
    await this.ensureRbacPhase2Permissions(schemaName);
    await this.ensureRolesV2Columns(schemaName);
  }

  private async tenantColumnExists(
    schemaName: string,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
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
      tableName,
      columnName,
    );
    return Boolean(row?.ok);
  }

  private async tenantTableExists(
    schemaName: string,
    tableName: string,
  ): Promise<boolean> {
    const [row] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = $2
      ) AS ok
      `,
      schemaName,
      tableName,
    );
    return Boolean(row?.ok);
  }

  /** Keep one active product_uom_prices row per (product_id, uom_id). */
  private async deduplicateActiveProductUomPrices(
    schemaName: string,
  ): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'product_uom_prices'))) {
      return;
    }
    await this.prisma.$executeRawUnsafe(
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (
                  PARTITION BY product_id, uom_id
                  ORDER BY updated_at DESC NULLS LAST, created_at DESC, id DESC
                ) AS rn
         FROM "${schemaName}"."product_uom_prices"
         WHERE active IS TRUE
       )
       UPDATE "${schemaName}"."product_uom_prices" target
       SET active = FALSE, updated_at = CURRENT_TIMESTAMP
       FROM ranked r
       WHERE target.id = r.id
         AND r.rn > 1`,
    );
  }

  private async addForeignKeyIfMissing(
    schemaName: string,
    table: string,
    constraintName: string,
    ddl: string,
  ): Promise<void> {
    const esc = schemaName.replace(/"/g, '""');
    await this.prisma.$executeRawUnsafe(
      `DO $$
       BEGIN
         ALTER TABLE "${esc}"."${table}"
           ADD CONSTRAINT "${constraintName}" ${ddl};
       EXCEPTION
         WHEN duplicate_object THEN NULL;
       END $$`,
    );
  }

  private async addCheckConstraintIfMissing(
    schemaName: string,
    table: string,
    constraintName: string,
    checkExpression: string,
  ): Promise<void> {
    const esc = schemaName.replace(/"/g, '""');
    await this.prisma.$executeRawUnsafe(
      `DO $$
       BEGIN
         ALTER TABLE "${esc}"."${table}"
           ADD CONSTRAINT "${constraintName}"
           CHECK (${checkExpression});
       EXCEPTION
         WHEN duplicate_object THEN NULL;
       END $$`,
    );
  }

  private async duplicateColumnValues(
    schemaName: string,
    tableName: string,
    columnName: string,
    limit = 20,
  ): Promise<Array<{ value: string; count: number }>> {
    if (!(await this.tenantTableExists(schemaName, tableName))) return [];
    if (!(await this.tenantColumnExists(schemaName, tableName, columnName))) {
      return [];
    }
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ value: string; count: number }>
    >(
      `SELECT ${columnName}::text AS value, COUNT(*)::int AS count
       FROM "${schemaName}"."${tableName}"
       WHERE ${columnName} IS NOT NULL AND TRIM(${columnName}::text) <> ''
       GROUP BY ${columnName}
       HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC, ${columnName}::text ASC
       LIMIT $1`,
      limit,
    );
    return rows;
  }

  /** Mirrors tenant_template product category columns on live snake_case schemas. */
  private async ensureProductCategoryColumns(schemaName: string): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'product_categories'))) {
      return;
    }
    const cols: Array<{ column: string; alterSql: string }> = [
      {
        column: 'description',
        alterSql: `ALTER TABLE "${schemaName}"."product_categories"
          ADD COLUMN IF NOT EXISTS description TEXT`,
      },
      {
        column: 'slug',
        alterSql: `ALTER TABLE "${schemaName}"."product_categories"
          ADD COLUMN IF NOT EXISTS slug VARCHAR(255)`,
      },
      {
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."product_categories"
          ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES "${schemaName}"."branches"(id)
          ON DELETE SET NULL`,
      },
      {
        column: 'parent_id',
        alterSql: `ALTER TABLE "${schemaName}"."product_categories"
          ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES "${schemaName}"."product_categories"(id)
          ON DELETE SET NULL`,
      },
    ];
    for (const { column, alterSql } of cols) {
      if (!(await this.tenantColumnExists(schemaName, 'product_categories', column))) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_categories_branch_id
       ON "${schemaName}"."product_categories"(branch_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_categories_parent_id
       ON "${schemaName}"."product_categories"(parent_id)`,
    );
  }

  /** Product catalog columns used by POS / inventory (list_price, strength, …). */
  private async ensureProductCatalogColumns(schemaName: string): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'products'))) {
      return;
    }
    const cols: Array<{ column: string; alterSql: string }> = [
      {
        column: 'generic_name',
        alterSql: `ALTER TABLE "${schemaName}"."products"
          ADD COLUMN IF NOT EXISTS generic_name VARCHAR(255)`,
      },
      {
        column: 'barcode',
        alterSql: `ALTER TABLE "${schemaName}"."products"
          ADD COLUMN IF NOT EXISTS barcode VARCHAR(100)`,
      },
      {
        column: 'list_price',
        alterSql: `ALTER TABLE "${schemaName}"."products"
          ADD COLUMN IF NOT EXISTS list_price NUMERIC(10,2)`,
      },
      {
        column: 'strength',
        alterSql: `ALTER TABLE "${schemaName}"."products"
          ADD COLUMN IF NOT EXISTS strength VARCHAR(100)`,
      },
      {
        column: 'formulation',
        alterSql: `ALTER TABLE "${schemaName}"."products"
          ADD COLUMN IF NOT EXISTS formulation VARCHAR(100)`,
      },
      {
        column: 'branch_id',
        alterSql: `ALTER TABLE "${schemaName}"."products"
          ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES "${schemaName}"."branches"(id)
          ON DELETE SET NULL`,
      },
      {
        column: 'unit',
        alterSql: `ALTER TABLE "${schemaName}"."products"
          ADD COLUMN IF NOT EXISTS unit VARCHAR(50)`,
      },
      {
        column: 'description',
        alterSql: `ALTER TABLE "${schemaName}"."products"
          ADD COLUMN IF NOT EXISTS description TEXT`,
      },
    ];
    for (const { column, alterSql } of cols) {
      if (!(await this.tenantColumnExists(schemaName, 'products', column))) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_not_null
       ON "${schemaName}"."products"(barcode)
       WHERE barcode IS NOT NULL AND TRIM(barcode) <> ''`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_products_barcode
       ON "${schemaName}"."products"(barcode)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_products_branch_id
       ON "${schemaName}"."products"(branch_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_products_created_at
       ON "${schemaName}"."products"(created_at DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_products_category_id
       ON "${schemaName}"."products"(category_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_products_branch_created
       ON "${schemaName}"."products"(branch_id, created_at DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_inventory_branch_id
       ON "${schemaName}"."inventory"(branch_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_categories_branch_name
       ON "${schemaName}"."product_categories"(branch_id, name)`,
    );
  }

  /**
   * Mirrors prisma/migrations performance indexes for provisioned tenant schemas
   * (lowercase table names). tenant_template is handled by `prisma migrate deploy`.
   */
  private async ensureTenantPerformanceIndexes(schemaName: string): Promise<void> {
    const stmts = [
      `CREATE INDEX IF NOT EXISTS idx_users_branch_id ON "${schemaName}"."users"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_patient_loans_branch_id ON "${schemaName}"."patient_loans"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_patient_loans_customer_id ON "${schemaName}"."patient_loans"(customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_patient_loan_payments_loan_id ON "${schemaName}"."patient_loan_payments"(loan_id)`,
      `CREATE INDEX IF NOT EXISTS idx_purchases_branch_id ON "${schemaName}"."purchases"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON "${schemaName}"."purchases"(supplier_id)`,
      `CREATE INDEX IF NOT EXISTS idx_purchases_invoice_number ON "${schemaName}"."purchases"(invoice_number)`,
      `CREATE INDEX IF NOT EXISTS idx_purchases_branch_created ON "${schemaName}"."purchases"(branch_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_purchases_supplier_branch_date ON "${schemaName}"."purchases"(supplier_id, branch_id, purchase_date DESC, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON "${schemaName}"."purchase_items"(purchase_id)`,
      `CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON "${schemaName}"."purchase_items"(product_id)`,
      `CREATE INDEX IF NOT EXISTS idx_purchase_items_branch_id ON "${schemaName}"."purchase_items"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_purchase_items_product_purchase ON "${schemaName}"."purchase_items"(product_id, purchase_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON "${schemaName}"."sale_items"(sale_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON "${schemaName}"."sale_items"(product_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sale_items_branch_id ON "${schemaName}"."sale_items"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_payments_sale_id ON "${schemaName}"."payments"(sale_id)`,
      `CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON "${schemaName}"."expenses"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON "${schemaName}"."expenses"(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_products_created_at ON "${schemaName}"."products"(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_products_category_id ON "${schemaName}"."products"(category_id)`,
      `CREATE INDEX IF NOT EXISTS idx_products_branch_created ON "${schemaName}"."products"(branch_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_inventory_branch_id ON "${schemaName}"."inventory"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_product_categories_branch_name ON "${schemaName}"."product_categories"(branch_id, name)`,
    ];
    for (const sql of stmts) {
      await this.prisma.$executeRawUnsafe(sql);
    }
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
    const hasLegacyAuditColumns = await this.tenantColumnExists(
      schemaName,
      'audit_logs',
      'table_name',
    );
    if (hasLegacyAuditColumns) {
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
    }
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
    await this.addCheckConstraintIfMissing(
      schemaName,
      'entity_ownership',
      'entity_ownership_percent_range',
      'ownership_percent > 0 AND ownership_percent <= 100.00',
    );
    await this.addCheckConstraintIfMissing(
      schemaName,
      'entity_ownership',
      'entity_ownership_effective_range',
      'effective_to IS NULL OR effective_to >= effective_from',
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

  private async ensureAccountingConfigurationPermission(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."permissions" (name)
       VALUES ('manage_accounting_configuration')
       ON CONFLICT (name) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p
         ON p.name = 'manage_accounting_configuration'
       WHERE r.name IN ('admin', 'owner', 'finance_manager')
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

  private async ensureChartOfAccountsAllowReconciliationColumn(
    schemaName: string,
  ): Promise<void> {
    const alreadyExists = await this.tenantColumnExists(
      schemaName,
      'chart_of_accounts',
      'allow_reconciliation',
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."chart_of_accounts" ADD COLUMN IF NOT EXISTS allow_reconciliation BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    if (alreadyExists) {
      return;
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."chart_of_accounts"
       SET allow_reconciliation = TRUE
       WHERE account_key IN (
         'accounts_receivable',
         'accounts_payable',
         'receivables',
         'payables',
         'customer_control',
         'supplier_control',
         'bank',
         'bank_account',
         'checking',
         'checking_account',
         'savings',
         'savings_account',
         'cash',
         'cash_account',
         'card_clearing',
         'wallet_clearing',
         'payment_clearing',
         'cash_clearing',
         'due_from_branch',
         'due_to_branch'
       )`,
    );
  }

  private async ensureChartOfAccountsCrudColumns(
    schemaName: string,
  ): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'chart_of_accounts'))) {
      return;
    }
    const alters = [
      `ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`,
      `ADD COLUMN IF NOT EXISTS description TEXT`,
      `ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    ];
    for (const alter of alters) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."chart_of_accounts" ${alter}`,
      );
    }
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
   * Legacy tenant schemas may exist without `inventory` (predates table or partial provision).
   * Must run before {@link ensureInventoryMatrixCoverage}.
   */
  private async ensureInventoryTable(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."inventory" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES "${schemaName}"."products"(id),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        quantity INTEGER DEFAULT 0,
        reorder_level INTEGER DEFAULT 10,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_inventory_product ON "${schemaName}"."inventory"(product_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_branch_unique ON "${schemaName}"."inventory"(product_id, branch_id)`,
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
      `CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_to_status ON "${schemaName}"."stock_transfers"(from_branch_id, to_branch_id, status)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_status ON "${schemaName}"."stock_transfers"(to_branch_id, status)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."stock_transfer_items" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_id UUID NOT NULL REFERENCES "${schemaName}"."stock_transfers"(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id),
        uom_id UUID,
        quantity INTEGER NOT NULL,
        conversion_factor_snapshot NUMERIC(18,6) NOT NULL DEFAULT 1,
        base_quantity INTEGER NOT NULL DEFAULT 0,
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
        column: 'uom_id',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_items"
          ADD COLUMN uom_id UUID`,
      },
      {
        column: 'conversion_factor_snapshot',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_items"
          ADD COLUMN conversion_factor_snapshot NUMERIC(18,6) NOT NULL DEFAULT 1`,
      },
      {
        column: 'base_quantity',
        alterSql: `ALTER TABLE "${schemaName}"."stock_transfer_items"
          ADD COLUMN base_quantity INTEGER NOT NULL DEFAULT 0`,
      },
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
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."stock_transfer_items"
       SET base_quantity = COALESCE(quantity, 0)
       WHERE COALESCE(base_quantity, 0) = 0`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_uom
       ON "${schemaName}"."stock_transfer_items"(uom_id)`,
    );

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

    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_shipped_at ON "${schemaName}"."stock_transfers"(from_branch_id, shipped_at DESC NULLS LAST)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_received_at ON "${schemaName}"."stock_transfers"(to_branch_id, received_at DESC NULLS LAST)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_transfers_reversal_timeline ON "${schemaName}"."stock_transfers"(is_reversed, received_at, from_branch_id, to_branch_id, reversed_at DESC NULLS LAST)`,
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
   * Legacy tenants may predate the `batches` table; branch-isolation patches assume it exists.
   */
  private async ensureBatchesTable(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."batches" (
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
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_batches_expiry ON "${schemaName}"."batches"(expiry_date)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_batches_fifo ON "${schemaName}"."batches"(branch_id, product_id, expiry_date, created_at)`,
    );
  }

  /**
   * Legacy schemas may lack purchasing tables; branch-isolation ALTERs require them.
   * Depends on `branches`, `products`, and `batches` (ensure `ensureBatchesTable` ran first).
   */
  private async ensurePurchasingTablesIfMissing(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."suppliers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        supplier_type VARCHAR(20) NOT NULL DEFAULT 'local',
        country VARCHAR(100),
        city VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT suppliers_supplier_type_check CHECK (supplier_type IN ('local', 'international'))
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."product_suppliers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES "${schemaName}"."suppliers"(id) ON DELETE CASCADE,
        is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
        last_cost_price NUMERIC(10,2),
        supplier_item_code VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."purchases" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id UUID REFERENCES "${schemaName}"."suppliers"(id),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        invoice_number VARCHAR(100),
        total_amount NUMERIC(12,2),
        purchase_date DATE,
        on_credit BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."purchase_items" (
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
    );
  }

  /**
   * Legacy schemas may lack sales / cash tables referenced by branch-isolation patches.
   */
  private async ensureSalesAndCashTablesForBranchPatches(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."sales" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        receipt_number VARCHAR(20),
        total_amount NUMERIC(12,2),
        discount NUMERIC(10,2) DEFAULT 0,
        tax NUMERIC(10,2) DEFAULT 0,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS sales_branch_receipt_unique ON "${schemaName}"."sales"(branch_id, receipt_number)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS sales_branch_id_receipt_number_idx ON "${schemaName}"."sales"(branch_id, receipt_number)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sales_date ON "${schemaName}"."sales"(sale_date)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."sale_items" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES "${schemaName}"."sales"(id) ON DELETE CASCADE,
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        product_id UUID REFERENCES "${schemaName}"."products"(id),
        batch_id UUID REFERENCES "${schemaName}"."batches"(id),
        quantity INTEGER,
        price NUMERIC(10,2),
        total NUMERIC(10,2)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."cash_accounts" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        type VARCHAR(50),
        balance NUMERIC(12,2) DEFAULT 0
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."cash_transactions" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID REFERENCES "${schemaName}"."branches"(id),
        account_id UUID REFERENCES "${schemaName}"."cash_accounts"(id),
        type VARCHAR(10),
        amount NUMERIC(12,2),
        reference VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
  }

  /**
   * POS manual charges (Tailor / Delivery / Member card): nullable product, optional misc_charge_kind.
   */
  private async ensureSaleItemsMiscChargeKindColumn(
    schemaName: string,
  ): Promise<void> {
    const [row] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = 'sale_items'
      ) AS ok
      `,
      schemaName,
    );
    if (!row?.ok) return;

    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."sale_items"
       ADD COLUMN IF NOT EXISTS misc_charge_kind VARCHAR(32)`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."sale_items"
       ALTER COLUMN product_id DROP NOT NULL`,
    );
  }

  /** Idempotent: POS shift sessions, statements, sales.pos_session_id. */
  private async ensurePosSessionsAndStatements(
    schemaName: string,
  ): Promise<void> {
    const esc = schemaName.replace(/"/g, '""');
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${esc}"."pos_sessions" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id" UUID NOT NULL,
        "device_id" UUID,
        "staff_user_id" UUID,
        "status" VARCHAR(20) NOT NULL DEFAULT 'open',
        "opened_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "closed_at" TIMESTAMP(6),
        CONSTRAINT "pos_sessions_pkey" PRIMARY KEY ("id")
      )`,
    );
    await this.addForeignKeyIfMissing(
      schemaName,
      'pos_sessions',
      'pos_sessions_branch_id_fkey',
      `FOREIGN KEY ("branch_id") REFERENCES "${esc}"."branches"("id")
       ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await this.addForeignKeyIfMissing(
      schemaName,
      'pos_sessions',
      'pos_sessions_staff_user_id_fkey',
      `FOREIGN KEY ("staff_user_id") REFERENCES "${esc}"."users"("id")
       ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_pos_sessions_branch_status"
       ON "${esc}"."pos_sessions"("branch_id", "status")`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_pos_sessions_branch_opened"
       ON "${esc}"."pos_sessions"("branch_id", "opened_at" DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "pos_sessions_one_open_per_branch"
       ON "${esc}"."pos_sessions"("branch_id")
       WHERE "status" = 'open'`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${esc}"."pos_statements" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "session_id" UUID NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'open',
        "journal_entry_id" UUID,
        "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "posted_at" TIMESTAMP(6),
        CONSTRAINT "pos_statements_pkey" PRIMARY KEY ("id")
      )`,
    );
    await this.addForeignKeyIfMissing(
      schemaName,
      'pos_statements',
      'pos_statements_session_id_fkey',
      `FOREIGN KEY ("session_id") REFERENCES "${esc}"."pos_sessions"("id")
       ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await this.addForeignKeyIfMissing(
      schemaName,
      'pos_statements',
      'pos_statements_journal_entry_id_fkey',
      `FOREIGN KEY ("journal_entry_id") REFERENCES "${esc}"."journal_entries"("id")
       ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_pos_statements_session"
       ON "${esc}"."pos_statements"("session_id")`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "pos_statements_one_open_per_session"
       ON "${esc}"."pos_statements"("session_id")
       WHERE "status" = 'open'`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${esc}"."pos_statement_lines" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "statement_id" UUID NOT NULL,
        "payment_bucket" VARCHAR(32) NOT NULL,
        "expected_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
        "actual_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
        "difference" DECIMAL(14,2) NOT NULL DEFAULT 0,
        CONSTRAINT "pos_statement_lines_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "pos_statement_lines_statement_bucket_unique" UNIQUE ("statement_id", "payment_bucket")
      )`,
    );
    await this.addForeignKeyIfMissing(
      schemaName,
      'pos_statement_lines',
      'pos_statement_lines_statement_id_fkey',
      `FOREIGN KEY ("statement_id") REFERENCES "${esc}"."pos_statements"("id")
       ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${esc}"."sales" ADD COLUMN IF NOT EXISTS "pos_session_id" UUID`,
    );
    await this.addForeignKeyIfMissing(
      schemaName,
      'sales',
      'sales_pos_session_id_fkey',
      `FOREIGN KEY ("pos_session_id") REFERENCES "${esc}"."pos_sessions"("id")
       ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_sales_pos_session_id"
       ON "${esc}"."sales"("pos_session_id")`,
    );
  }

  private async ensureStaffIdUniqueIndex(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_staff_id_unique_not_null
       ON "${schemaName}"."users"(staff_id)
       WHERE staff_id IS NOT NULL AND BTRIM(staff_id) <> ''`,
    );
  }

  /** Migrate legacy cashier_id → staff_id and ensure partial unique index. */
  private async ensureUsersStaffIdColumn(schemaName: string): Promise<void> {
    const [staffCol] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'users'
          AND column_name = 'staff_id'
      ) AS ok
      `,
      schemaName,
    );
    if (staffCol?.ok) {
      await this.ensureStaffIdUniqueIndex(schemaName);
      return;
    }

    const [cashierCol] = await this.prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'users'
          AND column_name = 'cashier_id'
      ) AS ok
      `,
      schemaName,
    );

    if (cashierCol?.ok) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."users" RENAME COLUMN cashier_id TO staff_id`,
      );
      await this.prisma.$executeRawUnsafe(
        `ALTER INDEX IF EXISTS "${schemaName}".users_cashier_id_unique_not_null RENAME TO users_staff_id_unique_not_null`,
      );
      await this.ensureStaffIdUniqueIndex(schemaName);
      return;
    }

    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."users" ADD COLUMN staff_id VARCHAR(120)`,
    );
    await this.ensureStaffIdUniqueIndex(schemaName);
  }

  /**
   * Lightweight schema upgrade for branch isolation.
   * Existing tenants may be missing branch_id columns; ensure they're present.
   */
  private async ensureTenantBranchIsolationColumns(
    schemaName: string,
  ): Promise<void> {
    await this.ensureBatchesTable(schemaName);
    await this.ensurePurchasingTablesIfMissing(schemaName);
    await this.ensureSalesAndCashTablesForBranchPatches(schemaName);
    await this.ensureUsersStaffIdColumn(schemaName);

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
    await this.ensureReturnVouchersTable(schemaName);
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
        allow_reconciliation BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        description TEXT,
        payment_method_key VARCHAR(50),
        parent_id UUID REFERENCES "${schemaName}"."chart_of_accounts"(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
      {
        column: 'credit_override_manager_id',
        alterSql: `ALTER TABLE "${schemaName}"."sales"
          ADD COLUMN credit_override_manager_id UUID REFERENCES "${schemaName}"."users"(id)`,
      },
      {
        column: 'credit_override_reason',
        alterSql: `ALTER TABLE "${schemaName}"."sales"
          ADD COLUMN credit_override_reason TEXT`,
      },
      {
        column: 'credit_override_at',
        alterSql: `ALTER TABLE "${schemaName}"."sales"
          ADD COLUMN credit_override_at TIMESTAMP`,
      },
      {
        column: 'due_date',
        alterSql: `ALTER TABLE "${schemaName}"."sales"
          ADD COLUMN due_date DATE`,
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

  /** products.item_no — primary business identifier for imports. */
  private async ensureProductItemNoColumn(schemaName: string): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'products'))) return;
    if (!(await this.tenantColumnExists(schemaName, 'products', 'item_no'))) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."products"
         ADD COLUMN IF NOT EXISTS item_no VARCHAR(50)`,
      );
    }
    const duplicates = await this.duplicateColumnValues(
      schemaName,
      'products',
      'item_no',
      5,
    );
    if (duplicates.length) {
      this.logger.warn(
        `Skipping ${schemaName}.products_item_no_unique: duplicate item_no values exist (${duplicates
          .map((d) => `${d.value} x${d.count}`)
          .join(', ')})`,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS products_item_no_unique
         ON "${schemaName}"."products"(item_no)
         WHERE item_no IS NOT NULL AND TRIM(item_no) <> ''`,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_products_item_no
       ON "${schemaName}"."products"(item_no)`,
    );
  }

  /** products.supplier_id — default vendor from catalog / Excel import. */
  private async ensureProductSupplierIdColumn(schemaName: string): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'products'))) return;
    if (!(await this.tenantColumnExists(schemaName, 'products', 'supplier_id'))) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."products"
         ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES "${schemaName}"."suppliers"(id) ON DELETE SET NULL`,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_products_supplier_id
       ON "${schemaName}"."products"(supplier_id)`,
    );
  }

  /** Supplier metadata and product-supplier join table for purchasing V1. */
  private async ensureSupplierManagementV1(schemaName: string): Promise<void> {
    const hasSuppliers = await this.tenantTableExists(schemaName, 'suppliers');
    const hasProducts = await this.tenantTableExists(schemaName, 'products');
    if (!hasSuppliers || !hasProducts) return;

    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."suppliers"
       ADD COLUMN IF NOT EXISTS supplier_type VARCHAR(20) NOT NULL DEFAULT 'local',
       ADD COLUMN IF NOT EXISTS country VARCHAR(100),
       ADD COLUMN IF NOT EXISTS city VARCHAR(100),
       ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    );
    await this.prisma.$executeRawUnsafe(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE conname = 'suppliers_supplier_type_check'
             AND connamespace = '"${schemaName}"'::regnamespace
         ) THEN
           ALTER TABLE "${schemaName}"."suppliers"
             ADD CONSTRAINT suppliers_supplier_type_check
             CHECK (supplier_type IN ('local', 'international'));
         END IF;
       END $$`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_suppliers_type_active_name
       ON "${schemaName}"."suppliers"(supplier_type, active, name)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_suppliers_active_name
       ON "${schemaName}"."suppliers"(active, name)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."product_suppliers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES "${schemaName}"."suppliers"(id) ON DELETE CASCADE,
        is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
        last_cost_price NUMERIC(10,2),
        supplier_item_code VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (
                  PARTITION BY product_id
                  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
                ) AS rn
         FROM "${schemaName}"."product_suppliers"
         WHERE is_preferred
       )
       UPDATE "${schemaName}"."product_suppliers" ps
       SET is_preferred = FALSE,
           updated_at = CURRENT_TIMESTAMP
       FROM ranked r
       WHERE ps.id = r.id
         AND r.rn > 1`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS product_suppliers_product_supplier_uq
       ON "${schemaName}"."product_suppliers"(product_id, supplier_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS product_suppliers_one_preferred_per_product
       ON "${schemaName}"."product_suppliers"(product_id)
       WHERE is_preferred`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_suppliers_product_preferred
       ON "${schemaName}"."product_suppliers"(product_id, is_preferred)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_suppliers_supplier_product
       ON "${schemaName}"."product_suppliers"(supplier_id, product_id)`,
    );

    if (await this.tenantColumnExists(schemaName, 'products', 'supplier_id')) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."product_suppliers" AS ps (
           product_id, supplier_id, is_preferred, last_cost_price
         )
         SELECT
           p.id,
           p.supplier_id,
           NOT EXISTS (
             SELECT 1
             FROM "${schemaName}"."product_suppliers" existing
             WHERE existing.product_id = p.id
               AND existing.is_preferred
           ),
           NULL
         FROM "${schemaName}"."products" p
         WHERE p.supplier_id IS NOT NULL
         ON CONFLICT (product_id, supplier_id) DO UPDATE
           SET is_preferred = CASE
                 WHEN ps.is_preferred THEN TRUE
                 WHEN NOT EXISTS (
                   SELECT 1
                   FROM "${schemaName}"."product_suppliers" existing
                   WHERE existing.product_id = EXCLUDED.product_id
                     AND existing.is_preferred
                     AND existing.supplier_id <> EXCLUDED.supplier_id
                 ) THEN TRUE
                 ELSE ps.is_preferred
               END,
               updated_at = CURRENT_TIMESTAMP`,
      );
    }

    const hasPurchases = await this.tenantTableExists(schemaName, 'purchases');
    const hasPurchaseItems = await this.tenantTableExists(
      schemaName,
      'purchase_items',
    );
    if (hasPurchases && hasPurchaseItems) {
      await this.prisma.$executeRawUnsafe(
        `WITH latest_purchase_cost AS (
           SELECT DISTINCT ON (pi.product_id, p.supplier_id)
             pi.product_id,
             p.supplier_id,
             pi.cost_price
           FROM "${schemaName}"."purchase_items" pi
           JOIN "${schemaName}"."purchases" p ON p.id = pi.purchase_id
           WHERE pi.product_id IS NOT NULL
             AND p.supplier_id IS NOT NULL
           ORDER BY
             pi.product_id,
             p.supplier_id,
             p.purchase_date DESC NULLS LAST,
             p.created_at DESC NULLS LAST,
             pi.id DESC
         )
         INSERT INTO "${schemaName}"."product_suppliers" AS ps (
           product_id, supplier_id, is_preferred, last_cost_price
         )
         SELECT product_id, supplier_id, FALSE, cost_price
         FROM latest_purchase_cost
         ON CONFLICT (product_id, supplier_id) DO UPDATE
           SET last_cost_price = COALESCE(EXCLUDED.last_cost_price, ps.last_cost_price),
               updated_at = CURRENT_TIMESTAMP`,
      );
      await this.prisma.$executeRawUnsafe(
        `WITH latest_supplier_per_product AS (
           SELECT DISTINCT ON (pi.product_id)
             pi.product_id,
             p.supplier_id
           FROM "${schemaName}"."purchase_items" pi
           JOIN "${schemaName}"."purchases" p ON p.id = pi.purchase_id
           WHERE pi.product_id IS NOT NULL
             AND p.supplier_id IS NOT NULL
           ORDER BY
             pi.product_id,
             p.purchase_date DESC NULLS LAST,
             p.created_at DESC NULLS LAST,
             pi.id DESC
         )
         UPDATE "${schemaName}"."product_suppliers" ps
         SET is_preferred = TRUE,
             updated_at = CURRENT_TIMESTAMP
         FROM latest_supplier_per_product latest
         WHERE ps.product_id = latest.product_id
           AND ps.supplier_id = latest.supplier_id
           AND NOT EXISTS (
             SELECT 1
             FROM "${schemaName}"."product_suppliers" existing
             WHERE existing.product_id = latest.product_id
               AND existing.is_preferred
           )`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_purchases_supplier_branch_date
         ON "${schemaName}"."purchases"(supplier_id, branch_id, purchase_date DESC, created_at DESC)`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_purchase_items_product_purchase
         ON "${schemaName}"."purchase_items"(product_id, purchase_id)`,
      );
    }

    const hasJournalPartner =
      (await this.tenantTableExists(schemaName, 'journal_lines')) &&
      (await this.tenantColumnExists(schemaName, 'journal_lines', 'partner_kind')) &&
      (await this.tenantColumnExists(schemaName, 'journal_lines', 'partner_id'));
    if (hasJournalPartner) {
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS journal_lines_partner_account_entry_idx
         ON "${schemaName}"."journal_lines"(partner_kind, partner_id, account_id, journal_entry_id)`,
      );
    }
    if (await this.tenantTableExists(schemaName, 'journal_entries')) {
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS journal_entries_branch_entry_created_idx
         ON "${schemaName}"."journal_entries"(branch_id, entry_date, created_at, id)`,
      );
    }
  }

  /** branches.code - short code for Excel import branch_code column. */
  private async ensureBranchCodeColumn(schemaName: string): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'branches'))) return;
    if (!(await this.tenantColumnExists(schemaName, 'branches', 'code'))) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."branches"
         ADD COLUMN IF NOT EXISTS code VARCHAR(32)`,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS branches_code_unique
       ON "${schemaName}"."branches"(code)
       WHERE code IS NOT NULL AND TRIM(code) <> ''`,
    );
    // Backfill codes from name slug for existing branches without code
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."branches"
       SET code = UPPER(LEFT(REGEXP_REPLACE(COALESCE(name, id::text), '[^a-zA-Z0-9]', '', 'g'), 8))
       WHERE code IS NULL OR TRIM(code) = ''`,
    );
  }

  /** Tenant-wide settings (business type, import policies). */
  private async ensureTenantSettingsTable(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."tenant_settings" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_type VARCHAR(32) NOT NULL DEFAULT 'pharmacy',
        import_policies JSONB NOT NULL DEFAULT '{}'::jsonb,
        invoice_before_receive BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."tenant_settings" (business_type)
       SELECT 'pharmacy'
      WHERE NOT EXISTS (SELECT 1 FROM "${schemaName}"."tenant_settings")`,
    );
  }

  private async ensureUomSystem(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."uoms" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(32) NOT NULL,
        name VARCHAR(100) NOT NULL,
        symbol VARCHAR(32),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS uoms_code_key
       ON "${schemaName}"."uoms"(code)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."product_uoms" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id) ON DELETE CASCADE,
        uom_id UUID NOT NULL REFERENCES "${schemaName}"."uoms"(id),
        conversion_factor_to_base NUMERIC(18,6) NOT NULL,
        is_base BOOLEAN NOT NULL DEFAULT FALSE,
        is_purchase_default BOOLEAN NOT NULL DEFAULT FALSE,
        is_sales_default BOOLEAN NOT NULL DEFAULT FALSE,
        is_pos_default BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT product_uoms_factor_positive CHECK (conversion_factor_to_base > 0),
        CONSTRAINT product_uoms_base_factor_one CHECK ((NOT is_base) OR conversion_factor_to_base = 1)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS product_uoms_product_uom_uq
       ON "${schemaName}"."product_uoms"(product_id, uom_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS product_uoms_one_base_per_product
       ON "${schemaName}"."product_uoms"(product_id)
       WHERE is_base IS TRUE AND is_active IS TRUE`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS product_uoms_one_purchase_default
       ON "${schemaName}"."product_uoms"(product_id)
       WHERE is_purchase_default IS TRUE AND is_active IS TRUE`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS product_uoms_one_sales_default
       ON "${schemaName}"."product_uoms"(product_id)
       WHERE is_sales_default IS TRUE AND is_active IS TRUE`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS product_uoms_one_pos_default
       ON "${schemaName}"."product_uoms"(product_id)
       WHERE is_pos_default IS TRUE AND is_active IS TRUE`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_uoms_product_id
       ON "${schemaName}"."product_uoms"(product_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_uoms_uom_id
       ON "${schemaName}"."product_uoms"(uom_id)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."product_uom_prices" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id) ON DELETE CASCADE,
        uom_id UUID NOT NULL REFERENCES "${schemaName}"."uoms"(id),
        selling_price NUMERIC(14,2),
        cost_price NUMERIC(14,4),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS product_uom_prices_active_product_uom_uq
       ON "${schemaName}"."product_uom_prices"(product_id, uom_id)
       WHERE active IS TRUE`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_uom_prices_product_uom
       ON "${schemaName}"."product_uom_prices"(product_id, uom_id)`,
    );
    const productUomPriceCols = [
      `ADD COLUMN IF NOT EXISTS initial_cost_price NUMERIC(14,4)`,
      `ADD COLUMN IF NOT EXISTS last_purchase_cost NUMERIC(14,4)`,
      `ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMP`,
      `ADD COLUMN IF NOT EXISTS last_purchase_id UUID REFERENCES "${schemaName}"."purchases"(id) ON DELETE SET NULL`,
      `ADD COLUMN IF NOT EXISTS last_purchase_item_id UUID REFERENCES "${schemaName}"."purchase_items"(id) ON DELETE SET NULL`,
    ];
    for (const alter of productUomPriceCols) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."product_uom_prices" ${alter}`,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."product_uom_prices"
       SET initial_cost_price = COALESCE(initial_cost_price, cost_price)
       WHERE cost_price IS NOT NULL`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."product_supplier_uom_costs" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES "${schemaName}"."suppliers"(id) ON DELETE CASCADE,
        uom_id UUID NOT NULL REFERENCES "${schemaName}"."uoms"(id),
        current_cost_price NUMERIC(14,4),
        last_purchase_cost NUMERIC(14,4),
        last_purchase_at TIMESTAMP,
        last_purchase_id UUID REFERENCES "${schemaName}"."purchases"(id) ON DELETE SET NULL,
        last_purchase_item_id UUID REFERENCES "${schemaName}"."purchase_items"(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS product_supplier_uom_costs_product_supplier_uom_uq
       ON "${schemaName}"."product_supplier_uom_costs"(product_id, supplier_id, uom_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_supplier_uom_costs_lookup
       ON "${schemaName}"."product_supplier_uom_costs"(supplier_id, product_id, uom_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_supplier_uom_costs_product_uom
       ON "${schemaName}"."product_supplier_uom_costs"(product_id, uom_id)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."supplier_price_history" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id) ON DELETE CASCADE,
        supplier_id UUID NOT NULL REFERENCES "${schemaName}"."suppliers"(id) ON DELETE CASCADE,
        uom_id UUID NOT NULL REFERENCES "${schemaName}"."uoms"(id),
        purchase_id UUID REFERENCES "${schemaName}"."purchases"(id) ON DELETE SET NULL,
        purchase_item_id UUID REFERENCES "${schemaName}"."purchase_items"(id) ON DELETE SET NULL,
        old_cost_price NUMERIC(14,4),
        new_cost_price NUMERIC(14,4) NOT NULL,
        entered_quantity NUMERIC(14,4),
        base_quantity INTEGER,
        conversion_factor_snapshot NUMERIC(18,6),
        purchase_date DATE,
        source VARCHAR(50) NOT NULL DEFAULT 'purchase_invoice',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_supplier_price_history_lookup
       ON "${schemaName}"."supplier_price_history"(product_id, supplier_id, uom_id, created_at DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_supplier_price_history_purchase
       ON "${schemaName}"."supplier_price_history"(purchase_id)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."product_uom_barcodes" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id) ON DELETE CASCADE,
        uom_id UUID NOT NULL REFERENCES "${schemaName}"."uoms"(id),
        barcode VARCHAR(100) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS product_uom_barcodes_active_barcode_uq
       ON "${schemaName}"."product_uom_barcodes"(barcode)
       WHERE active IS TRUE AND btrim(barcode) <> ''`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_uom_barcodes_barcode
       ON "${schemaName}"."product_uom_barcodes"(barcode)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_uom_barcodes_product_uom
       ON "${schemaName}"."product_uom_barcodes"(product_id, uom_id)`,
    );

    await this.ensureUomDocumentColumns(schemaName);
    await this.seedDefaultUoms(schemaName);
    await this.backfillProductBaseUoms(schemaName);
    await this.backfillUomDocumentQuantities(schemaName);
  }

  private async ensurePricingAndOffersV1(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."price_groups" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS price_groups_code_key
       ON "${schemaName}"."price_groups"(code)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS price_groups_one_default
       ON "${schemaName}"."price_groups"(is_default)
       WHERE is_default IS TRUE AND active IS TRUE`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_price_groups_active
       ON "${schemaName}"."price_groups"(active)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."product_price_group_prices" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id) ON DELETE CASCADE,
        uom_id UUID NOT NULL REFERENCES "${schemaName}"."uoms"(id),
        price_group_id UUID NOT NULL REFERENCES "${schemaName}"."price_groups"(id) ON DELETE CASCADE,
        selling_price NUMERIC(14,2) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT product_price_group_prices_nonnegative CHECK (selling_price >= 0)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS product_price_group_prices_active_uq
       ON "${schemaName}"."product_price_group_prices"(product_id, uom_id, price_group_id)
       WHERE active IS TRUE`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_price_group_prices_lookup
       ON "${schemaName}"."product_price_group_prices"(product_id, uom_id, price_group_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_price_group_prices_group_active
       ON "${schemaName}"."product_price_group_prices"(price_group_id, active)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."product_price_history" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id) ON DELETE CASCADE,
        uom_id UUID REFERENCES "${schemaName}"."uoms"(id) ON DELETE SET NULL,
        price_group_id UUID REFERENCES "${schemaName}"."price_groups"(id) ON DELETE SET NULL,
        old_selling_price NUMERIC(14,2),
        new_selling_price NUMERIC(14,2),
        old_cost_price NUMERIC(14,4),
        new_cost_price NUMERIC(14,4),
        change_reason TEXT,
        source VARCHAR(50) NOT NULL DEFAULT 'manual',
        actor_user_id UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_price_history_product_created
       ON "${schemaName}"."product_price_history"(product_id, created_at DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_product_price_history_group_created
       ON "${schemaName}"."product_price_history"(price_group_id, created_at DESC)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."offer_lists" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        no VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'disabled',
        price_group_id UUID REFERENCES "${schemaName}"."price_groups"(id) ON DELETE SET NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        validation_period_id VARCHAR(100),
        start_date DATE,
        end_date DATE,
        offer_type VARCHAR(50) NOT NULL,
        discount_type VARCHAR(50) NOT NULL,
        discount_value NUMERIC(14,2) NOT NULL DEFAULT 0,
        apply_to VARCHAR(50) NOT NULL DEFAULT 'product',
        branch_scope VARCHAR(50) NOT NULL DEFAULT 'all',
        stacking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT offer_lists_status_check CHECK (status IN ('enabled', 'disabled')),
        CONSTRAINT offer_lists_discount_nonnegative CHECK (discount_value >= 0)
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS offer_lists_no_key
       ON "${schemaName}"."offer_lists"(no)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_offer_lists_status_dates_priority
       ON "${schemaName}"."offer_lists"(status, start_date, end_date, priority)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_offer_lists_group_status
       ON "${schemaName}"."offer_lists"(price_group_id, status)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."offer_rules" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        offer_id UUID NOT NULL REFERENCES "${schemaName}"."offer_lists"(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "${schemaName}"."products"(id) ON DELETE CASCADE,
        category_id UUID REFERENCES "${schemaName}"."product_categories"(id) ON DELETE CASCADE,
        min_quantity NUMERIC(14,4),
        buy_quantity NUMERIC(14,4),
        get_quantity NUMERIC(14,4),
        special_price NUMERIC(14,2),
        bundle_product_ids JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_offer_rules_offer_id
       ON "${schemaName}"."offer_rules"(offer_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_offer_rules_product_id
       ON "${schemaName}"."offer_rules"(product_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_offer_rules_category_id
       ON "${schemaName}"."offer_rules"(category_id)`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."offer_redemptions" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        offer_id UUID NOT NULL REFERENCES "${schemaName}"."offer_lists"(id) ON DELETE CASCADE,
        sale_id UUID REFERENCES "${schemaName}"."sales"(id) ON DELETE SET NULL,
        sale_item_id UUID REFERENCES "${schemaName}"."sale_items"(id) ON DELETE SET NULL,
        branch_id UUID REFERENCES "${schemaName}"."branches"(id) ON DELETE SET NULL,
        product_id UUID REFERENCES "${schemaName}"."products"(id) ON DELETE SET NULL,
        price_group_id UUID REFERENCES "${schemaName}"."price_groups"(id) ON DELETE SET NULL,
        discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_offer_redemptions_offer_created
       ON "${schemaName}"."offer_redemptions"(offer_id, created_at DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_offer_redemptions_sale_id
       ON "${schemaName}"."offer_redemptions"(sale_id)`,
    );

    const saleItemColumns = [
      `ADD COLUMN IF NOT EXISTS price_group_id UUID REFERENCES "${schemaName}"."price_groups"(id) ON DELETE SET NULL`,
      `ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES "${schemaName}"."offer_lists"(id) ON DELETE SET NULL`,
      `ADD COLUMN IF NOT EXISTS line_discount NUMERIC(14,2) NOT NULL DEFAULT 0`,
      `ADD COLUMN IF NOT EXISTS discount_source VARCHAR(50)`,
    ];
    for (const alter of saleItemColumns) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."sale_items" ${alter}`,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_items_price_group_id
       ON "${schemaName}"."sale_items"(price_group_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_items_offer_id
       ON "${schemaName}"."sale_items"(offer_id)`,
    );

    await this.seedDefaultPriceGroups(schemaName);
    await this.backfillRetailPriceGroupPrices(schemaName);
    await this.ensurePricingOfferPermissions(schemaName);
  }

  private async seedDefaultPriceGroups(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."price_groups" (code, name, is_default, active)
       VALUES
         ('RETAIL', 'Retail', TRUE, TRUE),
         ('WHOLESALE', 'Wholesale', FALSE, TRUE),
         ('VIP', 'VIP', FALSE, TRUE),
         ('HOSPITAL', 'Hospital', FALSE, TRUE),
         ('INSURANCE', 'Insurance', FALSE, TRUE)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             active = TRUE,
             is_default = CASE
               WHEN EXCLUDED.code = 'RETAIL' THEN TRUE
               ELSE price_groups.is_default
             END,
             updated_at = CURRENT_TIMESTAMP`,
    );
  }

  private async backfillRetailPriceGroupPrices(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `WITH retail AS (
         SELECT id FROM "${schemaName}"."price_groups" WHERE code = 'RETAIL' LIMIT 1
       ),
       active_prices AS (
         SELECT DISTINCT ON (pu.product_id, pu.uom_id)
           pu.product_id,
           pu.uom_id,
           COALESCE(pp.selling_price, CASE
             WHEN pu.is_base THEN p.list_price
             ELSE p.list_price * pu.conversion_factor_to_base
           END) AS selling_price
         FROM "${schemaName}"."product_uoms" pu
         JOIN "${schemaName}"."products" p ON p.id = pu.product_id
         LEFT JOIN "${schemaName}"."product_uom_prices" pp
           ON pp.product_id = pu.product_id
          AND pp.uom_id = pu.uom_id
          AND pp.active IS TRUE
         WHERE pu.is_active IS TRUE
       )
       INSERT INTO "${schemaName}"."product_price_group_prices" (
         product_id, uom_id, price_group_id, selling_price, active
       )
       SELECT product_id, uom_id, retail.id, GREATEST(COALESCE(selling_price, 0), 0), TRUE
       FROM active_prices
       CROSS JOIN retail
       WHERE selling_price IS NOT NULL
       ON CONFLICT DO NOTHING`,
    );
  }

  private async ensureReturnVouchersTable(schemaName: string): Promise<void> {
    if (await this.tenantTableExists(schemaName, 'return_vouchers')) {
      return;
    }

    if (await this.tenantTableExists(schemaName, 'ReturnVoucher')) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."ReturnVoucher" RENAME TO "return_vouchers"`,
      );
      return;
    }

    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."return_vouchers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id),
        sale_id UUID NOT NULL REFERENCES "${schemaName}"."sales"(id) ON DELETE CASCADE,
        sale_item_id UUID NOT NULL REFERENCES "${schemaName}"."sale_items"(id),
        quantity INTEGER NOT NULL,
        unit_price NUMERIC(10,2) NOT NULL,
        token VARCHAR(80) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        reason TEXT,
        sale_return_id UUID REFERENCES "${schemaName}"."sale_returns"(id) ON DELETE SET NULL,
        expires_at TIMESTAMP,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS return_vouchers_token_key
       ON "${schemaName}"."return_vouchers"(token)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_return_vouchers_sale_id
       ON "${schemaName}"."return_vouchers"(sale_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_return_vouchers_branch_id
       ON "${schemaName}"."return_vouchers"(branch_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_return_vouchers_token
       ON "${schemaName}"."return_vouchers"(token)`,
    );
  }

  private async ensureUomDocumentColumns(schemaName: string): Promise<void> {
    await this.ensureReturnVouchersTable(schemaName);

    const purchaseItemColumns = [
      `ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES "${schemaName}"."uoms"(id)`,
      `ADD COLUMN IF NOT EXISTS conversion_factor_snapshot NUMERIC(18,6) NOT NULL DEFAULT 1`,
      `ADD COLUMN IF NOT EXISTS base_quantity INTEGER NOT NULL DEFAULT 0`,
      `ADD COLUMN IF NOT EXISTS base_unit_cost NUMERIC(14,4)`,
      `ADD COLUMN IF NOT EXISTS update_selling_price BOOLEAN NOT NULL DEFAULT FALSE`,
    ];
    for (const alter of purchaseItemColumns) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."purchase_items" ${alter}`,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_purchase_items_uom_id
       ON "${schemaName}"."purchase_items"(uom_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_purchase_items_product_uom
       ON "${schemaName}"."purchase_items"(product_id, uom_id)`,
    );

    const saleItemColumns = [
      `ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES "${schemaName}"."uoms"(id)`,
      `ADD COLUMN IF NOT EXISTS entered_quantity NUMERIC(14,4)`,
      `ADD COLUMN IF NOT EXISTS conversion_factor_snapshot NUMERIC(18,6) NOT NULL DEFAULT 1`,
      `ADD COLUMN IF NOT EXISTS base_quantity INTEGER NOT NULL DEFAULT 0`,
    ];
    for (const alter of saleItemColumns) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."sale_items" ${alter}`,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_items_uom_id
       ON "${schemaName}"."sale_items"(uom_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_items_product_uom
       ON "${schemaName}"."sale_items"(product_id, uom_id)`,
    );

    if (await this.tenantTableExists(schemaName, 'return_vouchers')) {
      const returnVoucherColumns = [
        `ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES "${schemaName}"."uoms"(id)`,
        `ADD COLUMN IF NOT EXISTS entered_quantity NUMERIC(14,4)`,
        `ADD COLUMN IF NOT EXISTS conversion_factor_snapshot NUMERIC(18,6) NOT NULL DEFAULT 1`,
        `ADD COLUMN IF NOT EXISTS base_quantity INTEGER NOT NULL DEFAULT 0`,
      ];
      for (const alter of returnVoucherColumns) {
        await this.prisma.$executeRawUnsafe(
          `ALTER TABLE "${schemaName}"."return_vouchers" ${alter}`,
        );
      }
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS idx_return_vouchers_uom_id
         ON "${schemaName}"."return_vouchers"(uom_id)`,
      );
    }

    const saleReturnItemColumns = [
      `ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES "${schemaName}"."uoms"(id)`,
      `ADD COLUMN IF NOT EXISTS entered_quantity NUMERIC(14,4)`,
      `ADD COLUMN IF NOT EXISTS conversion_factor_snapshot NUMERIC(18,6) NOT NULL DEFAULT 1`,
      `ADD COLUMN IF NOT EXISTS base_quantity INTEGER NOT NULL DEFAULT 0`,
    ];
    for (const alter of saleReturnItemColumns) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."sale_return_items" ${alter}`,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_return_items_uom_id
       ON "${schemaName}"."sale_return_items"(uom_id)`,
    );
  }

  private async seedDefaultUoms(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."uoms" (code, name, symbol)
       VALUES
         ('PCS', 'Piece', 'PCS'),
         ('TAB', 'Tablet', 'TAB'),
         ('STRIP', 'Strip', 'Strip'),
         ('BOX', 'Box', 'Box'),
         ('CTN', 'Carton', 'Ctn'),
         ('BTL', 'Bottle', 'Btl')
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             symbol = EXCLUDED.symbol,
             active = TRUE,
             updated_at = CURRENT_TIMESTAMP`,
    );
  }

  private async backfillProductBaseUoms(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `WITH normalized AS (
         SELECT DISTINCT
           CASE
             WHEN p.unit IS NULL OR btrim(p.unit) = '' THEN 'PCS'
             WHEN upper(btrim(p.unit)) IN ('PC', 'PCS', 'PIECE', 'PIECES', 'EA', 'EACH') THEN 'PCS'
             WHEN upper(btrim(p.unit)) IN ('TAB', 'TABS', 'TABLET', 'TABLETS') THEN 'TAB'
             WHEN upper(btrim(p.unit)) IN ('STRIP', 'STRIPS') THEN 'STRIP'
             WHEN upper(btrim(p.unit)) IN ('BOX', 'BOXES') THEN 'BOX'
             WHEN upper(btrim(p.unit)) IN ('CTN', 'CARTON', 'CARTONS') THEN 'CTN'
             WHEN upper(btrim(p.unit)) IN ('BTL', 'BOTTLE', 'BOTTLES') THEN 'BTL'
             ELSE upper(regexp_replace(btrim(p.unit), '[^A-Za-z0-9]+', '_', 'g'))
           END AS code,
           COALESCE(NULLIF(btrim(p.unit), ''), 'Piece') AS raw_name
         FROM "${schemaName}"."products" p
       )
       INSERT INTO "${schemaName}"."uoms" (code, name, symbol)
       SELECT code, initcap(replace(raw_name, '_', ' ')), code
       FROM normalized
       WHERE code <> ''
       ON CONFLICT (code) DO NOTHING`,
    );

    await this.prisma.$executeRawUnsafe(
      `WITH product_base AS (
         SELECT
           p.id AS product_id,
           u.id AS uom_id
         FROM "${schemaName}"."products" p
         JOIN "${schemaName}"."uoms" u ON u.code = CASE
           WHEN p.unit IS NULL OR btrim(p.unit) = '' THEN 'PCS'
           WHEN upper(btrim(p.unit)) IN ('PC', 'PCS', 'PIECE', 'PIECES', 'EA', 'EACH') THEN 'PCS'
           WHEN upper(btrim(p.unit)) IN ('TAB', 'TABS', 'TABLET', 'TABLETS') THEN 'TAB'
           WHEN upper(btrim(p.unit)) IN ('STRIP', 'STRIPS') THEN 'STRIP'
           WHEN upper(btrim(p.unit)) IN ('BOX', 'BOXES') THEN 'BOX'
           WHEN upper(btrim(p.unit)) IN ('CTN', 'CARTON', 'CARTONS') THEN 'CTN'
           WHEN upper(btrim(p.unit)) IN ('BTL', 'BOTTLE', 'BOTTLES') THEN 'BTL'
           ELSE upper(regexp_replace(btrim(p.unit), '[^A-Za-z0-9]+', '_', 'g'))
         END
       )
       INSERT INTO "${schemaName}"."product_uoms" (
         product_id, uom_id, conversion_factor_to_base,
         is_base, is_purchase_default, is_sales_default, is_pos_default, is_active
       )
       SELECT product_id, uom_id, 1, TRUE, TRUE, TRUE, TRUE, TRUE
       FROM product_base pb
       WHERE NOT EXISTS (
         SELECT 1
         FROM "${schemaName}"."product_uoms" existing
         WHERE existing.product_id = pb.product_id
           AND existing.is_base IS TRUE
           AND existing.is_active IS TRUE
       )
       ON CONFLICT (product_id, uom_id) DO UPDATE
         SET conversion_factor_to_base = 1,
             is_base = TRUE,
             is_purchase_default = TRUE,
             is_sales_default = TRUE,
             is_pos_default = TRUE,
             is_active = TRUE,
             updated_at = CURRENT_TIMESTAMP`,
    );

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."product_uom_barcodes" (product_id, uom_id, barcode)
       SELECT p.id, pu.uom_id, btrim(p.barcode)
       FROM "${schemaName}"."products" p
       JOIN "${schemaName}"."product_uoms" pu
         ON pu.product_id = p.id
        AND pu.is_base IS TRUE
        AND pu.is_active IS TRUE
       WHERE p.barcode IS NOT NULL
         AND btrim(p.barcode) <> ''
       ON CONFLICT DO NOTHING`,
    );

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."product_uom_prices" (product_id, uom_id, selling_price)
       SELECT p.id, pu.uom_id, p.list_price
       FROM "${schemaName}"."products" p
       JOIN "${schemaName}"."product_uoms" pu
         ON pu.product_id = p.id
        AND pu.is_base IS TRUE
        AND pu.is_active IS TRUE
       WHERE p.list_price IS NOT NULL
       ON CONFLICT DO NOTHING`,
    );
  }

  private async backfillUomDocumentQuantities(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."purchase_items"
       SET base_quantity = COALESCE(quantity, 0)
       WHERE COALESCE(base_quantity, 0) = 0`,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."purchase_items" pi
       SET uom_id = pu.uom_id
       FROM "${schemaName}"."product_uoms" pu
       WHERE pi.uom_id IS NULL
         AND pi.product_id = pu.product_id
         AND pu.is_base IS TRUE
         AND pu.is_active IS TRUE`,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."purchase_items"
       SET base_unit_cost = cost_price
       WHERE base_unit_cost IS NULL
         AND cost_price IS NOT NULL
         AND COALESCE(conversion_factor_snapshot, 1) = 1`,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."sale_items"
       SET base_quantity = COALESCE(quantity, 0),
           entered_quantity = COALESCE(entered_quantity, COALESCE(quantity, 0))
       WHERE COALESCE(base_quantity, 0) = 0`,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."sale_items" si
       SET uom_id = pu.uom_id
       FROM "${schemaName}"."product_uoms" pu
       WHERE si.uom_id IS NULL
         AND si.product_id = pu.product_id
         AND pu.is_base IS TRUE
         AND pu.is_active IS TRUE`,
    );
    if (await this.tenantTableExists(schemaName, 'return_vouchers')) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "${schemaName}"."return_vouchers" rv
         SET uom_id = COALESCE(rv.uom_id, si.uom_id),
             entered_quantity = COALESCE(rv.entered_quantity, rv.quantity),
             conversion_factor_snapshot = COALESCE(NULLIF(rv.conversion_factor_snapshot, 0), si.conversion_factor_snapshot, 1),
             base_quantity = COALESCE(NULLIF(rv.base_quantity, 0), rv.quantity)
         FROM "${schemaName}"."sale_items" si
         WHERE si.id = rv.sale_item_id`,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."sale_return_items" sri
       SET uom_id = COALESCE(sri.uom_id, si.uom_id),
           entered_quantity = COALESCE(sri.entered_quantity, sri.quantity),
           conversion_factor_snapshot = COALESCE(NULLIF(sri.conversion_factor_snapshot, 0), si.conversion_factor_snapshot, 1),
           base_quantity = COALESCE(NULLIF(sri.base_quantity, 0), sri.quantity)
       FROM "${schemaName}"."sale_items" si
       WHERE si.id = sri.sale_item_id`,
    );
  }

  /** Purchase workflow columns (draft/receive/invoice) and line receive tracking. */
  private async ensurePurchaseWorkflowExtensions(
    schemaName: string,
  ): Promise<void> {
    const purchaseCols: Array<{ column: string; alterSql: string }> = [
      {
        column: 'status',
        alterSql: `ALTER TABLE "${schemaName}"."purchases"
          ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'closed'`,
      },
      {
        column: 'purchase_order_no',
        alterSql: `ALTER TABLE "${schemaName}"."purchases"
          ADD COLUMN purchase_order_no VARCHAR(100)`,
      },
      {
        column: 'supplier_invoice_no',
        alterSql: `ALTER TABLE "${schemaName}"."purchases"
          ADD COLUMN supplier_invoice_no VARCHAR(100)`,
      },
      {
        column: 'order_date',
        alterSql: `ALTER TABLE "${schemaName}"."purchases"
          ADD COLUMN order_date DATE`,
      },
      {
        column: 'posting_date',
        alterSql: `ALTER TABLE "${schemaName}"."purchases"
          ADD COLUMN posting_date DATE`,
      },
      {
        column: 'due_date',
        alterSql: `ALTER TABLE "${schemaName}"."purchases"
          ADD COLUMN due_date DATE`,
      },
      {
        column: 'notes',
        alterSql: `ALTER TABLE "${schemaName}"."purchases"
          ADD COLUMN notes TEXT`,
      },
      {
        column: 'released_at',
        alterSql: `ALTER TABLE "${schemaName}"."purchases"
          ADD COLUMN released_at TIMESTAMP`,
      },
      {
        column: 'received_at',
        alterSql: `ALTER TABLE "${schemaName}"."purchases"
          ADD COLUMN received_at TIMESTAMP`,
      },
      {
        column: 'invoiced_at',
        alterSql: `ALTER TABLE "${schemaName}"."purchases"
          ADD COLUMN invoiced_at TIMESTAMP`,
      },
    ];

    for (const { column, alterSql } of purchaseCols) {
      if (!(await this.tenantColumnExists(schemaName, 'purchases', column))) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."purchases"
       SET supplier_invoice_no = invoice_number
       WHERE supplier_invoice_no IS NULL AND invoice_number IS NOT NULL`,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."purchases"
       SET status = 'closed'
       WHERE status IS NULL OR status = ''`,
    );

    const itemCols: Array<{ column: string; alterSql: string }> = [
      {
        column: 'quantity_received',
        alterSql: `ALTER TABLE "${schemaName}"."purchase_items"
          ADD COLUMN quantity_received INTEGER NOT NULL DEFAULT 0`,
      },
      {
        column: 'line_discount',
        alterSql: `ALTER TABLE "${schemaName}"."purchase_items"
          ADD COLUMN line_discount NUMERIC(12,2) DEFAULT 0`,
      },
      {
        column: 'tax_amount',
        alterSql: `ALTER TABLE "${schemaName}"."purchase_items"
          ADD COLUMN tax_amount NUMERIC(12,2) DEFAULT 0`,
      },
      {
        column: 'line_notes',
        alterSql: `ALTER TABLE "${schemaName}"."purchase_items"
          ADD COLUMN line_notes TEXT`,
      },
      {
        column: 'planned_batch_number',
        alterSql: `ALTER TABLE "${schemaName}"."purchase_items"
          ADD COLUMN planned_batch_number VARCHAR(100)`,
      },
      {
        column: 'planned_expiry_date',
        alterSql: `ALTER TABLE "${schemaName}"."purchase_items"
          ADD COLUMN planned_expiry_date DATE`,
      },
    ];

    for (const { column, alterSql } of itemCols) {
      if (!(await this.tenantColumnExists(schemaName, 'purchase_items', column))) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."purchase_items"
       SET quantity_received = COALESCE(quantity, 0)
       WHERE quantity_received = 0 AND batch_id IS NOT NULL`,
    );

    if (
      !(await this.tenantColumnExists(
        schemaName,
        'tenant_settings',
        'invoice_before_receive',
      ))
    ) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."tenant_settings"
          ADD COLUMN invoice_before_receive BOOLEAN NOT NULL DEFAULT FALSE`,
      );
    }

    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_purchases_status ON "${schemaName}"."purchases"(status)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_purchases_purchase_order_no ON "${schemaName}"."purchases"(purchase_order_no)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_purchases_supplier_invoice_no ON "${schemaName}"."purchases"(supplier_invoice_no)`,
    );
  }

  /** Generic import job framework tables. */
  private async ensureImportJobsTables(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."import_jobs" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        import_type VARCHAR(32) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'draft',
        file_name TEXT,
        file_storage_path TEXT,
        file_sha256 CHAR(64),
        policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        summary JSONB,
        total_rows INTEGER NOT NULL DEFAULT 0,
        processed_rows INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        created_by UUID REFERENCES "${schemaName}"."users"(id),
        confirmed_by UUID REFERENCES "${schemaName}"."users"(id),
        confirmed_at TIMESTAMP,
        committed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.ensureImportJobsColumns(schemaName);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_import_jobs_type_status
       ON "${schemaName}"."import_jobs"(import_type, status, created_at DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."import_job_rows" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES "${schemaName}"."import_jobs"(id) ON DELETE CASCADE,
        row_number INTEGER NOT NULL,
        raw_data JSONB NOT NULL,
        parsed_data JSONB,
        validation_result JSONB,
        commit_status VARCHAR(16) DEFAULT 'pending',
        commit_error TEXT,
        resolved_product_id UUID,
        resolved_batch_id UUID,
        opening_stock_record_id UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.ensureImportJobRowsColumns(schemaName);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_import_job_rows_job
       ON "${schemaName}"."import_job_rows"(job_id, row_number)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_import_job_rows_commit
       ON "${schemaName}"."import_job_rows"(job_id, commit_status)`,
    );
  }

  private async ensureImportJobsColumns(schemaName: string): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'import_jobs'))) return;
    const alters = [
      `ADD COLUMN IF NOT EXISTS import_type VARCHAR(32) NOT NULL DEFAULT 'product'`,
      `ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'draft'`,
      `ADD COLUMN IF NOT EXISTS file_name TEXT`,
      `ADD COLUMN IF NOT EXISTS file_storage_path TEXT`,
      `ADD COLUMN IF NOT EXISTS file_sha256 CHAR(64)`,
      `ADD COLUMN IF NOT EXISTS policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb`,
      `ADD COLUMN IF NOT EXISTS summary JSONB`,
      `ADD COLUMN IF NOT EXISTS total_rows INTEGER NOT NULL DEFAULT 0`,
      `ADD COLUMN IF NOT EXISTS processed_rows INTEGER NOT NULL DEFAULT 0`,
      `ADD COLUMN IF NOT EXISTS error_message TEXT`,
      `ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0`,
      `ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3`,
      `ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES "${schemaName}"."users"(id)`,
      `ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES "${schemaName}"."users"(id)`,
      `ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP`,
      `ADD COLUMN IF NOT EXISTS committed_at TIMESTAMP`,
      `ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
      `ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    ];
    for (const alter of alters) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."import_jobs" ${alter}`,
      );
    }
  }

  private async ensureImportJobRowsColumns(schemaName: string): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'import_job_rows'))) return;
    const alters = [
      `ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES "${schemaName}"."import_jobs"(id) ON DELETE CASCADE`,
      `ADD COLUMN IF NOT EXISTS row_number INTEGER NOT NULL DEFAULT 0`,
      `ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}'::jsonb`,
      `ADD COLUMN IF NOT EXISTS parsed_data JSONB`,
      `ADD COLUMN IF NOT EXISTS validation_result JSONB`,
      `ADD COLUMN IF NOT EXISTS commit_status VARCHAR(16) DEFAULT 'pending'`,
      `ADD COLUMN IF NOT EXISTS commit_error TEXT`,
      `ADD COLUMN IF NOT EXISTS resolved_product_id UUID`,
      `ADD COLUMN IF NOT EXISTS resolved_batch_id UUID`,
      `ADD COLUMN IF NOT EXISTS opening_stock_record_id UUID`,
      `ADD COLUMN IF NOT EXISTS resolved_purchase_id UUID`,
      `ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    ];
    for (const alter of alters) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."import_job_rows" ${alter}`,
      );
    }
  }

  /** Opening stock traceability from product imports. */
  private async ensureOpeningStockEntriesTable(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."opening_stock_entries" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "${schemaName}"."branches"(id),
        product_id UUID NOT NULL REFERENCES "${schemaName}"."products"(id),
        batch_id UUID REFERENCES "${schemaName}"."batches"(id),
        import_job_id UUID REFERENCES "${schemaName}"."import_jobs"(id),
        import_job_row_id UUID REFERENCES "${schemaName}"."import_job_rows"(id),
        quantity INTEGER NOT NULL,
        cost_price NUMERIC(10,2),
        entry_date DATE NOT NULL,
        external_ref TEXT,
        journal_entry_id UUID REFERENCES "${schemaName}"."journal_entries"(id),
        created_by UUID REFERENCES "${schemaName}"."users"(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await this.ensureOpeningStockEntryColumns(schemaName);
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS opening_stock_import_row_unique
       ON "${schemaName}"."opening_stock_entries"(import_job_row_id)
       WHERE import_job_row_id IS NOT NULL`,
    );
  }

  private async ensureOpeningStockEntryColumns(
    schemaName: string,
  ): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'opening_stock_entries'))) {
      return;
    }
    const alters = [
      `ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES "${schemaName}"."branches"(id)`,
      `ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES "${schemaName}"."products"(id)`,
      `ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES "${schemaName}"."batches"(id)`,
      `ADD COLUMN IF NOT EXISTS import_job_id UUID REFERENCES "${schemaName}"."import_jobs"(id)`,
      `ADD COLUMN IF NOT EXISTS import_job_row_id UUID REFERENCES "${schemaName}"."import_job_rows"(id)`,
      `ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 0`,
      `ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2)`,
      `ADD COLUMN IF NOT EXISTS entry_date DATE NOT NULL DEFAULT CURRENT_DATE`,
      `ADD COLUMN IF NOT EXISTS external_ref TEXT`,
      `ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES "${schemaName}"."journal_entries"(id)`,
      `ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES "${schemaName}"."users"(id)`,
      `ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    ];
    for (const alter of alters) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."opening_stock_entries" ${alter}`,
      );
    }
  }

  private async ensureOpeningStockReversalColumns(
    schemaName: string,
  ): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'opening_stock_entries'))) {
      return;
    }
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."opening_stock_entries"
       ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."opening_stock_entries"
       ADD COLUMN IF NOT EXISTS reversal_journal_entry_id UUID REFERENCES "${schemaName}"."journal_entries"(id)`,
    );
  }

  private async ensureImportJobsReversalColumns(
    schemaName: string,
  ): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'import_jobs'))) {
      return;
    }
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."import_jobs"
       ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."import_jobs"
       ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES "${schemaName}"."users"(id)`,
    );
  }

  /** Customer credit fields, POS policies, and credit permissions for existing tenants. */
  private async ensureCustomerCreditV1(schemaName: string): Promise<void> {
    const customerCols: Array<{ column: string; alterSql: string }> = [
      {
        column: 'customer_no',
        alterSql: `ALTER TABLE "${schemaName}"."customers"
          ADD COLUMN customer_no VARCHAR(32)`,
      },
      {
        column: 'credit_limit',
        alterSql: `ALTER TABLE "${schemaName}"."customers"
          ADD COLUMN credit_limit NUMERIC(12, 2)`,
      },
      {
        column: 'credit_status',
        alterSql: `ALTER TABLE "${schemaName}"."customers"
          ADD COLUMN credit_status VARCHAR(20) NOT NULL DEFAULT 'active'`,
      },
      {
        column: 'is_active',
        alterSql: `ALTER TABLE "${schemaName}"."customers"
          ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE`,
      },
      {
        column: 'member_card_no',
        alterSql: `ALTER TABLE "${schemaName}"."customers"
          ADD COLUMN member_card_no VARCHAR(64)`,
      },
    ];
    for (const { column, alterSql } of customerCols) {
      if (
        !(await this.tenantColumnExists(schemaName, 'customers', column))
      ) {
        await this.prisma.$executeRawUnsafe(alterSql);
      }
    }
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_customers_customer_no
       ON "${schemaName}"."customers"(customer_no)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_customers_member_card_no
       ON "${schemaName}"."customers"(member_card_no)`,
    );

    if (
      !(await this.tenantColumnExists(schemaName, 'tenant_settings', 'pos_policies'))
    ) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "${schemaName}"."tenant_settings"
          ADD COLUMN pos_policies JSONB NOT NULL DEFAULT '{"allow_cashier_credit_sale":true,"allow_credit_limit_override":false}'::jsonb`,
      );
    }

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."permissions" (name)
       VALUES ('view_customer_credit'),
              ('create_customer_credit_sale'),
              ('record_customer_repayment'),
              ('override_credit_limit')
       ON CONFLICT (name) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       CROSS JOIN "${schemaName}"."permissions" p
       WHERE r.name IN ('admin', 'manager')
         AND p.name IN (
           'view_customer_credit',
           'create_customer_credit_sale',
           'record_customer_repayment',
           'override_credit_limit'
         )
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p ON p.name = 'create_customer_credit_sale'
       WHERE r.name = 'cashier'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
  }

  /** Import permissions for existing tenants. */
  private async ensureImportProductsPermission(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."permissions" (name)
       VALUES ('import_products'),
              ('import_opening_stock'),
              ('cleanup_import_products'),
              ('view_import_center')
       ON CONFLICT (name) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p ON p.name = 'view_import_center'
       WHERE r.name IN ('admin', 'manager')
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p ON p.name = 'import_products'
       WHERE r.name IN ('admin', 'manager')
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p ON p.name = 'import_opening_stock'
       WHERE r.name = 'admin'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p ON p.name = 'cleanup_import_products'
       WHERE r.name = 'admin'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
  }

  private async ensurePricingOfferPermissions(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."permissions" (name)
       VALUES ('manage_pricing'),
              ('manage_price_groups'),
              ('manage_offers')
       ON CONFLICT (name) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p
         ON p.name IN ('manage_pricing', 'manage_price_groups', 'manage_offers')
       WHERE r.name IN ('admin', 'manager')
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
  }

  /**
   * Consolidate per-UOM product costs onto the base UOM row only.
   * Non-base active price rows keep selling prices but drop stored cost fields.
   */
  private async ensureBaseUomCostConsolidation(schemaName: string): Promise<void> {
    if (!(await this.tenantTableExists(schemaName, 'product_uom_prices'))) {
      return;
    }
    await this.deduplicateActiveProductUomPrices(schemaName);

    const [needsMigration] = await this.prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
      `SELECT EXISTS (
         SELECT 1
         FROM "${schemaName}"."product_uom_prices" pup
         JOIN "${schemaName}"."product_uoms" pu
           ON pu.product_id = pup.product_id
          AND pu.uom_id = pup.uom_id
         WHERE pup.active IS TRUE
           AND pup.cost_price IS NOT NULL
           AND pu.is_base IS NOT TRUE
       ) AS ok`,
    );
    if (!needsMigration?.ok) return;

    const canonicalCte = `canonical AS (
         SELECT
           base_pu.product_id,
           base_pu.uom_id AS base_uom_id,
           COALESCE(
             base_price.cost_price,
             (
               SELECT MIN(nb.cost_price / NULLIF(nb_pu.conversion_factor_to_base, 0))
               FROM "${schemaName}"."product_uom_prices" nb
               JOIN "${schemaName}"."product_uoms" nb_pu
                 ON nb_pu.product_id = nb.product_id
                AND nb_pu.uom_id = nb.uom_id
               WHERE nb.product_id = base_pu.product_id
                 AND nb.active IS TRUE
                 AND nb.cost_price IS NOT NULL
                 AND nb_pu.is_active IS TRUE
                 AND nb_pu.is_base IS NOT TRUE
             )
           ) AS base_cost,
           base_price.selling_price,
           base_price.initial_cost_price,
           base_price.last_purchase_cost,
           base_price.last_purchase_at,
           base_price.last_purchase_id,
           base_price.last_purchase_item_id
         FROM "${schemaName}"."product_uoms" base_pu
         LEFT JOIN LATERAL (
           SELECT cost_price, selling_price, initial_cost_price,
                  last_purchase_cost, last_purchase_at,
                  last_purchase_id, last_purchase_item_id
           FROM "${schemaName}"."product_uom_prices" bpp
           WHERE bpp.product_id = base_pu.product_id
             AND bpp.uom_id = base_pu.uom_id
             AND bpp.active IS TRUE
           ORDER BY bpp.updated_at DESC NULLS LAST, bpp.created_at DESC
           LIMIT 1
         ) base_price ON TRUE
         WHERE base_pu.is_base IS TRUE
           AND base_pu.is_active IS TRUE
       )`;

    await this.prisma.$executeRawUnsafe(
      `WITH ${canonicalCte}
       UPDATE "${schemaName}"."product_uom_prices" target
       SET active = FALSE, updated_at = CURRENT_TIMESTAMP
       FROM canonical c
       WHERE target.product_id = c.product_id
         AND target.uom_id = c.base_uom_id
         AND target.active IS TRUE
         AND c.base_cost IS NOT NULL`,
    );

    await this.prisma.$executeRawUnsafe(
      `WITH ${canonicalCte}
       INSERT INTO "${schemaName}"."product_uom_prices" (
         product_id, uom_id, selling_price, cost_price,
         initial_cost_price, last_purchase_cost, last_purchase_at,
         last_purchase_id, last_purchase_item_id, active
       )
       SELECT product_id,
              base_uom_id,
              selling_price,
              base_cost,
              COALESCE(initial_cost_price, base_cost),
              last_purchase_cost,
              last_purchase_at,
              last_purchase_id,
              last_purchase_item_id,
              TRUE
       FROM canonical
       WHERE base_cost IS NOT NULL`,
    );

    await this.prisma.$executeRawUnsafe(
      `CREATE TEMP TABLE _non_base_price_fix ON COMMIT DROP AS
       SELECT pup.id,
              pup.product_id,
              pup.uom_id,
              pup.selling_price,
              pup.last_purchase_at,
              pup.last_purchase_id,
              pup.last_purchase_item_id
       FROM "${schemaName}"."product_uom_prices" pup
       JOIN "${schemaName}"."product_uoms" pu
         ON pu.product_id = pup.product_id
        AND pu.uom_id = pup.uom_id
       WHERE pup.active IS TRUE
         AND pu.is_base IS NOT TRUE
         AND (
           pup.cost_price IS NOT NULL
           OR pup.initial_cost_price IS NOT NULL
           OR pup.last_purchase_cost IS NOT NULL
         );

       UPDATE "${schemaName}"."product_uom_prices" target
       SET active = FALSE, updated_at = CURRENT_TIMESTAMP
       FROM _non_base_price_fix src
       WHERE target.id = src.id;

       INSERT INTO "${schemaName}"."product_uom_prices" (
         product_id, uom_id, selling_price, cost_price,
         initial_cost_price, last_purchase_cost, last_purchase_at,
         last_purchase_id, last_purchase_item_id, active
       )
       SELECT product_id,
              uom_id,
              selling_price,
              NULL,
              NULL,
              NULL,
              last_purchase_at,
              last_purchase_id,
              last_purchase_item_id,
              TRUE
       FROM _non_base_price_fix`,
    );

    await this.deduplicateActiveProductUomPrices(schemaName);
  }

  /** FIFO cost snapshots on sale lines for transaction register / COGS reporting. */
  private async ensureSaleItemsCostSnapshotColumns(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."sale_items"
       ADD COLUMN IF NOT EXISTS unit_cost_snapshot NUMERIC(14,4)`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."sale_items"
       ADD COLUMN IF NOT EXISTS line_cost_snapshot NUMERIC(14,4)`,
    );
  }

  /** Indexes supporting POS transaction register filters and sorts. */
  private async ensureTransactionRegisterIndexes(
    schemaName: string,
  ): Promise<void> {
    const esc = schemaName.replace(/"/g, '""');
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_branch_return_date
       ON "${esc}"."sale_returns"(branch_id, return_date DESC)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id
       ON "${esc}"."sale_returns"(sale_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_pos_sessions_staff_user_id
       ON "${esc}"."pos_sessions"(staff_user_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_pos_sessions_device_id
       ON "${esc}"."pos_sessions"(device_id)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_pos_statements_session_status
       ON "${esc}"."pos_statements"(session_id, status)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_journal_entries_source_lookup
       ON "${esc}"."journal_entries"(source_type, source_id)
       WHERE source_id IS NOT NULL`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_sales_receipt_number
       ON "${esc}"."sales"(receipt_number)
       WHERE receipt_number IS NOT NULL`,
    );
  }

  /** RBAC Phase 1: delete + accounting dangerous-action permissions. */
  private async ensureRbacPhase1Permissions(schemaName: string): Promise<void> {
    const phase1Permissions = [
      'delete_supplier',
      'delete_customer',
      'delete_purchase',
      'post_journal',
      'reverse_journal',
      'close_period',
      'reopen_period',
      'change_lock_date',
    ];
    for (const name of phase1Permissions) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."permissions" (name)
         VALUES ($1)
         ON CONFLICT (name) DO NOTHING`,
        name,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p
         ON p.name = ANY($1::text[])
       WHERE r.name = 'admin'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      phase1Permissions,
    );
  }

  /** RBAC Phase 2: granular CRUD permissions + default role grants. */
  private async ensureRbacPhase2Permissions(schemaName: string): Promise<void> {
    const phase2Permissions = [
      'view_products',
      'view_suppliers',
      'create_supplier',
      'edit_supplier',
      'view_customers',
      'create_customer',
      'edit_customer',
      'view_purchases',
      'create_purchase',
      'edit_purchase',
      'receive_purchase',
      'post_purchase_invoice',
      'view_sales',
      'create_sale',
      'refund_sale',
      'void_sale',
      'view_staff',
      'create_staff',
      'edit_staff',
      'delete_staff',
      'view_roles',
      'create_role',
      'edit_role',
      'delete_role',
      'assign_role',
      'adjust_inventory',
      'transfer_inventory',
      'approve_transfer',
      'edit_branch',
      'view_expenses',
      'create_expense',
      'edit_expense',
      'delete_expense',
    ];
    for (const name of phase2Permissions) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."permissions" (name)
         VALUES ($1)
         ON CONFLICT (name) DO NOTHING`,
        name,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       CROSS JOIN "${schemaName}"."permissions" p
       WHERE r.name = 'admin'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
    const managerPerms = [
      'view_products',
      'create_product',
      'edit_product',
      'view_suppliers',
      'create_supplier',
      'edit_supplier',
      'view_customers',
      'create_customer',
      'edit_customer',
      'view_purchases',
      'create_purchase',
      'edit_purchase',
      'receive_purchase',
      'post_purchase_invoice',
      'view_sales',
      'adjust_inventory',
      'transfer_inventory',
      'approve_transfer',
      'view_staff',
      'view_roles',
    ];
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p
         ON p.name = ANY($1::text[])
       WHERE r.name = 'manager'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      managerPerms,
    );
    const cashierPerms = [
      'view_products',
      'view_sales',
      'create_sale',
      'refund_sale',
      'view_customers',
    ];
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p
         ON p.name = ANY($1::text[])
       WHERE r.name = 'cashier'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      cashierPerms,
    );
    const pharmacistPerms = ['view_products', 'view_sales', 'create_sale'];
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p
         ON p.name = ANY($1::text[])
       WHERE r.name = 'pharmacist'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      pharmacistPerms,
    );
  }

  /** RBAC Phase 2: role metadata columns + system role flags. */
  private async ensureRolesV2Columns(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."roles"
       ADD COLUMN IF NOT EXISTS description TEXT`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."roles"
       ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true`,
    );
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."roles"
       ADD COLUMN IF NOT EXISTS is_system_role BOOLEAN DEFAULT false`,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}"."roles"
       SET is_system_role = true,
           active = COALESCE(active, true)
       WHERE name = ANY($1::text[])`,
      [
        'admin',
        'manager',
        'cashier',
        'pharmacist',
        'auditor',
        'accountant',
        'finance_manager',
      ],
    );
  }

  /** POS transaction register read permission. */
  private async ensureTransactionRegisterPermission(
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."permissions" (name)
       VALUES ('view_transaction_register')
       ON CONFLICT (name) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p
         ON p.name = 'view_transaction_register'
       WHERE r.name IN ('admin', 'manager')
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."role_permissions" (role_id, permission_id)
       SELECT r.id, p.id
       FROM "${schemaName}"."roles" r
       INNER JOIN "${schemaName}"."permissions" p
         ON p.name = 'view_transaction_register'
       WHERE r.name = 'auditor'
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
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
