import type { TrialBalanceLine } from "@/lib/services/accounting";

/** Seeded fixed-asset / depreciation-related GL keys (trial balance snapshot). */
const DEPRECIATION_SCHEDULE_KEYS = new Set([
  "accumulated_depreciation",
  "equipment",
  "furniture",
  "vehicles",
]);

export function isDepreciationTrialBalanceLine(line: TrialBalanceLine): boolean {
  const k = line.accountKey?.toLowerCase() ?? "";
  if (DEPRECIATION_SCHEDULE_KEYS.has(k)) return true;
  if (k.includes("deprec")) return true;
  const n = line.name?.toLowerCase() ?? "";
  return n.includes("deprec");
}

export function filterDepreciationTrialBalanceLines(
  lines: TrialBalanceLine[],
): TrialBalanceLine[] {
  return lines.filter(isDepreciationTrialBalanceLine);
}
