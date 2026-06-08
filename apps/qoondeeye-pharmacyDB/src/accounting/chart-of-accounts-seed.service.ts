import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccountKey } from './accounting.types';
import type { PaymentGlBucket } from './payment-method.util';

/** Every branch must have these keys for automated posting to resolve account IDs. */
export const POSTING_ACCOUNT_KEYS: readonly AccountKey[] = [
  'cash',
  'bank',
  'card_clearing',
  'wallet_clearing',
  'accounts_receivable',
  'due_from_branch',
  'inventory',
  'accounts_payable',
  'due_to_branch',
  'sales_revenue',
  'cogs',
  'operating_expense',
  'cash_shortage_expense',
  'cash_overage_income',
  'equity_retained',
  'opening_balance_equity',
] as const;

type CoaSeedRow = {
  account_key: string;
  code: string;
  name: string;
  account_type: string;
  payment_method_key: string | null;
  parent_key: string | null;
};

const RECONCILIABLE_ACCOUNT_KEYS = new Set([
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
  'due_to_branch',
]);

/**
 * Dynamics-style chart: additive seed per branch. Section rows use account_type `section`
 * (no postings; hierarchy / UI only).
 */
const COA_SEED_ROWS: CoaSeedRow[] = [
  // Sections (parent_id targets)
  {
    account_key: 'sec_assets',
    code: '1',
    name: 'Assets',
    account_type: 'section',
    payment_method_key: null,
    parent_key: null,
  },
  {
    account_key: 'sec_current_assets',
    code: '11',
    name: 'Current assets',
    account_type: 'section',
    payment_method_key: null,
    parent_key: 'sec_assets',
  },
  {
    account_key: 'sec_fixed_assets',
    code: '15',
    name: 'Fixed assets',
    account_type: 'section',
    payment_method_key: null,
    parent_key: 'sec_assets',
  },
  {
    account_key: 'sec_other_assets',
    code: '19',
    name: 'Other assets',
    account_type: 'section',
    payment_method_key: null,
    parent_key: 'sec_assets',
  },
  {
    account_key: 'sec_liabilities',
    code: '2',
    name: 'Liabilities',
    account_type: 'section',
    payment_method_key: null,
    parent_key: null,
  },
  {
    account_key: 'sec_current_liabilities',
    code: '21',
    name: 'Current liabilities',
    account_type: 'section',
    payment_method_key: null,
    parent_key: 'sec_liabilities',
  },
  {
    account_key: 'sec_long_term_liabilities',
    code: '25',
    name: 'Long-term liabilities',
    account_type: 'section',
    payment_method_key: null,
    parent_key: 'sec_liabilities',
  },
  {
    account_key: 'sec_equity',
    code: '3',
    name: 'Equity',
    account_type: 'section',
    payment_method_key: null,
    parent_key: null,
  },
  {
    account_key: 'sec_income',
    code: '4',
    name: 'Income',
    account_type: 'section',
    payment_method_key: null,
    parent_key: null,
  },
  {
    account_key: 'sec_expenses',
    code: '5',
    name: 'Expenses',
    account_type: 'section',
    payment_method_key: null,
    parent_key: null,
  },
  {
    account_key: 'sec_cogs',
    code: '50',
    name: 'Cost of goods sold',
    account_type: 'section',
    payment_method_key: null,
    parent_key: 'sec_expenses',
  },
  {
    account_key: 'sec_operating_exp',
    code: '51',
    name: 'Operating expenses',
    account_type: 'section',
    payment_method_key: null,
    parent_key: 'sec_expenses',
  },
  {
    account_key: 'sec_financial_exp',
    code: '56',
    name: 'Financial expenses',
    account_type: 'section',
    payment_method_key: null,
    parent_key: 'sec_expenses',
  },

  // Assets
  {
    account_key: 'cash',
    code: '1000',
    name: 'Cash on hand',
    account_type: 'asset',
    payment_method_key: 'cash',
    parent_key: 'sec_current_assets',
  },
  {
    account_key: 'bank',
    code: '1010',
    name: 'Bank account',
    account_type: 'asset',
    payment_method_key: null,
    parent_key: 'sec_current_assets',
  },
  {
    account_key: 'card_clearing',
    code: '1020',
    name: 'Card clearing',
    account_type: 'asset',
    payment_method_key: 'card',
    parent_key: 'sec_current_assets',
  },
  {
    account_key: 'wallet_clearing',
    code: '1025',
    name: 'Mobile wallet clearing',
    account_type: 'asset',
    payment_method_key: null,
    parent_key: 'sec_current_assets',
  },
  {
    account_key: 'accounts_receivable',
    code: '1100',
    name: 'Accounts receivable',
    account_type: 'asset',
    payment_method_key: null,
    parent_key: 'sec_current_assets',
  },
  {
    account_key: 'due_from_branch',
    code: '1110',
    name: 'Due from branch',
    account_type: 'asset',
    payment_method_key: null,
    parent_key: 'sec_current_assets',
  },
  {
    account_key: 'inventory',
    code: '1200',
    name: 'Inventory',
    account_type: 'asset',
    payment_method_key: null,
    parent_key: 'sec_current_assets',
  },
  {
    account_key: 'prepaid_expenses',
    code: '1300',
    name: 'Prepaid expenses',
    account_type: 'asset',
    payment_method_key: null,
    parent_key: 'sec_current_assets',
  },
  {
    account_key: 'equipment',
    code: '1500',
    name: 'Equipment',
    account_type: 'asset',
    payment_method_key: null,
    parent_key: 'sec_fixed_assets',
  },
  {
    account_key: 'furniture',
    code: '1600',
    name: 'Furniture',
    account_type: 'asset',
    payment_method_key: null,
    parent_key: 'sec_fixed_assets',
  },
  {
    account_key: 'vehicles',
    code: '1700',
    name: 'Vehicles',
    account_type: 'asset',
    payment_method_key: null,
    parent_key: 'sec_fixed_assets',
  },
  {
    account_key: 'accumulated_depreciation',
    code: '1900',
    name: 'Accumulated depreciation',
    account_type: 'asset',
    payment_method_key: null,
    parent_key: 'sec_other_assets',
  },

  // Liabilities
  {
    account_key: 'accounts_payable',
    code: '2000',
    name: 'Accounts payable',
    account_type: 'liability',
    payment_method_key: null,
    parent_key: 'sec_current_liabilities',
  },
  {
    account_key: 'due_to_branch',
    code: '2010',
    name: 'Due to branch',
    account_type: 'liability',
    payment_method_key: null,
    parent_key: 'sec_current_liabilities',
  },
  {
    account_key: 'short_term_loan',
    code: '2100',
    name: 'Short-term loan',
    account_type: 'liability',
    payment_method_key: null,
    parent_key: 'sec_current_liabilities',
  },
  {
    account_key: 'accrued_expenses',
    code: '2200',
    name: 'Accrued expenses',
    account_type: 'liability',
    payment_method_key: null,
    parent_key: 'sec_current_liabilities',
  },
  {
    account_key: 'long_term_loan',
    code: '2500',
    name: 'Long-term loan',
    account_type: 'liability',
    payment_method_key: null,
    parent_key: 'sec_long_term_liabilities',
  },

  // Equity
  {
    account_key: 'owner_capital',
    code: '3000',
    name: 'Owner capital',
    account_type: 'equity',
    payment_method_key: null,
    parent_key: 'sec_equity',
  },
  {
    account_key: 'equity_retained',
    code: '3100',
    name: 'Retained earnings',
    account_type: 'equity',
    payment_method_key: null,
    parent_key: 'sec_equity',
  },
  {
    account_key: 'current_year_profit',
    code: '3200',
    name: 'Current year profit',
    account_type: 'equity',
    payment_method_key: null,
    parent_key: 'sec_equity',
  },
  {
    account_key: 'opening_balance_equity',
    code: '3900',
    name: 'Opening balance equity',
    account_type: 'equity',
    payment_method_key: null,
    parent_key: 'sec_equity',
  },

  // Income
  {
    account_key: 'sales_revenue',
    code: '4000',
    name: 'Sales revenue',
    account_type: 'income',
    payment_method_key: null,
    parent_key: 'sec_income',
  },
  {
    account_key: 'service_revenue',
    code: '4100',
    name: 'Service revenue',
    account_type: 'income',
    payment_method_key: null,
    parent_key: 'sec_income',
  },
  {
    account_key: 'other_income',
    code: '4200',
    name: 'Other income',
    account_type: 'income',
    payment_method_key: null,
    parent_key: 'sec_income',
  },
  {
    account_key: 'cash_overage_income',
    code: '4250',
    name: 'Cash overage',
    account_type: 'income',
    payment_method_key: null,
    parent_key: 'sec_income',
  },

  // COGS & expenses
  {
    account_key: 'cogs',
    code: '5000',
    name: 'Cost of goods sold',
    account_type: 'expense',
    payment_method_key: null,
    parent_key: 'sec_cogs',
  },
  {
    account_key: 'rent_expense',
    code: '5100',
    name: 'Rent expense',
    account_type: 'expense',
    payment_method_key: null,
    parent_key: 'sec_operating_exp',
  },
  {
    account_key: 'salary_expense',
    code: '5200',
    name: 'Salary expense',
    account_type: 'expense',
    payment_method_key: null,
    parent_key: 'sec_operating_exp',
  },
  {
    account_key: 'utilities_expense',
    code: '5300',
    name: 'Utilities expense',
    account_type: 'expense',
    payment_method_key: null,
    parent_key: 'sec_operating_exp',
  },
  {
    account_key: 'internet_expense',
    code: '5400',
    name: 'Internet expense',
    account_type: 'expense',
    payment_method_key: null,
    parent_key: 'sec_operating_exp',
  },
  {
    account_key: 'transportation_expense',
    code: '5500',
    name: 'Transportation expense',
    account_type: 'expense',
    payment_method_key: null,
    parent_key: 'sec_operating_exp',
  },
  {
    account_key: 'purchase_expense',
    code: '5550',
    name: 'Purchase expense',
    account_type: 'expense',
    payment_method_key: null,
    parent_key: 'sec_operating_exp',
  },
  {
    account_key: 'operating_expense',
    code: '5990',
    name: 'General operating expenses',
    account_type: 'expense',
    payment_method_key: null,
    parent_key: 'sec_operating_exp',
  },
  {
    account_key: 'cash_shortage_expense',
    code: '5995',
    name: 'Cash shortage',
    account_type: 'expense',
    payment_method_key: null,
    parent_key: 'sec_operating_exp',
  },
  {
    account_key: 'bank_fees',
    code: '5600',
    name: 'Bank fees',
    account_type: 'expense',
    payment_method_key: null,
    parent_key: 'sec_financial_exp',
  },
  {
    account_key: 'interest_expense',
    code: '5700',
    name: 'Interest expense',
    account_type: 'expense',
    payment_method_key: null,
    parent_key: 'sec_financial_exp',
  },
];

