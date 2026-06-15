-- ERP extensions for dedicated tenant databases.
-- Synthesized from legacy TenantService runtime DDL (schema-per-tenant era).
-- Do not edit by hand; regenerate with: pnpm tenant:synthesize:erp-migration

CREATE TABLE IF NOT EXISTS "cash_accounts" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        type VARCHAR(50),
        balance NUMERIC(12,2) DEFAULT 0
      );

CREATE TABLE IF NOT EXISTS "cash_transactions" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID REFERENCES "branches"(id),
        account_id UUID REFERENCES "cash_accounts"(id),
        type VARCHAR(10),
        amount NUMERIC(12,2),
        reference VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "chart_of_accounts" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id) ON DELETE CASCADE,
        code VARCHAR(32),
        name VARCHAR(255) NOT NULL,
        account_type VARCHAR(20) NOT NULL,
        account_key VARCHAR(50) NOT NULL,
        is_system BOOLEAN DEFAULT TRUE,
        allow_reconciliation BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        description TEXT,
        payment_method_key VARCHAR(50),
        parent_id UUID REFERENCES "chart_of_accounts"(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, account_key)
      );

CREATE TABLE IF NOT EXISTS "journal_entries" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id),
        entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
        description TEXT,
        source_type VARCHAR(32) NOT NULL,
        source_id UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "accounting_journal_books" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id) ON DELETE CASCADE,
        code VARCHAR(32) NOT NULL,
        name VARCHAR(255) NOT NULL,
        book_kind VARCHAR(32) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, code)
      );

CREATE TABLE IF NOT EXISTS "journal_lines" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        journal_entry_id UUID NOT NULL REFERENCES "journal_entries"(id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES "chart_of_accounts"(id),
        debit NUMERIC(14,2) DEFAULT 0 NOT NULL,
        credit NUMERIC(14,2) DEFAULT 0 NOT NULL,
        CONSTRAINT journal_lines_one_side_positive CHECK (
          (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
        )
      );

CREATE TABLE IF NOT EXISTS "audit_logs" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID REFERENCES "branches"(id),
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
      );

CREATE TABLE IF NOT EXISTS "audit_log_archive" (
        id UUID NOT NULL,
        archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        row_data JSONB NOT NULL,
        PRIMARY KEY (id, archived_at)
      );

CREATE TABLE IF NOT EXISTS "accounting_period_workflow" (
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
      );

CREATE TABLE IF NOT EXISTS "entities" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        parent_entity_id UUID REFERENCES "entities"(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "entity_branches" (
        entity_id UUID NOT NULL REFERENCES "entities"(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES "branches"(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (entity_id, branch_id)
      );

CREATE TABLE IF NOT EXISTS "entity_ownership" (
        parent_entity_id UUID NOT NULL REFERENCES "entities"(id) ON DELETE CASCADE,
        child_entity_id UUID NOT NULL REFERENCES "entities"(id) ON DELETE CASCADE,
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
      );

CREATE TABLE IF NOT EXISTS "consolidation_runs" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        period_key VARCHAR(32) NOT NULL,
        as_of_date DATE NOT NULL,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        scope_hash VARCHAR(64) NOT NULL,
        scope_branch_ids JSONB NOT NULL,
        entity_id UUID REFERENCES "entities"(id) ON DELETE SET NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'posted',
        created_by UUID,
        reversed_by UUID,
        posted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reversed_at TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "consolidation_journal_links" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES "consolidation_runs"(id) ON DELETE CASCADE,
        journal_entry_id UUID NOT NULL REFERENCES "journal_entries"(id) ON DELETE CASCADE,
        elimination_type VARCHAR(24) NOT NULL,
        account_key VARCHAR(64),
        direction VARCHAR(8),
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        source_refs JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "consolidation_run_events" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES "consolidation_runs"(id) ON DELETE CASCADE,
        event_type VARCHAR(32) NOT NULL,
        actor_user_id UUID,
        payload JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "fx_rates" (
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
      );

CREATE TABLE IF NOT EXISTS "consolidation_adjustments" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        period_key VARCHAR(32) NOT NULL,
        scope_hash VARCHAR(64) NOT NULL,
        entity_id UUID REFERENCES "entities"(id) ON DELETE SET NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'draft',
        title VARCHAR(255) NOT NULL,
        justification TEXT,
        lines JSONB NOT NULL,
        approved_by UUID,
        approved_at TIMESTAMP,
        applied_run_id UUID REFERENCES "consolidation_runs"(id) ON DELETE SET NULL,
        created_by UUID,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "branch_account_balance_snapshot" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES "chart_of_accounts"(id) ON DELETE CASCADE,
        period_start DATE NOT NULL,
        balance NUMERIC(18,4) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, account_id, period_start)
      );

CREATE TABLE IF NOT EXISTS "tenant_settings" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_type VARCHAR(32) NOT NULL DEFAULT 'pharmacy',
        import_policies JSONB NOT NULL DEFAULT '{}'::jsonb,
        invoice_before_receive BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "payment_terms" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        days_until_due INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "follow_up_levels" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        days_after_due INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "product_category_gl_map" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id) ON DELETE CASCADE,
        category_id UUID NOT NULL,
        income_account_key VARCHAR(50),
        expense_account_key VARCHAR(50),
        stock_account_key VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, category_id)
      );

