/** Human-stable transfer code for logs and UI */
export function formatTransferEntityCode(
  transferNumber: string | null | undefined,
): string | null {
  const n = transferNumber?.trim();
  if (!n) return null;
  if (/^TR-/i.test(n)) return n;
  return `TR-${n}`;
}

export function formatJournalEntityCode(
  sourceType: string | null | undefined,
  entryDate: string | null | undefined,
): string {
  const st = (sourceType ?? 'journal').trim() || 'journal';
  const ed = (entryDate ?? '').trim();
  return ed ? `${st}@${ed}` : st;
}

export function formatBranchPairEntityCode(
  fromName: string,
  toName: string,
): string {
  return `BranchPair:${fromName}->${toName}`;
}

export function formatBranchInventoryEntityCode(branchName: string): string {
  return `Branch:${branchName.trim() || 'unknown'}`;
}
