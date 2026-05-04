/**
 * Top navigation mega-menus for the accounting hub (Odoo-style), mapped to app routes.
 */

export type HubMenuLink = { label: string; href: string };

export type HubMenuSection = { heading: string; items: HubMenuLink[] };

export type HubMenu = {
  id: string;
  label: string;
  sections: HubMenuSection[];
};

export const ACCOUNTING_HUB_MENUS: HubMenu[] = [
  {
    id: "vendors",
    label: "Vendors",
    sections: [
      {
        heading: "Purchases",
        items: [
          { label: "Bills", href: "/vendors/bills" },
          { label: "Refunds", href: "/vendors/bills" },
          { label: "Payments", href: "/accounting/supplier-payments" },
          { label: "Employee Expenses", href: "/vendors/expenses" },
          { label: "Products", href: "/inventory/products" },
          { label: "Vendors", href: "/vendors/suppliers" },
        ],
      },
    ],
  },
  {
    id: "accounting",
    label: "Accounting",
    sections: [
      {
        heading: "Transactions",
        items: [
          { label: "Journal Entries", href: "/accounting/journals" },
          { label: "POS statement", href: "/accounting/pos-statement" },
        ],
      },
      {
        heading: "Assets and liabilities",
        items: [
          { label: "Chart of accounts", href: "/accounting/chart-of-accounts" },
        ],
      },
      {
        heading: "Closing",
        items: [
          { label: "Reconcile", href: "/accounting/reports/trial-balance" },
          { label: "Tax returns", href: "/accounting/reports/tax" },
          { label: "Lock dates", href: "/inventory/branches" },
        ],
      },
      {
        heading: "Monitoring",
        items: [
          { label: "Control Center", href: "/accounting/control-center" },
          { label: "Transfer Monitoring", href: "/accounting/monitoring" },
        ],
      },
    ],
  },
  {
    id: "review",
    label: "Review",
    sections: [
      {
        heading: "Control",
        items: [
          { label: "Journal items", href: "/accounting/journal-lines" },
          { label: "Journal audit", href: "/accounting/journal-audit" },
        ],
      },
      {
        heading: "Audit",
        items: [
          { label: "Working Files", href: "/accounting/statements" },
          { label: "Annual report", href: "/accounting/reports/fiscal" },
        ],
      },
      {
        heading: "Inventory",
        items: [
          {
            label: "Inventory valuation",
            href: "/accounting/inventory-valuation",
          },
          {
            label: "Depreciation schedule",
            href: "/accounting/reports/depreciation-schedule",
          },
          {
            label: "Loans analysis",
            href: "/accounting/reports/loans-analysis",
          },
        ],
      },
      {
        heading: "Regularization Entries",
        items: [
          {
            label: "Deferred revenues",
            href: "/accounting/review/deferred-revenues",
          },
          {
            label: "Deferred expenses",
            href: "/accounting/review/deferred-expenses",
          },
        ],
      },
      {
        heading: "Purchases",
        items: [
          {
            label: "Bill to receive",
            href: "/accounting/review/bills-to-receive",
          },
          {
            label: "Billed not received",
            href: "/accounting/review/billed-not-received",
          },
        ],
      },
      {
        heading: "Sales",
        items: [
          {
            label: "Invoices to be issued",
            href: "/accounting/review/invoices-to-issue",
          },
          {
            label: "Invoiced not delivered",
            href: "/accounting/review/invoiced-not-delivered",
          },
        ],
      },
      {
        heading: "Logs",
        items: [
          {
            label: "Audit trail",
            href: "/accounting/audit-trail",
          },
        ],
      },
    ],
  },
  {
    id: "reporting",
    label: "Reporting",
    sections: [
      {
        heading: "Statement reports",
        items: [
          { label: "Balance sheet", href: "/accounting/reports/balance-sheet" },
          { label: "Profit and loss", href: "/accounting/reports/profit-loss" },
          {
            label: "Consolidated reports",
            href: "/accounting/reports/consolidated",
          },
          {
            label: "Inter-branch mismatches",
            href: "/accounting/reports/interbranch-mismatches",
          },
          {
            label: "Consolidation runs",
            href: "/accounting/reports/consolidation-runs",
          },
          {
            label: "Consolidation disclosures",
            href: "/accounting/reports/consolidation-disclosures",
          },
          { label: "Cash flow", href: "/accounting/reports/cash-flow" },
        ],
      },
      {
        heading: "Ledgers",
        items: [
          { label: "Trial balance", href: "/accounting/reports/trial-balance" },
          { label: "General ledger", href: "/accounting/journals" },
        ],
      },
      {
        heading: "Partners",
        items: [
          {
            label: "Partner ledger",
            href: "/accounting/reports/partner-ledger",
          },
          {
            label: "Aged receivable",
            href: "/accounting/reports/aged-receivable",
          },
          { label: "Aged payable", href: "/accounting/reports/aged-payable" },
        ],
      },
      {
        heading: "Taxes & Fiscal",
        items: [
          {
            label: "Tax report",
            href: "/accounting/reports/tax",
          },
          {
            label: "Fiscal report",
            href: "/accounting/reports/fiscal",
          },
        ],
      },
      {
        heading: "Management",
        items: [
          {
            label: "Invoice analysis",
            href: "/accounting/reports/invoice-analysis",
          },
          { label: "Analytic report", href: "/accounting/reports/analytic" },
          {
            label: "Executive summary",
            href: "/accounting/reports/executive-summary",
          },
        ],
      },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    sections: [
      {
        heading: "Accounting",
        items: [
          { label: "Chart of accounts", href: "/accounting/chart-of-accounts" },
          { label: "Journals", href: "/accounting/configuration/journals" },
          { label: "Currencies", href: "/accounting/configuration/currencies" },
          {
            label: "Fiscal positions",
            href: "/accounting/configuration/fiscal-positions",
          },
          {
            label: "Multi-ledger",
            href: "/accounting/configuration/multi-ledger",
          },
          { label: "Checks", href: "/accounting/configuration/checks" },
          {
            label: "Asset models",
            href: "/accounting/configuration/asset-models",
          },
        ],
      },
      {
        heading: "Invoicing",
        items: [
          {
            label: "Payment terms",
            href: "/accounting/configuration/payment-terms",
          },
          {
            label: "Follow-up levels",
            href: "/accounting/configuration/follow-up-levels",
          },
          { label: "Product categories", href: "/inventory/categories" },
        ],
      },
      {
        heading: "Online Payments",
        items: [
          {
            label: "Payment providers",
            href: "/accounting/configuration/payment-providers",
          },
          {
            label: "Payment methods",
            href: "/accounting/configuration/payment-methods",
          },
        ],
      },
    ],
  },
];
