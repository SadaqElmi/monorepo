export function commitProcessedFromPending(
  totalRows: number,
  pendingCommitRows: number,
): number {
  const total = Math.max(0, totalRows);
  const pending = Math.max(0, pendingCommitRows);
  return Math.min(total, Math.max(0, total - pending));
}

export function clampImportProgress(
  processed: number,
  total: number,
): { processed: number; total: number } {
  const safeTotal = Math.max(0, total);
  const safeProcessed = Math.max(0, processed);
  return {
    total: safeTotal,
    processed:
      safeTotal > 0 ? Math.min(safeProcessed, safeTotal) : safeProcessed,
  };
}