CREATE TABLE IF NOT EXISTS "online_payment_providers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id) ON DELETE CASCADE,
        provider_key VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, provider_key)
      );

CREATE TABLE IF NOT EXISTS "payment_methods_catalog" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id) ON DELETE CASCADE,
        method_key VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, method_key)
      );

CREATE TABLE IF NOT EXISTS "customer_payments" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id),
        customer_id UUID NOT NULL REFERENCES "customers"(id),
        amount NUMERIC(14,2) NOT NULL,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        reference VARCHAR(255),
        notes TEXT,
        payment_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "customer_payment_allocations" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_payment_id UUID NOT NULL REFERENCES "customer_payments"(id) ON DELETE CASCADE,
        sale_id UUID NOT NULL REFERENCES "sales"(id) ON DELETE CASCADE,
        amount NUMERIC(14,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "supplier_payments" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id),
        supplier_id UUID NOT NULL REFERENCES "suppliers"(id),
        amount NUMERIC(14,2) NOT NULL,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        reference VARCHAR(255),
        notes TEXT,
        payment_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "purchase_refunds" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id),
        purchase_id UUID NOT NULL REFERENCES "purchases"(id) ON DELETE CASCADE,
        amount NUMERIC(14,2) NOT NULL,
        refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
        on_credit BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "report_snapshots" (
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
      );

CREATE TABLE IF NOT EXISTS "report_export_jobs" (
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
      );

CREATE TABLE IF NOT EXISTS "stock_transfers" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_number VARCHAR(40),
        from_branch_id UUID NOT NULL REFERENCES "branches"(id),
        to_branch_id UUID NOT NULL REFERENCES "branches"(id),
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        approval_state VARCHAR(20) NOT NULL DEFAULT 'none',
        lock_version INTEGER NOT NULL DEFAULT 0,
        expected_date DATE,
        expected_stock_snapshot JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        confirmed_at TIMESTAMP,
        approved_by UUID REFERENCES "users"(id),
        approved_at TIMESTAMP,
        ship_accounting_state VARCHAR(20) NOT NULL DEFAULT 'pending',
        receive_accounting_state VARCHAR(20) NOT NULL DEFAULT 'pending',
        last_accounting_error TEXT,
        shipped_at TIMESTAMP,
        received_at TIMESTAMP,
        shipped_journal_entry_id UUID REFERENCES "journal_entries"(id),
        receive_journal_entry_id UUID REFERENCES "journal_entries"(id),
        ship_reversal_journal_entry_id UUID REFERENCES "journal_entries"(id),
        receive_reversal_journal_entry_id UUID REFERENCES "journal_entries"(id),
        is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
        reversed_by UUID REFERENCES "users"(id),
        reversed_at TIMESTAMP,
        reversal_reason TEXT,
        processing_lock_owner UUID REFERENCES "users"(id),
        processing_lock_until TIMESTAMP,
        processing_stage VARCHAR(50),
        created_by_name VARCHAR(200),
        reject_reason TEXT
      );

