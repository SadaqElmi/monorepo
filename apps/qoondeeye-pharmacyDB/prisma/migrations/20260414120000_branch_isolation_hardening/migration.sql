-- Branch isolation hardening for tenant template schema.
-- 1) Enforce branch assignment for restricted roles.
-- 2) Add branch-centric indexes used by branch-scoped CRUD/reporting queries.

CREATE OR REPLACE FUNCTION tenant_template.enforce_user_branch_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  role_name text;
BEGIN
  role_name := NULL;

  IF NEW.role_id IS NOT NULL THEN
    SELECT lower(r.name)
    INTO role_name
    FROM tenant_template.roles r
    WHERE r.id = NEW.role_id;
  END IF;

  IF role_name IN ('cashier', 'staff', 'manager') AND NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id is required for role %', role_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_user_branch_assignment ON tenant_template.users;
CREATE TRIGGER trg_enforce_user_branch_assignment
BEFORE INSERT OR UPDATE ON tenant_template.users
FOR EACH ROW
EXECUTE FUNCTION tenant_template.enforce_user_branch_assignment();

CREATE INDEX IF NOT EXISTS idx_users_branch_id
  ON tenant_template.users (branch_id);

CREATE INDEX IF NOT EXISTS idx_sales_branch_sale_date
  ON tenant_template.sales (branch_id, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_purchases_branch_purchase_date
  ON tenant_template.purchases (branch_id, purchase_date DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_entry_date
  ON tenant_template.journal_entries (branch_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id
  ON tenant_template.journal_lines (journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_inventory_branch_product
  ON tenant_template.inventory (branch_id, product_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_created_at
  ON tenant_template.audit_logs (branch_id, created_at DESC);
