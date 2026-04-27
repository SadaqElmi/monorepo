import type { Prisma } from '@prisma/client';

export type InterbranchPairBreakdownRow = {
  fromBranchId: string;
  toBranchId: string;
  fromBranchName: string;
  toBranchName: string;
  dueFrom: number;
  dueTo: number;
  difference: number;
};

export type InterbranchTransferBreakdownRow = {
  transferId: string;
  fromBranchId: string;
  toBranchId: string;
  fromBranchName: string;
  toBranchName: string;
  dueFrom: number;
  dueTo: number;
  difference: number;
};

export type InterbranchMismatchReasonCode =
  | 'timing_in_transit'
  | 'journal_total_mismatch'
  | 'due_from_to_mismatch';

export type InterbranchFixSuggestionCode =
  | 'complete_receive'
  | 'repair_transfer_journal'
  | 'inspect_due_from_to_mapping';

export type InterbranchMismatchRow = {
  kind: 'in_transit' | 'posted_amount_mismatch' | 'transfer_gl_mismatch';
  /** Stable code for UI / support (maps 1:1 from `kind` today; extend for finer cases later). */
  reasonCode: InterbranchMismatchReasonCode;
  fixSuggestionCode: InterbranchFixSuggestionCode;
  transferId: string;
  fromBranchId: string;
  toBranchId: string;
  fromBranchName: string;
  toBranchName: string;
  status: string | null;
  shipJournalEntryId: string | null;
  receiveJournalEntryId: string | null;
  shipAmount: number | null;
  receiveAmount: number | null;
  difference: number | null;
  message: string;
};

export type ConsolidationPreviewLine = {
  accountKey: string;
  branchLabel: string;
  debit: number;
  credit: number;
  memo: string;
};

export type ConsolidationPreviewReport = {
  reportingMode: 'reporting-only';
  asOfDate: string;
  residual: number;
  proposedLines: ConsolidationPreviewLine[];
  interbranchBreakdown: InterbranchPairBreakdownRow[];
  transferBreakdown: InterbranchTransferBreakdownRow[];
  /** Human-readable operator hint (no journals posted). */
  suggestedAction?: string;
  suggestedSummary?: {
    headline: string;
    pairCount: number;
    transferMismatchCount: number;
  };
};

const EPS = 0.01;

/**
 * Inter-branch receivable on the shipping branch: canonical `due_from_branch`, or any
 * tenant-flagged inter-branch asset (see `chart_of_accounts.is_interbranch`).
 */
const SQL_COA_DUE_FROM_ON_SHIPPER = `(
  coa.account_key = 'due_from_branch'
  OR COALESCE(coa.interbranch_type, 'none') = 'receivable'
  OR (
    COALESCE(coa.is_interbranch, false) = true
    AND coa.account_type = 'asset'
    AND coa.account_key <> 'due_to_branch'
  )
)`;

/**
 * Inter-branch payable on the receiving branch: canonical `due_to_branch`, or flagged
 * inter-branch liability (excluding the receivable key).
 */
const SQL_COA_DUE_TO_ON_RECEIVER = `(
  coa.account_key = 'due_to_branch'
  OR COALESCE(coa.interbranch_type, 'none') = 'payable'
  OR (
    COALESCE(coa.is_interbranch, false) = true
    AND coa.account_type = 'liability'
    AND coa.account_key <> 'due_from_branch'
  )
)`;

export function deriveConsolidationKpiStatus(
  residualAbs: number,
  severity: 'clean' | 'warning' | 'critical',
): 'clean' | 'minor' | 'critical' {
  if (severity === 'critical' || residualAbs >= 1000) return 'critical';
  if (severity === 'warning' || residualAbs > EPS) return 'minor';
  return 'clean';
}

