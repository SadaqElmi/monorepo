import type { BalanceSheetResult } from "@/lib/services/accounting";

export type BsLine = BalanceSheetResult["lines"][number];

const BANK_CASH_KEYS = new Set([
  "cash",
  "bank",
  "card_clearing",
  "wallet_clearing",
]);
const RECEIVABLE_KEYS = new Set([
  "accounts_receivable",
  "due_from_branch",
]);
const INVENTORY_KEYS = new Set(["inventory"]);
const PREPAID_KEYS = new Set(["prepaid_expenses"]);
const FIXED_KEYS = new Set(["equipment", "furniture", "vehicles"]);
const NON_CURRENT_ASSET_KEYS = new Set(["accumulated_depreciation"]);

const PAYABLE_KEYS = new Set([
  "accounts_payable",
  "due_to_branch",
]);
const OTHER_CURRENT_LIABILITY_KEYS = new Set([
  "short_term_loan",
  "accrued_expenses",
]);
const NON_CURRENT_LIABILITY_KEYS = new Set(["long_term_loan"]);

function isAssetType(accountType: string) {
  return accountType === "asset" || accountType.startsWith("asset_");
}

function isLiabilityType(accountType: string) {
  return accountType === "liability" || accountType.startsWith("liability_");
}

function isEquityType(accountType: string) {
  return accountType === "equity";
}

function sumLines(lines: BsLine[]) {
  return lines.reduce((s, l) => s + l.balance, 0);
}

function sortByCoaCode(lines: BsLine[]) {
  return [...lines].sort((a, b) => {
    const codeA = a.code?.trim() ?? "";
    const codeB = b.code?.trim() ?? "";
    if (codeA && codeB && codeA !== codeB) {
      return codeA.localeCompare(codeB, undefined, { numeric: true });
    }
    return a.name.localeCompare(b.name);
  });
}

export function formatBsLineLabel(line: BsLine): string {
  const code = line.code?.trim();
  return code ? `${code} ${line.name}` : line.name;
}

export function bsLineCoaPath(line: BsLine): string | undefined {
  return line.accountId
    ? `/accounting/chart-of-accounts/${line.accountId}`
    : undefined;
}

function pickAssetLines(lines: BsLine[]) {
  return lines.filter((l) => isAssetType(l.accountType));
}

function pickLiabilityLines(lines: BsLine[]) {
  return lines.filter((l) => isLiabilityType(l.accountType));
}

function pickEquityLines(lines: BsLine[]) {
  return lines.filter((l) => isEquityType(l.accountType));
}

function categorizeAssetLines(assets: BsLine[]) {
  const bankCash = sortByCoaCode(
    assets.filter((l) => BANK_CASH_KEYS.has(l.accountKey)),
  );
  const receivables = sortByCoaCode(
    assets.filter((l) => RECEIVABLE_KEYS.has(l.accountKey)),
  );
  const inventory = sortByCoaCode(
    assets.filter((l) => INVENTORY_KEYS.has(l.accountKey)),
  );
  const prepayments = sortByCoaCode(
    assets.filter((l) => PREPAID_KEYS.has(l.accountKey)),
  );
  const fixed = sortByCoaCode(assets.filter((l) => FIXED_KEYS.has(l.accountKey)));
  const nonCurrentAssets = sortByCoaCode(
    assets.filter((l) => NON_CURRENT_ASSET_KEYS.has(l.accountKey)),
  );
  const otherAssets = sortByCoaCode(
    assets.filter(
      (l) =>
        !BANK_CASH_KEYS.has(l.accountKey) &&
        !RECEIVABLE_KEYS.has(l.accountKey) &&
        !INVENTORY_KEYS.has(l.accountKey) &&
        !PREPAID_KEYS.has(l.accountKey) &&
        !FIXED_KEYS.has(l.accountKey) &&
        !NON_CURRENT_ASSET_KEYS.has(l.accountKey),
    ),
  );

  return {
    bankCash,
    receivables,
    inventory,
    prepayments,
    fixed,
    nonCurrentAssets,
    otherAssets,
  };
}

function categorizeLiabilityLines(liabs: BsLine[]) {
  const payables = sortByCoaCode(
    liabs.filter((l) => PAYABLE_KEYS.has(l.accountKey)),
  );
  const otherCurrentLiab = sortByCoaCode(
    liabs.filter((l) => OTHER_CURRENT_LIABILITY_KEYS.has(l.accountKey)),
  );
  const nonCurrentLiab = sortByCoaCode(
    liabs.filter((l) => NON_CURRENT_LIABILITY_KEYS.has(l.accountKey)),
  );
  const otherLiabs = sortByCoaCode(
    liabs.filter(
      (l) =>
        !PAYABLE_KEYS.has(l.accountKey) &&
        !OTHER_CURRENT_LIABILITY_KEYS.has(l.accountKey) &&
        !NON_CURRENT_LIABILITY_KEYS.has(l.accountKey),
    ),
  );

  return { payables, otherCurrentLiab, nonCurrentLiab, otherLiabs };
}