@Injectable()
export class ChartOfAccountsSeedService {
  /**
   * Idempotent seed of GL accounts for a branch. Returns account id by posting key.
   */
  async ensureAccountsForBranch(
    tx: Prisma.TransactionClient,
    branchId: string,
  ): Promise<Record<AccountKey, string>> {
    const seedJson = JSON.stringify(
      COA_SEED_ROWS.map((r) => ({
        code: r.code,
        name: r.name,
        account_type: r.account_type,
        account_key: r.account_key,
        payment_method_key: r.payment_method_key,
        allow_reconciliation: RECONCILIABLE_ACCOUNT_KEYS.has(r.account_key),
      })),
    );

    await tx.$queryRawUnsafe(
      `INSERT INTO chart_of_accounts (
         branch_id, code, name, account_type, account_key, is_system, payment_method_key, allow_reconciliation, is_interbranch, interbranch_type
       )
       SELECT $1::uuid,
              x.code,
              x.name,
              x.account_type,
              x.account_key,
              true,
              NULLIF(TRIM(x.payment_method_key), '')::varchar,
              x.allow_reconciliation,
              (x.account_key IN ('due_from_branch', 'due_to_branch')),
              CASE
                WHEN x.account_key = 'due_from_branch' THEN 'receivable'
                WHEN x.account_key = 'due_to_branch' THEN 'payable'
                ELSE 'none'
              END::varchar
       FROM jsonb_to_recordset($2::jsonb) AS x(
         code text,
         name text,
         account_type text,
         account_key text,
         payment_method_key text,
         allow_reconciliation boolean
       )
       ON CONFLICT (branch_id, account_key) DO NOTHING`,
      branchId,
      seedJson,
    );

    const parentJson = JSON.stringify(
      COA_SEED_ROWS.filter((r) => r.parent_key).map((r) => ({
        account_key: r.account_key,
        parent_key: r.parent_key as string,
      })),
    );
    if (parentJson !== '[]') {
      await tx.$queryRawUnsafe(
        `UPDATE chart_of_accounts AS c
         SET parent_id = p.id
         FROM chart_of_accounts AS p,
              jsonb_to_recordset($2::jsonb) AS m(account_key text, parent_key text)
         WHERE c.branch_id = $1::uuid
           AND p.branch_id = $1::uuid
           AND c.account_key = m.account_key
           AND p.account_key = m.parent_key`,
        branchId,
        parentJson,
      );
    }

    const rows = await tx.$queryRawUnsafe<
      { id: string; account_key: string }[]
    >(
      `SELECT id, account_key
       FROM chart_of_accounts
       WHERE branch_id = $1::uuid`,
      branchId,
    );

    const byKey = new Map(rows.map((r) => [r.account_key, r.id]));
    const out = {} as Record<AccountKey, string>;
    for (const key of POSTING_ACCOUNT_KEYS) {
      const id = byKey.get(key);
      if (!id) {
        throw new Error(`Missing chart account ${key} for branch ${branchId}`);
      }
      out[key] = id;
    }
    return out;
  }

  resolvePaymentAccount(
    accounts: Record<AccountKey, string>,
    key: 'cash' | 'card' | PaymentGlBucket,
  ): string {
    if (key === 'card') return accounts.card_clearing;
    if (key === 'bank') return accounts.bank;
    if (key === 'wallet') return accounts.wallet_clearing;
    return accounts.cash;
  }
}
