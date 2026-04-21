import type { BalanceSheetResult } from "@/lib/services/accounting";

export type BsLine = BalanceSheetResult["lines"][number];

const BANK_CASH_KEYS = new Set([
  "cash",
  "bank",
  "card_clearing",
]);
const RECEIVABLE_KEYS = new Set(["accounts_receivable"]);
const INVENTORY_KEYS = new Set(["inventory"]);
const PREPAID_KEYS = new Set(["prepaid_expenses"]);
const FIXED_KEYS = new Set(["equipment", "furniture", "vehicles"]);
const NON_CURRENT_ASSET_KEYS = new Set(["accumulated_depreciation"]);

const PAYABLE_KEYS = new Set(["accounts_payable"]);
const OTHER_CURRENT_LIABILITY_KEYS = new Set([
  "short_term_loan",
  "accrued_expenses",
]);
const NON_CURRENT_LIABILITY_KEYS = new Set(["long_term_loan"]);

function sumLines(lines: BsLine[]) {
  return lines.reduce((s, l) => s + l.balance, 0);
}

function pickAssetLines(lines: BsLine[]) {
  return lines.filter((l) => l.accountType === "asset");
}

function pickLiabilityLines(lines: BsLine[]) {
  return lines.filter((l) => l.accountType === "liability");
}

function pickEquityLines(lines: BsLine[]) {
  return lines.filter((l) => l.accountType === "equity");
}

export function buildBalanceSheetTree(balance: BalanceSheetResult) {
  const assets = pickAssetLines(balance.lines);
  const bankCash = assets.filter((l) => BANK_CASH_KEYS.has(l.accountKey));
  const receivables = assets.filter((l) => RECEIVABLE_KEYS.has(l.accountKey));
  const inventory = assets.filter((l) => INVENTORY_KEYS.has(l.accountKey));
  const prepayments = assets.filter((l) => PREPAID_KEYS.has(l.accountKey));
  const fixed = assets.filter((l) => FIXED_KEYS.has(l.accountKey));
  const nonCurrentAssets = assets.filter((l) =>
    NON_CURRENT_ASSET_KEYS.has(l.accountKey),
  );
  const otherAssets = assets.filter(
    (l) =>
      !BANK_CASH_KEYS.has(l.accountKey) &&
      !RECEIVABLE_KEYS.has(l.accountKey) &&
      !INVENTORY_KEYS.has(l.accountKey) &&
      !PREPAID_KEYS.has(l.accountKey) &&
      !FIXED_KEYS.has(l.accountKey) &&
      !NON_CURRENT_ASSET_KEYS.has(l.accountKey),
  );

  const totalBankCash = sumLines(bankCash);
  const totalReceivables = sumLines(receivables);
  const inventoryBal = sumLines(inventory);
  const prepayBal = sumLines(prepayments);
  const totalCurrentAssets =
    totalBankCash + totalReceivables + inventoryBal + prepayBal + sumLines(otherAssets);
  const fixedBal = sumLines(fixed);
  const nonCurrentBal = sumLines(nonCurrentAssets);
  const totalAssets =
    balance.totals.assets;

  const liabs = pickLiabilityLines(balance.lines);
  const payables = liabs.filter((l) => PAYABLE_KEYS.has(l.accountKey));
  const otherCurrentLiab = liabs.filter((l) =>
    OTHER_CURRENT_LIABILITY_KEYS.has(l.accountKey),
  );
  const nonCurrentLiab = liabs.filter((l) =>
    NON_CURRENT_LIABILITY_KEYS.has(l.accountKey),
  );
  const otherLiabs = liabs.filter(
    (l) =>
      !PAYABLE_KEYS.has(l.accountKey) &&
      !OTHER_CURRENT_LIABILITY_KEYS.has(l.accountKey) &&
      !NON_CURRENT_LIABILITY_KEYS.has(l.accountKey),
  );

  const totalPayables = sumLines(payables);
  const totalOtherCurrentLiab = sumLines(otherCurrentLiab);
  const totalCurrentLiabilities =
    totalPayables + totalOtherCurrentLiab + sumLines(otherLiabs);
  const totalNonCurrentLiab = sumLines(nonCurrentLiab);
  const totalLiabilities = balance.totals.liabilities;

  const equityLines = pickEquityLines(balance.lines);
  const implicit = balance.totals.retainedEarningsImplicit;
  const equityExcludingImplicit = sumLines(equityLines);

  return {
    assets: {
      bankCash,
      totalBankCash,
      receivables,
      totalReceivables,
      inventory,
      inventoryBal,
      prepayments,
      prepayBal,
      otherAssets,
      fixed,
      fixedBal,
      nonCurrentAssets,
      nonCurrentBal,
      totalCurrentAssets,
      totalAssets,
    },
    liabilities: {
      payables,
      totalPayables,
      otherCurrentLiab,
      totalOtherCurrentLiab,
      otherLiabs,
      nonCurrentLiab,
      totalNonCurrentLiab,
      totalCurrentLiabilities,
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