export function enrichBalanceSheetLines(
  balance: BalanceSheetResult,
  coaByKey: Map<string, { id: string; code: string | null }>,
): BalanceSheetResult {
  if (coaByKey.size === 0) return balance;
  return {
    ...balance,
    lines: balance.lines.map((line) => {
      const coa = coaByKey.get(line.accountKey);
      if (!coa) return line;
      return {
        ...line,
        accountId: line.accountId ?? coa.id,
        code: line.code ?? coa.code,
      };
    }),
  };
}

export function buildBalanceSheetTree(balance: BalanceSheetResult) {
  const assets = pickAssetLines(balance.lines);
  const categorized = categorizeAssetLines(assets);

  const totalBankCash = sumLines(categorized.bankCash);
  const totalReceivables = sumLines(categorized.receivables);
  const inventoryBal = sumLines(categorized.inventory);
  const prepayBal = sumLines(categorized.prepayments);
  const totalCurrentAssets =
    totalBankCash +
    totalReceivables +
    inventoryBal +
    prepayBal +
    sumLines(categorized.otherAssets);
  const fixedBal = sumLines(categorized.fixed);
  const nonCurrentBal = sumLines(categorized.nonCurrentAssets);
  const totalAssets = balance.totals.assets;

  const liabs = pickLiabilityLines(balance.lines);
  const liabBuckets = categorizeLiabilityLines(liabs);

  const totalPayables = sumLines(liabBuckets.payables);
  const totalOtherCurrentLiab = sumLines(liabBuckets.otherCurrentLiab);
  const totalCurrentLiabilities =
    totalPayables + totalOtherCurrentLiab + sumLines(liabBuckets.otherLiabs);
  const totalNonCurrentLiab = sumLines(liabBuckets.nonCurrentLiab);
  const totalLiabilities = balance.totals.liabilities;

  const equityLines = sortByCoaCode(pickEquityLines(balance.lines));
  const implicit = balance.totals.retainedEarningsImplicit;
  const equityExcludingImplicit = sumLines(equityLines);

  return {
    assets: {
      ...categorized,
      totalBankCash,
      totalReceivables,
      inventoryBal,
      prepayBal,
      totalCurrentAssets,
      fixedBal,
      nonCurrentBal,
      totalAssets,
    },
    liabilities: {
      ...liabBuckets,
      totalPayables,
      totalOtherCurrentLiab,
      totalCurrentLiabilities,
      totalNonCurrentLiab,
      totalLiabilities,
    },
    equity: {
      equityLines,
      equityExcludingImplicit,
      implicit,
      totalEquity: balance.totals.totalEquity,
    },
  };
}

export type BalanceSheetTree = ReturnType<typeof buildBalanceSheetTree>;

export type BalanceSheetAccountItem = {
  id: string;
  label: string;
  balance: number;
  level: 0 | 1 | 2 | 3;
  isTotal?: boolean;
  isSection?: boolean;
  isHighlight?: boolean;
  isAccount?: boolean;
  children?: BalanceSheetAccountItem[];
  drilldownPath?: string;
  coaPath?: string;
};

function lineToItem(ln: BsLine, level: 2 | 3): BalanceSheetAccountItem {
  return {
    id: `${ln.accountKey}-${ln.accountId ?? ln.name}`,
    label: formatBsLineLabel(ln),
    balance: ln.balance,
    level,
    isAccount: true,
    drilldownPath: ln.drilldownPath,
    coaPath: bsLineCoaPath(ln),
  };
}

function groupItem(
  id: string,
  label: string,
  balance: number,
  level: 1 | 2,
  children: BalanceSheetAccountItem[],
): BalanceSheetAccountItem {
  return { id, label, balance, level, children };
}

function leafOrGroup(
  id: string,
  label: string,
  lines: BsLine[],
  level: 2,
  totalBalance: number,
): BalanceSheetAccountItem {
  if (lines.length === 1) {
    return lineToItem(lines[0]!, level);
  }
  if (lines.length === 0) {
    return { id, label, balance: totalBalance, level };
  }
  return groupItem(id, label, totalBalance, level, lines.map((ln) => lineToItem(ln, 3)));
}

