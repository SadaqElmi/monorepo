ALTER TABLE IF EXISTS "tenant_template"."chart_of_accounts"
  ADD COLUMN IF NOT EXISTS "allow_reconciliation" BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF to_regclass('tenant_template.chart_of_accounts') IS NOT NULL THEN
    UPDATE "tenant_template"."chart_of_accounts"
    SET "allow_reconciliation" = TRUE
    WHERE "account_key" IN (
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
    );
  END IF;
END $$;