export async function loadBranchNameMap(
  tx: Prisma.TransactionClient,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const ph = ids.map((_, i) => `$${i + 1}::uuid`).join(', ');
  const rows = await tx.$queryRawUnsafe<{ id: string; name: string | null }[]>(
    `SELECT id::text AS id, name FROM branches WHERE id IN (${ph})`,
    ...ids,
  );
  for (const r of rows ?? []) {
    map.set(r.id, (r.name ?? '').trim() || r.id);
  }
  return map;
}

const PAIR_AGG_SQL = `
  SELECT
    st.from_branch_id::text AS from_branch_id,
    st.to_branch_id::text AS to_branch_id,
    COALESCE(SUM(
      CASE
        WHEN je.branch_id = st.from_branch_id
             AND ${SQL_COA_DUE_FROM_ON_SHIPPER.replace(/\n/g, ' ')}
             AND je.entry_date <= $2::date
        THEN jl.debit - jl.credit
        ELSE 0
      END
    ), 0)::numeric(14,4)::text AS due_from_bal,
    COALESCE(SUM(
      CASE
        WHEN je.branch_id = st.to_branch_id
             AND ${SQL_COA_DUE_TO_ON_RECEIVER.replace(/\n/g, ' ')}
             AND je.entry_date <= $2::date
        THEN jl.credit - jl.debit
        ELSE 0
      END
    ), 0)::numeric(14,4)::text AS due_to_bal
  FROM stock_transfers st
  INNER JOIN journal_entries je
    ON je.source_id = st.id
   AND je.source_type IN (
     'transfer_ship',
     'transfer_ship_reversal',
     'transfer_receive',
     'transfer_receive_reversal'
   )
  INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
  INNER JOIN chart_of_accounts coa
    ON coa.id = jl.account_id
   AND coa.branch_id = je.branch_id
  WHERE st.from_branch_id = ANY($1::uuid[])
    AND st.to_branch_id = ANY($1::uuid[])
  GROUP BY st.from_branch_id, st.to_branch_id
`;

/**
 * Directed branch-pair rollup of inter-branch GL from stock transfers (as-of).
 */
export async function queryInterbranchPairBreakdown(
  tx: Prisma.TransactionClient,
  branchIds: string[],
  asOfDate: string,
): Promise<InterbranchPairBreakdownRow[]> {
  if (branchIds.length < 2) return [];
  const rows = await tx.$queryRawUnsafe<
    {
      from_branch_id: string;
      to_branch_id: string;
      due_from_bal: string;
      due_to_bal: string;
    }[]
  >(
    `SELECT * FROM (
       ${PAIR_AGG_SQL}
     ) t
     WHERE ABS(CAST(t.due_from_bal AS numeric) - CAST(t.due_to_bal AS numeric)) > 0.01
        OR CAST(t.due_from_bal AS numeric) <> 0
        OR CAST(t.due_to_bal AS numeric) <> 0
     ORDER BY ABS(CAST(t.due_from_bal AS numeric) - CAST(t.due_to_bal AS numeric)) DESC`,
    branchIds,
    asOfDate,
  );

  const idSet = new Set<string>();
  for (const r of rows) {
    idSet.add(r.from_branch_id);
    idSet.add(r.to_branch_id);
  }
  const names = await loadBranchNameMap(tx, [...idSet]);

  return rows.map((r) => {
    const dueFrom = Number(r.due_from_bal);
    const dueTo = Number(r.due_to_bal);
    return {
      fromBranchId: r.from_branch_id,
      toBranchId: r.to_branch_id,
      fromBranchName: names.get(r.from_branch_id) ?? r.from_branch_id,
      toBranchName: names.get(r.to_branch_id) ?? r.to_branch_id,
      dueFrom,
      dueTo,
      difference: Math.round((dueFrom - dueTo + Number.EPSILON) * 100) / 100,
    };
  });
}

/**
 * Per-transfer inter-branch GL mismatch (as-of), limited rows.
 */
