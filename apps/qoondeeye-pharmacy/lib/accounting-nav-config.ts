export type AccountingNavItem = {
  href: string;
  label: string;
  description?: string;
};

export type AccountingNavSection = {
  title: string;
  items: AccountingNavItem[];
};

export const ACCOUNTING_NAV_SECTIONS: AccountingNavSection[] = [
  {
    title: "Overview",
    items: [
      {
        href: "/accounting",
        label: "Dashboard",
        description: "Accounting home, KPIs, and recent journal activity.",
      },
      {
        href: "/accounting/control-center",
        label: "Control Center",
        description:
          "Daily finance controls: alerts, close readiness, audit proof, and quick actions.",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        href: "/accounting/customer-payments",
        label: "Customer payments",
        description: "Record AR receipts and post cash/bank journals.",
      },
      {
        href: "/accounting/supplier-payments",
        label: "Supplier payments",
        description: "Record AP settlements to suppliers.",
      },
      {
        href: "/accounting/journal-lines",
        label: "Journal items",
        description: "Flat list of posted debits and credits.",
      },
      {
        href: "/accounting/journal-audit",
        label: "Journal audit",
        description: "Control totals and unbalanced entry detection.",
      },
      {
        href: "/accounting/audit-trail",
        label: "Audit trail",
        description: "Data change log for the branch.",
      },
    ],
  },
  {
    title: "Statement Reports",
    items: [
      {
        href: "/accounting/reports/balance-sheet",
        label: "Balance Sheet",
        description: "Assets, liabilities, and equity as of a date.",
      },
      {
        href: "/accounting/reports/profit-loss",
        label: "Profit and Loss",
        description: "Revenue and expenses for a period.",
      },
      {
        href: "/accounting/reports/cash-flow",
        label: "Cash Flow Statement",
        description: "Cash, bank, and card clearing movements from journals.",
      },
      {
        href: "/accounting/reports/consolidation-runs",
        label: "Consolidation runs",
        description:
          "Post, reverse, and review consolidation elimination runs.",
      },
      {
        href: "/accounting/reports/consolidation-disclosures",
        label: "Consolidation disclosures",
        description: "NCI, FX, adjustments, and intercompany elimination views.",
      },
    ],
  },
  {
    title: "Ledgers",
    items: [
      {
        href: "/accounting/reports/trial-balance",
        label: "Trial Balance",
        description: "Debits and credits by account as of a date.",
      },
      {
        href: "/accounting/journals",
        label: "General Ledger",
        description: "Posted journal entries for this branch.",
      },
    ],
  },
  {
    title: "Partner Reports",
    items: [
      {
        href: "/accounting/reports/partner-ledger",
        label: "Partner Ledger",
        description: "Per customer or supplier journal lines.",
      },
      {
        href: "/accounting/reports/aged-receivable",
        label: "Aged Receivable",
        description: "AR balances by customer from posted journals.",
      },
      {
        href: "/accounting/reports/aged-payable",
        label: "Aged Payable",
        description: "AP balances by supplier from posted journals.",
      },
    ],
  },
  {
    title: "Taxes & Fiscal",
    items: [
      {
        href: "/accounting/reports/tax",
        label: "Tax Report",
        description: "Expense accounts tagged as tax-related from journals.",
      },
      {
        href: "/accounting/reports/fiscal",
        label: "Fiscal Report",
        description: "High-level P&amp;L and balance sheet roll-up for a period.",
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        href: "/accounting/reports/invoice-analysis",
        label: "Invoice Analysis",
        description: "POS vs on-account revenue from journal source types.",
      },
      {
        href: "/accounting/reports/analytic",
        label: "Analytic Report",
        description: "Entry counts grouped by journal source type.",
      },
      {
        href: "/accounting/reports/executive-summary",
        label: "Executive Summary",
        description: "Revenue, profit, and outstanding AR/AP snapshot.",
      },
      {
        href: "/accounting/reports/depreciation-schedule",
        label: "Depreciation (GL)",
        description: "Fixed-asset and depreciation accounts from trial balance.",
      },
      {
        href: "/accounting/reports/loans-analysis",
        label: "Loans analysis",
        description: "Patient loan balances and outstanding totals.",
      },
    ],
  },
  {
    title: "Books",
    items: [
      {
        href: "/accounting/statements",
        label: "Statements (legacy)",
        description: "Combined P&L and balance sheet view.",
      },
      {
        href: "/accounting/chart-of-accounts",
        label: "Chart of accounts",
        description: "GL accounts for this branch.",
      },
      {
        href: "/accounting/inventory-valuation",
        label: "Inventory valuation",
        description: "Stock value at batch cost.",
      },
    ],
  },
  {
    title: "Configuration",
    items: [
      {
        href: "/accounting/configuration/journals",
        label: "Journals",
        description: "Journal books (sales, purchases, cash, misc).",
      },
      {
        href: "/accounting/configuration/payment-terms",
        label: "Payment terms",
        description: "Named terms with days until due.",
      },
      {
        href: "/accounting/configuration/follow-up-levels",
        label: "Follow-up levels",
        description: "Collections reminder tiers after due date.",
      },
    ],
  },
];

const FLAT: AccountingNavItem[] =
  ACCOUNTING_NAV_SECTIONS.flatMap((s) => s.items);

function titleFromSlug(slug: string): string {
  if (!slug) return "Accounting";
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function findAccountingNavItem(
  pathname: string,
): AccountingNavItem | undefined {
  const exact = FLAT.find((i) => i.href === pathname);
  if (exact) return exact;
  const nested = FLAT.find(
    (i) => i.href !== "/" && pathname.startsWith(i.href + "/"),
  );
  if (nested) return nested;

  if (pathname.startsWith("/accounting/review/")) {
    const slug = pathname.slice("/accounting/review/".length).split("/")[0];
    return {
      href: pathname,
      label: titleFromSlug(slug),
      description: "Review topic (PharmaCare scope).",
    };
  }

  if (pathname.startsWith("/accounting/configuration/")) {
    const rest = pathname.slice("/accounting/configuration/".length);
    if (!rest.includes("/")) {
      return {
        href: pathname,
        label: titleFromSlug(rest),
        description: "Accounting configuration.",
      };
    }
  }

  return undefined;
}