CREATE TABLE IF NOT EXISTS "stock_transfer_items" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_id UUID NOT NULL REFERENCES "stock_transfers"(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES "products"(id),
        uom_id UUID,
        quantity INTEGER NOT NULL,
        conversion_factor_snapshot NUMERIC(18,6) NOT NULL DEFAULT 1,
        base_quantity INTEGER NOT NULL DEFAULT 0,
        received_quantity INTEGER,
        unit_cost_snapshot NUMERIC(14,4),
        line_cost_snapshot NUMERIC(14,2),
        CONSTRAINT stock_transfer_items_qty_positive CHECK (quantity > 0)
      );

CREATE TABLE IF NOT EXISTS "stock_transfer_events" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_id UUID NOT NULL REFERENCES "stock_transfers"(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        actor_user_id UUID REFERENCES "users"(id),
        branch_id UUID REFERENCES "branches"(id),
        message TEXT,
        metadata JSONB,
        payload JSONB,
        aggregate_version INTEGER NOT NULL DEFAULT 1,
        schema_version INTEGER NOT NULL DEFAULT 1,
        correlation_id TEXT,
        causation_id TEXT,
        idempotency_key TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "transfer_error_log" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_id UUID REFERENCES "stock_transfers"(id) ON DELETE SET NULL,
        stage VARCHAR(50) NOT NULL,
        error_message TEXT NOT NULL,
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "import_jobs" (
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
        created_by UUID REFERENCES "users"(id),
        confirmed_by UUID REFERENCES "users"(id),
        confirmed_at TIMESTAMP,
        committed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS "import_job_rows" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES "import_jobs"(id) ON DELETE CASCADE,
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
      );

CREATE TABLE IF NOT EXISTS "opening_stock_entries" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id UUID NOT NULL REFERENCES "branches"(id),
        product_id UUID NOT NULL REFERENCES "products"(id),
        batch_id UUID REFERENCES "batches"(id),
        import_job_id UUID REFERENCES "import_jobs"(id),
        import_job_row_id UUID REFERENCES "import_job_rows"(id),
        quantity INTEGER NOT NULL,
        cost_price NUMERIC(10,2),
        entry_date DATE NOT NULL,
        external_ref TEXT,
        journal_entry_id UUID REFERENCES "journal_entries"(id),
        created_by UUID REFERENCES "users"(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

ALTER TABLE "cash_transactions"
                    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES "branches"(id);

ALTER TABLE "chart_of_accounts" ADD COLUMN IF NOT EXISTS is_interbranch BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "chart_of_accounts" ADD COLUMN IF NOT EXISTS interbranch_type VARCHAR(24) NOT NULL DEFAULT 'none';

ALTER TABLE "chart_of_accounts" ADD COLUMN IF NOT EXISTS allow_reconciliation BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "chart_of_accounts"
        ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES "chart_of_accounts"(id);

ALTER TABLE "journal_entries"
        ADD COLUMN IF NOT EXISTS journal_book_id UUID;

ALTER TABLE "journal_lines"
          ADD COLUMN IF NOT EXISTS partner_kind VARCHAR(20);

ALTER TABLE "journal_lines"
          ADD COLUMN IF NOT EXISTS partner_id UUID;

ALTER TABLE "entities"
       ADD COLUMN IF NOT EXISTS reporting_currency VARCHAR(8) NOT NULL DEFAULT 'USD';

ALTER TABLE "entity_ownership"
       ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE "entity_ownership"
       ADD COLUMN IF NOT EXISTS effective_to DATE;

ALTER TABLE "entity_ownership"
       DROP CONSTRAINT IF EXISTS entity_ownership_100_only;

ALTER TABLE "consolidation_runs"
       ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES "entities"(id) ON DELETE SET NULL;

ALTER TABLE "consolidation_runs"
       ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP(6);

ALTER TABLE "consolidation_runs"
       ADD COLUMN IF NOT EXISTS finalized_by UUID;

ALTER TABLE "tenant_settings"
          ADD COLUMN IF NOT EXISTS invoice_before_receive BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "tenant_settings"
          ADD COLUMN IF NOT EXISTS pos_policies JSONB NOT NULL DEFAULT '{"allow_cashier_credit_sale":true,"allow_credit_limit_override":false}'::jsonb;

ALTER TABLE "report_snapshots" ADD COLUMN IF NOT EXISTS snapshot_diff JSONB;

ALTER TABLE "report_export_jobs" ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "report_export_jobs" ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3;

DO $$
       BEGIN
         ALTER TABLE "stock_transfers"
           ADD CONSTRAINT stock_transfers_from_to_different
           CHECK (from_branch_id <> to_branch_id) NOT VALID;
       EXCEPTION
         WHEN duplicate_object THEN NULL;
       END $$;

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES "users"(id);

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS shipped_journal_entry_id UUID REFERENCES "journal_entries"(id);

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS receive_journal_entry_id UUID REFERENCES "journal_entries"(id);

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS lock_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS expected_stock_snapshot JSONB;

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS ship_accounting_state VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS receive_accounting_state VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS last_accounting_error TEXT;

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS ship_reversal_journal_entry_id UUID REFERENCES "journal_entries"(id);

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS receive_reversal_journal_entry_id UUID REFERENCES "journal_entries"(id);

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES "users"(id);

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP;

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS processing_lock_owner UUID REFERENCES "users"(id);

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS processing_lock_until TIMESTAMP;

ALTER TABLE "stock_transfers"
          ADD COLUMN IF NOT EXISTS processing_stage VARCHAR(50);

ALTER TABLE "stock_transfer_items"
          ADD COLUMN IF NOT EXISTS uom_id UUID;

ALTER TABLE "stock_transfer_items"
          ADD COLUMN IF NOT EXISTS conversion_factor_snapshot NUMERIC(18,6) NOT NULL DEFAULT 1;

ALTER TABLE "stock_transfer_items"
          ADD COLUMN IF NOT EXISTS base_quantity INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "stock_transfer_items"
          ADD COLUMN IF NOT EXISTS unit_cost_snapshot NUMERIC(14,4);

ALTER TABLE "stock_transfer_items"
          ADD COLUMN IF NOT EXISTS line_cost_snapshot NUMERIC(14,2);

ALTER TABLE "stock_transfer_events"
          ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES "users"(id);

ALTER TABLE "stock_transfer_events"
          ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES "branches"(id);

ALTER TABLE "stock_transfer_events"
          ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE "stock_transfer_events"
          ADD COLUMN IF NOT EXISTS aggregate_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "stock_transfer_events"
          ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "stock_transfer_events"
          ADD COLUMN IF NOT EXISTS correlation_id TEXT;

ALTER TABLE "stock_transfer_events"
          ADD COLUMN IF NOT EXISTS causation_id TEXT;

ALTER TABLE "stock_transfer_events"
          ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

DO $$
       BEGIN
         CREATE TABLE IF NOT EXISTS "api_idempotency" (
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
       END $$;

ALTER TABLE "api_idempotency"
          ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours');

DO $$
       BEGIN
         CREATE TABLE IF NOT EXISTS "ops_metric_counters" (
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
       END $$;

ALTER TABLE "import_jobs"
       ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP;

ALTER TABLE "import_jobs"
       ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES "users"(id);

ALTER TABLE "opening_stock_entries"
       ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP;

ALTER TABLE "opening_stock_entries"
       ADD COLUMN IF NOT EXISTS reversal_journal_entry_id UUID REFERENCES "journal_entries"(id);

ALTER TABLE "product_categories"
          ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES "branches"(id)
          ON DELETE SET NULL;

ALTER TABLE "products"
          ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES "branches"(id)
          ON DELETE SET NULL;

ALTER TABLE "batches"
                    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES "branches"(id);

ALTER TABLE "purchase_items"
                    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES "branches"(id);

ALTER TABLE "sale_items"
                    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES "branches"(id);

ALTER TABLE "sales"
                    ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(20);

ALTER TABLE "sale_returns"
          ADD COLUMN IF NOT EXISTS refund_method VARCHAR(50);

ALTER TABLE "sale_returns"
          ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12,2);

ALTER TABLE "purchases"
        ADD COLUMN IF NOT EXISTS on_credit BOOLEAN DEFAULT FALSE;

ALTER TABLE "expense_categories"
        ADD COLUMN IF NOT EXISTS gl_account_key VARCHAR(50);

ALTER TABLE "sales"
          ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES "customers"(id);

ALTER TABLE "sales"
          ADD COLUMN IF NOT EXISTS on_account BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "sales"
          ADD COLUMN IF NOT EXISTS credit_override_manager_id UUID REFERENCES "users"(id);

ALTER TABLE "sales"
          ADD COLUMN IF NOT EXISTS credit_override_reason TEXT;

ALTER TABLE "sales"
          ADD COLUMN IF NOT EXISTS credit_override_at TIMESTAMP;

ALTER TABLE "sales"
          ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE "branches"
        ADD COLUMN IF NOT EXISTS accounting_lock_date DATE;

ALTER TABLE "branches"
         ADD COLUMN IF NOT EXISTS code VARCHAR(32);

ALTER TABLE "purchases"
          ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'closed';

ALTER TABLE "purchases"
          ADD COLUMN IF NOT EXISTS purchase_order_no VARCHAR(100);

ALTER TABLE "purchases"
          ADD COLUMN IF NOT EXISTS supplier_invoice_no VARCHAR(100);

ALTER TABLE "purchases"
          ADD COLUMN IF NOT EXISTS order_date DATE;

ALTER TABLE "purchases"
          ADD COLUMN IF NOT EXISTS posting_date DATE;

ALTER TABLE "purchases"
          ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE "purchases"
          ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE "purchases"
          ADD COLUMN IF NOT EXISTS released_at TIMESTAMP;

ALTER TABLE "purchases"
          ADD COLUMN IF NOT EXISTS received_at TIMESTAMP;

ALTER TABLE "purchases"
          ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMP;

ALTER TABLE "customers"
          ADD COLUMN IF NOT EXISTS customer_no VARCHAR(32);

ALTER TABLE "customers"
          ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12, 2);

ALTER TABLE "customers"
          ADD COLUMN IF NOT EXISTS credit_status VARCHAR(20) NOT NULL DEFAULT 'active';

ALTER TABLE "customers"
          ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "customers"
          ADD COLUMN IF NOT EXISTS member_card_no VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS chart_of_accounts_branch_payment_key_uq ON "chart_of_accounts"(branch_id, payment_method_key) WHERE payment_method_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_source_uq ON "journal_entries"(branch_id, source_type, source_id) WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS journal_entries_branch_date_idx ON "journal_entries"(branch_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_date_source
       ON "journal_entries"(branch_id, entry_date, source_type);

CREATE INDEX IF NOT EXISTS journal_entries_branch_entry_created_idx
         ON "journal_entries"(branch_id, entry_date, created_at, id);

CREATE INDEX IF NOT EXISTS idx_journal_books_branch ON "accounting_journal_books"(branch_id);

CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON "journal_lines"(journal_entry_id);

CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON "journal_lines"(account_id);

CREATE INDEX IF NOT EXISTS journal_lines_partner_account_entry_idx
         ON "journal_lines"(partner_kind, partner_id, account_id, journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_ts
       ON "audit_logs"(event_ts DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_hash
       ON "audit_logs"(audit_hash);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON "audit_logs"(table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_archive_archived_at
       ON "audit_log_archive"(archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_period_workflow_state
       ON "accounting_period_workflow"(state, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_entities_parent
       ON "entities"(parent_entity_id);

CREATE INDEX IF NOT EXISTS idx_entity_branches_branch
       ON "entity_branches"(branch_id);

CREATE INDEX IF NOT EXISTS idx_entity_ownership_parent
       ON "entity_ownership"(parent_entity_id);

CREATE INDEX IF NOT EXISTS idx_entity_ownership_child
       ON "entity_ownership"(child_entity_id);

CREATE INDEX IF NOT EXISTS idx_entity_ownership_effective
       ON "entity_ownership"(parent_entity_id, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_consolidation_runs_period_created
       ON "consolidation_runs"(period_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consolidation_runs_scope_created
       ON "consolidation_runs"(scope_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consolidation_runs_entity_period
       ON "consolidation_runs"(entity_id, period_key, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consolidation_runs_posted_final_scope_period
       ON "consolidation_runs"(period_key, scope_hash)
       WHERE reversed_at IS NULL AND status IN ('posted','finalized');

CREATE UNIQUE INDEX IF NOT EXISTS uq_consolidation_runs_draft_scope_period
       ON "consolidation_runs"(period_key, scope_hash)
       WHERE reversed_at IS NULL AND status = 'draft';

CREATE INDEX IF NOT EXISTS idx_consolidation_links_run_created
       ON "consolidation_journal_links"(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consolidation_links_journal
       ON "consolidation_journal_links"(journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_consolidation_events_run_created
       ON "consolidation_run_events"(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup
       ON "fx_rates"(as_of_date DESC, from_currency, to_currency, rate_type);

CREATE INDEX IF NOT EXISTS idx_consolidation_adjustments_scope
       ON "consolidation_adjustments"(period_key, scope_hash, status);

CREATE INDEX IF NOT EXISTS idx_consolidation_adjustments_entity
       ON "consolidation_adjustments"(entity_id, status);

CREATE INDEX IF NOT EXISTS idx_branch_acct_snap_branch_period
       ON "branch_account_balance_snapshot"(branch_id, period_start);

CREATE INDEX IF NOT EXISTS idx_payment_terms_branch ON "payment_terms"(branch_id);

CREATE INDEX IF NOT EXISTS idx_customer_payments_branch ON "customer_payments"(branch_id);

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON "customer_payments"(customer_id);

CREATE INDEX IF NOT EXISTS idx_cpa_payment ON "customer_payment_allocations"(customer_payment_id);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_branch ON "supplier_payments"(branch_id);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON "supplier_payments"(supplier_id);

CREATE INDEX IF NOT EXISTS idx_purchase_refunds_purchase ON "purchase_refunds"(purchase_id);

CREATE INDEX IF NOT EXISTS idx_report_snapshots_lookup
       ON "report_snapshots"(report_type, scope_hash, period_key, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_report_export_jobs_status_created
       ON "report_export_jobs"(status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_from ON "stock_transfers"(from_branch_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_to ON "stock_transfers"(to_branch_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON "stock_transfers"(status);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_to_status ON "stock_transfers"(from_branch_id, to_branch_id, status);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_status ON "stock_transfers"(to_branch_id, status);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_shipped_at ON "stock_transfers"(from_branch_id, shipped_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_received_at ON "stock_transfers"(to_branch_id, received_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_reversal_timeline ON "stock_transfers"(is_reversed, received_at, from_branch_id, to_branch_id, reversed_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON "stock_transfer_items"(transfer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer_product_unique
       ON "stock_transfer_items"(transfer_id, product_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_uom
       ON "stock_transfer_items"(uom_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_events_transfer ON "stock_transfer_events"(transfer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfer_events_transfer_version ON "stock_transfer_events"(transfer_id, aggregate_version);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfer_events_idempotency ON "stock_transfer_events"(transfer_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transfer_error_log_transfer ON "transfer_error_log"(transfer_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_idempotency_key ON "api_idempotency"(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_expires_at ON "api_idempotency"(expires_at);

CREATE INDEX IF NOT EXISTS idx_import_jobs_type_status
       ON "import_jobs"(import_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_job_rows_job
       ON "import_job_rows"(job_id, row_number);

CREATE INDEX IF NOT EXISTS idx_import_job_rows_commit
       ON "import_job_rows"(job_id, commit_status);

CREATE UNIQUE INDEX IF NOT EXISTS opening_stock_import_row_unique
       ON "opening_stock_entries"(import_job_row_id)
       WHERE import_job_row_id IS NOT NULL;

INSERT INTO "entities" (name, code)
       VALUES ('Group Root', 'ROOT')
       ON CONFLICT (code) DO NOTHING;

INSERT INTO "entity_branches"(entity_id, branch_id)
       SELECT e.id, b.id
       FROM "entities" e
       CROSS JOIN "branches" b
       WHERE e.code = 'ROOT'
       ON CONFLICT (entity_id, branch_id) DO NOTHING;

INSERT INTO "tenant_settings" (business_type)
       SELECT 'pharmacy'
      WHERE NOT EXISTS (SELECT 1 FROM "tenant_settings");