export async function queryInterbranchTransferBreakdown(
  tx: Prisma.TransactionClient,
  branchIds: string[],
  asOfDate: string,
  limit = 50,
): Promise<InterbranchTransferBreakdownRow[]> {
  if (branchIds.length < 2) return [];
  const rows = await tx.$queryRawUnsafe<
    {
      transfer_id: string;
      from_branch_id: string;
      to_branch_id: string;
      due_from_bal: string;
      due_to_bal: string;
    }[]
  >(
    `SELECT * FROM (
       SELECT
         st.id::text AS transfer_id,
         st.from_branch_id::text AS from_branch_id,
         st.to_branch_id::text AS to_branch_id,
         COALESCE(SUM(
           CASE
             WHEN je.branch_id = st.from_branch_id
                  AND ${SQL_COA_DUE_FROM_ON_SHIPPER.replace(/\n/g, ' ')}
                  AND je.entry_date <= $2::date
             THEN jl.debit - jl.credit
             ELSE 0
           END
         ), 0)::numeric(14,4)::text AS due_from_bal,
         COALESCE(SUM(
           CASE
             WHEN je.branch_id = st.to_branch_id
                  AND ${SQL_COA_DUE_TO_ON_RECEIVER.replace(/\n/g, ' ')}
                  AND je.entry_date <= $2::date
             THEN jl.credit - jl.debit
             ELSE 0
           END
         ), 0)::numeric(14,4)::text AS due_to_bal
       FROM stock_transfers st
       INNER JOIN journal_entries je
         ON je.source_id = st.id
        AND je.source_type IN (
          'transfer_ship',
          'transfer_ship_reversal',
          'transfer_receive',
          'transfer_receive_reversal'
        )
       INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
       INNER JOIN chart_of_accounts coa
         ON coa.id = jl.account_id
        AND coa.branch_id = je.branch_id
       WHERE st.from_branch_id = ANY($1::uuid[])
         AND st.to_branch_id = ANY($1::uuid[])
       GROUP BY st.id, st.from_branch_id, st.to_branch_id
     ) x
     WHERE ABS(CAST(x.due_from_bal AS numeric) - CAST(x.due_to_bal AS numeric)) > 0.01
     ORDER BY ABS(CAST(x.due_from_bal AS numeric) - CAST(x.due_to_bal AS numeric)) DESC
     LIMIT $3`,
    branchIds,
    asOfDate,
    limit,
  );

  const idSet = new Set<string>();
  for (const r of rows) {
    idSet.add(r.from_branch_id);
    idSet.add(r.to_branch_id);
  }
  const names = await loadBranchNameMap(tx, [...idSet]);

  return rows.map((r) => {
    const dueFrom = Number(r.due_from_bal);
    const dueTo = Number(r.due_to_bal);
    return {
      transferId: r.transfer_id,
      fromBranchId: r.from_branch_id,
      toBranchId: r.to_branch_id,
      fromBranchName: names.get(r.from_branch_id) ?? r.from_branch_id,
      toBranchName: names.get(r.to_branch_id) ?? r.to_branch_id,
      dueFrom,
      dueTo,
      difference: Math.round((dueFrom - dueTo + Number.EPSILON) * 100) / 100,
    };
  });
}

/**
 * Operational / GL issues for stock transfers (read-only; same branch scope as reports).
 */