export function buildBalanceSheetAccountTree(
  tree: BalanceSheetTree,
): BalanceSheetAccountItem[] {
  const currentAssetsChildren: BalanceSheetAccountItem[] = [
    groupItem(
      "bank-cash",
      "Bank and Cash Accounts",
      tree.assets.totalBankCash,
      2,
      [
        ...tree.assets.bankCash.map((ln) => lineToItem(ln, 3)),
        {
          id: "total-bank-cash",
          label: "Total Bank and Cash Accounts",
          balance: tree.assets.totalBankCash,
          level: 3,
          isTotal: true,
        },
      ],
    ),
    groupItem(
      "receivables",
      "Receivables",
      tree.assets.totalReceivables,
      2,
      tree.assets.receivables.map((ln) => lineToItem(ln, 3)),
    ),
    leafOrGroup("inventory", "Inventory", tree.assets.inventory, 2, tree.assets.inventoryBal),
    leafOrGroup(
      "prepayments",
      "Prepayments",
      tree.assets.prepayments,
      2,
      tree.assets.prepayBal,
    ),
    ...tree.assets.otherAssets.map((ln) => lineToItem(ln, 2)),
    {
      id: "total-current-assets",
      label: "Total Current Assets",
      balance: tree.assets.totalCurrentAssets,
      level: 2,
      isTotal: true,
    },
  ];

  const currentLiabChildren: BalanceSheetAccountItem[] = [
    ...(tree.liabilities.payables.length > 0
      ? [
          groupItem("payables", "Payables", tree.liabilities.totalPayables, 2, [
            ...tree.liabilities.payables.map((ln) => lineToItem(ln, 3)),
          ]),
        ]
      : tree.liabilities.totalPayables !== 0
        ? [
            leafOrGroup(
              "payables",
              "Payables",
              [],
              2,
              tree.liabilities.totalPayables,
            ),
          ]
        : []),
    ...tree.liabilities.otherCurrentLiab.map((ln) => lineToItem(ln, 2)),
    ...tree.liabilities.otherLiabs.map((ln) => lineToItem(ln, 2)),
    {
      id: "total-current-liabilities",
      label: "Total Current Liabilities",
      balance: tree.liabilities.totalCurrentLiabilities,
      level: 2,
      isTotal: true,
    },
  ];

  const fixedAssetsChildren: BalanceSheetAccountItem[] =
    tree.assets.fixed.length > 0
      ? [
          groupItem("fixed-assets-group", "Fixed Assets", tree.assets.fixedBal, 1, [
            ...tree.assets.fixed.map((ln) => lineToItem(ln, 2)),
            {
              id: "total-fixed-assets",
              label: "Total Fixed Assets",
              balance: tree.assets.fixedBal,
              level: 2,
              isTotal: true,
            },
          ]),
        ]
      : [
          {
            id: "fixed-assets",
            label: "Plus Fixed Assets",
            balance: tree.assets.fixedBal,
            level: 1,
          },
        ];

  const nonCurrentAssetChildren: BalanceSheetAccountItem[] =
    tree.assets.nonCurrentAssets.length > 0
      ? [
          groupItem(
            "non-current-assets-group",
            "Non-current Assets",
            tree.assets.nonCurrentBal,
            1,
            tree.assets.nonCurrentAssets.map((ln) => lineToItem(ln, 2)),
          ),
        ]
      : [
          {
            id: "non-current-assets",
            label: "Plus Non-current Assets",
            balance: tree.assets.nonCurrentBal,
            level: 1,
          },
        ];

  const nonCurrentLiabChildren: BalanceSheetAccountItem[] =
    tree.liabilities.nonCurrentLiab.length > 0
      ? [
          groupItem(
            "non-current-liabilities-group",
            "Non-current Liabilities",
            tree.liabilities.totalNonCurrentLiab,
            1,
            tree.liabilities.nonCurrentLiab.map((ln) => lineToItem(ln, 2)),
          ),
        ]
      : [
          {
            id: "non-current-liabilities",
            label: "Plus Non-current Liabilities",
            balance: tree.liabilities.totalNonCurrentLiab,
            level: 1,
          },
        ];

  const equityChildren: BalanceSheetAccountItem[] = [
    ...(tree.equity.equityLines.length > 0
      ? [
          groupItem(
            "equity-accounts",
            "Equity Accounts",
            tree.equity.equityExcludingImplicit,
            1,
            tree.equity.equityLines.map((ln) => lineToItem(ln, 2)),
          ),
        ]
      : []),
    {
      id: "current-year-unallocated",
      label: "Current Year Unallocated Earnings",
      balance: tree.equity.implicit,
      level: 1,
      isHighlight: true,
      drilldownPath: "/accounting/reports/profit-loss",
    },
    {
      id: "total-equity",
      label: "TOTAL EQUITY",
      balance: tree.equity.totalEquity,
      level: 1,
      isTotal: true,
    },
  ];

  return [
    {
      id: "assets",
      label: "ASSETS",
      balance: 0,
      level: 0,
      isSection: true,
      children: [
        groupItem(
          "current-assets",
          "Current Assets",
          tree.assets.totalCurrentAssets,
          1,
          currentAssetsChildren,
        ),
        ...fixedAssetsChildren,
        ...nonCurrentAssetChildren,
        {
          id: "total-assets",
          label: "TOTAL ASSETS",
          balance: tree.assets.totalAssets,
          level: 1,
          isTotal: true,
        },
      ],
    },
    {
      id: "liabilities",
      label: "LIABILITIES",
      balance: 0,
      level: 0,
      isSection: true,
      children: [
        groupItem(
          "current-liabilities",
          "Current Liabilities",
          tree.liabilities.totalCurrentLiabilities,
          1,
          currentLiabChildren,
        ),
        ...nonCurrentLiabChildren,
        {
          id: "total-liabilities",
          label: "TOTAL LIABILITIES",
          balance: tree.liabilities.totalLiabilities,
          level: 1,
          isTotal: true,
        },
      ],
    },
    {
      id: "equity",
      label: "EQUITY",
      balance: 0,
      level: 0,
      isSection: true,
      children: equityChildren,
    },
  ];
}