export async function queryInterbranchMismatches(
  tx: Prisma.TransactionClient,
  branchIds: string[],
): Promise<InterbranchMismatchRow[]> {
  if (!branchIds.length) return [];

  const inTransit = await tx.$queryRawUnsafe<
    {
      id: string;
      from_branch_id: string;
      to_branch_id: string;
      status: string | null;
      shipped_journal_entry_id: string | null;
      receive_journal_entry_id: string | null;
    }[]
  >(
    `SELECT st.id::text AS id,
            st.from_branch_id::text AS from_branch_id,
            st.to_branch_id::text AS to_branch_id,
            st.status,
            st.shipped_journal_entry_id::text AS shipped_journal_entry_id,
            st.receive_journal_entry_id::text AS receive_journal_entry_id
     FROM stock_transfers st
     WHERE st.from_branch_id = ANY($1::uuid[])
       AND st.to_branch_id = ANY($1::uuid[])
       AND lower(COALESCE(st.status, '')) = 'shipped'
       AND COALESCE(st.is_reversed, false) = false
       AND st.receive_journal_entry_id IS NULL
       AND st.shipped_journal_entry_id IS NOT NULL`,
    branchIds,
  );

  const journalMismatch = await tx.$queryRawUnsafe<
    {
      id: string;
      from_branch_id: string;
      to_branch_id: string;
      status: string | null;
      shipped_journal_entry_id: string | null;
      receive_journal_entry_id: string | null;
      ship_debit: string;
      recv_credit: string;
    }[]
  >(
    `SELECT st.id::text AS id,
            st.from_branch_id::text AS from_branch_id,
            st.to_branch_id::text AS to_branch_id,
            st.status,
            st.shipped_journal_entry_id::text AS shipped_journal_entry_id,
            st.receive_journal_entry_id::text AS receive_journal_entry_id,
            (SELECT COALESCE(SUM(debit), 0)::numeric(14,4)
               FROM journal_lines WHERE journal_entry_id = st.shipped_journal_entry_id)::text AS ship_debit,
            (SELECT COALESCE(SUM(credit), 0)::numeric(14,4)
               FROM journal_lines WHERE journal_entry_id = st.receive_journal_entry_id)::text AS recv_credit
     FROM stock_transfers st
     WHERE st.from_branch_id = ANY($1::uuid[])
       AND st.to_branch_id = ANY($1::uuid[])
       AND st.receive_journal_entry_id IS NOT NULL
       AND st.shipped_journal_entry_id IS NOT NULL
       AND ABS(
         (SELECT COALESCE(SUM(debit), 0) FROM journal_lines WHERE journal_entry_id = st.shipped_journal_entry_id)
         - (SELECT COALESCE(SUM(credit), 0) FROM journal_lines WHERE journal_entry_id = st.receive_journal_entry_id)
       ) > 0.01`,
    branchIds,
  );

  const glMismatch = await tx.$queryRawUnsafe<
    {
      id: string;
      from_branch_id: string;
      to_branch_id: string;
      status: string | null;
      shipped_journal_entry_id: string | null;
      receive_journal_entry_id: string | null;
      due_from_bal: string;
      due_to_bal: string;
    }[]
  >(
    `SELECT * FROM (
       SELECT
         st.id::text AS id,
         st.from_branch_id::text AS from_branch_id,
         st.to_branch_id::text AS to_branch_id,
         st.status,
         st.shipped_journal_entry_id::text AS shipped_journal_entry_id,
         st.receive_journal_entry_id::text AS receive_journal_entry_id,
         COALESCE(SUM(
           CASE
             WHEN je.branch_id = st.from_branch_id
                  AND ${SQL_COA_DUE_FROM_ON_SHIPPER.replace(/\n/g, ' ')}
             THEN jl.debit - jl.credit
             ELSE 0
           END
         ), 0)::numeric(14,4)::text AS due_from_bal,
         COALESCE(SUM(
           CASE
             WHEN je.branch_id = st.to_branch_id
                  AND ${SQL_COA_DUE_TO_ON_RECEIVER.replace(/\n/g, ' ')}
             THEN jl.credit - jl.debit
             ELSE 0
           END
         ), 0)::numeric(14,4)::text AS due_to_bal
       FROM stock_transfers st
       INNER JOIN journal_entries je
         ON je.source_id = st.id
        AND je.source_type IN (
          'transfer_ship',
          'transfer_ship_reversal',
          'transfer_receive',
          'transfer_receive_reversal'
        )
       INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
       INNER JOIN chart_of_accounts coa
         ON coa.id = jl.account_id
        AND coa.branch_id = je.branch_id
       WHERE st.from_branch_id = ANY($1::uuid[])
         AND st.to_branch_id = ANY($1::uuid[])
         AND st.receive_journal_entry_id IS NOT NULL
       GROUP BY st.id, st.from_branch_id, st.to_branch_id, st.status,
                st.shipped_journal_entry_id, st.receive_journal_entry_id
     ) z
     WHERE ABS(CAST(z.due_from_bal AS numeric) - CAST(z.due_to_bal AS numeric)) > 0.01`,
    branchIds,
  );

  const idSet = new Set<string>();
  for (const r of [...inTransit, ...journalMismatch, ...glMismatch]) {
    idSet.add(r.from_branch_id);
    idSet.add(r.to_branch_id);
  }
  const names = await loadBranchNameMap(tx, [...idSet]);

  const out: InterbranchMismatchRow[] = [];
  for (const r of inTransit) {
    out.push({
      kind: 'in_transit',
      reasonCode: 'timing_in_transit',
      fixSuggestionCode: 'complete_receive',
      transferId: r.id,
      fromBranchId: r.from_branch_id,
      toBranchId: r.to_branch_id,
      fromBranchName: names.get(r.from_branch_id) ?? r.from_branch_id,
      toBranchName: names.get(r.to_branch_id) ?? r.to_branch_id,
      status: r.status,
      shipJournalEntryId: r.shipped_journal_entry_id,
      receiveJournalEntryId: r.receive_journal_entry_id,
      shipAmount: null,
      receiveAmount: null,
      difference: null,
      message:
        'Shipped but not received (in-transit); due_from / due_to may not offset yet.',
    });
  }
  for (const r of journalMismatch) {
    const sd = Number(r.ship_debit);
    const rc = Number(r.recv_credit);
    out.push({
      kind: 'posted_amount_mismatch',
      reasonCode: 'journal_total_mismatch',
      fixSuggestionCode: 'repair_transfer_journal',
      transferId: r.id,
      fromBranchId: r.from_branch_id,
      toBranchId: r.to_branch_id,
      fromBranchName: names.get(r.from_branch_id) ?? r.from_branch_id,
      toBranchName: names.get(r.to_branch_id) ?? r.to_branch_id,
      status: r.status,
      shipJournalEntryId: r.shipped_journal_entry_id,
      receiveJournalEntryId: r.receive_journal_entry_id,
      shipAmount: sd,
      receiveAmount: rc,
      difference: Math.round((sd - rc + Number.EPSILON) * 100) / 100,
      message:
        'Ship journal total debits do not match receive journal total credits (journal-level parity).',
    });
  }
  for (const r of glMismatch) {
    const df = Number(r.due_from_bal);
    const dt = Number(r.due_to_bal);
    out.push({
      kind: 'transfer_gl_mismatch',
      reasonCode: 'due_from_to_mismatch',
      fixSuggestionCode: 'inspect_due_from_to_mapping',
      transferId: r.id,
      fromBranchId: r.from_branch_id,
      toBranchId: r.to_branch_id,
      fromBranchName: names.get(r.from_branch_id) ?? r.from_branch_id,
      toBranchName: names.get(r.to_branch_id) ?? r.to_branch_id,
      status: r.status,
      shipJournalEntryId: r.shipped_journal_entry_id,
      receiveJournalEntryId: r.receive_journal_entry_id,
      shipAmount: df,
      receiveAmount: dt,
      difference: Math.round((df - dt + Number.EPSILON) * 100) / 100,
      message:
        'Due from branch vs due to branch amounts differ for this transfer (inter-branch GL mismatch).',
    });
  }

  const seen = new Set<string>();
  const dedup: InterbranchMismatchRow[] = [];
  for (const row of out) {
    const k = `${row.kind}:${row.transferId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(row);
  }
  return dedup;
}
