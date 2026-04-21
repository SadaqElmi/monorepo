import type { Prisma } from '@prisma/client';

import {
  deriveConsolidationKpiStatus,
  queryInterbranchMismatches,
} from './interbranch-report.util';

const BRANCH_A = '11111111-1111-1111-1111-111111111111';
const BRANCH_B = '22222222-2222-2222-2222-222222222222';

function mockTxForInterbranchMismatches(opts: {
  inTransitRows: Array<{
    id: string;
    from_branch_id: string;
    to_branch_id: string;
    status: string | null;
    shipped_journal_entry_id: string | null;
    receive_journal_entry_id: string | null;
  }>;
}): Prisma.TransactionClient {
  let rawCall = 0;
  return {
    $queryRawUnsafe: jest.fn(
      async (template: string, ...args: unknown[]) => {
        if (template.includes('FROM branches WHERE id IN')) {
          const ids = args as string[];
          return ids.map((id) => ({
            id,
            name: id === BRANCH_A ? 'Branch A' : id === BRANCH_B ? 'Branch B' : id,
          }));
        }
        rawCall += 1;
        if (rawCall === 1) {
          expect(template).toContain(
            'COALESCE(st.is_reversed, false) = false',
          );
          return opts.inTransitRows;
        }
        if (rawCall === 2) {
          return [];
        }
        if (rawCall === 3) {
          return [];
        }
        throw new Error(
          `Unexpected $queryRawUnsafe call #${rawCall}: ${template.slice(0, 80)}…`,
        );
      },
    ),
  } as unknown as Prisma.TransactionClient;
}

describe('queryInterbranchMismatches', () => {
  it('excludes reversed transfers from in-transit SQL (no false timing_in_transit)', async () => {
    const tx = mockTxForInterbranchMismatches({ inTransitRows: [] });
    const rows = await queryInterbranchMismatches(tx, [BRANCH_A, BRANCH_B]);
    expect(rows.filter((r) => r.reasonCode === 'timing_in_transit')).toHaveLength(
      0,
    );
  });

  it('still surfaces timing_in_transit when DB returns a non-reversed shipped row', async () => {
    const tx = mockTxForInterbranchMismatches({
      inTransitRows: [
        {
          id: '33333333-3333-3333-3333-333333333333',
          from_branch_id: BRANCH_A,
          to_branch_id: BRANCH_B,
          status: 'shipped',
          shipped_journal_entry_id:
            '44444444-4444-4444-4444-444444444444',
          receive_journal_entry_id: null,
        },
      ],
    });
    const rows = await queryInterbranchMismatches(tx, [BRANCH_A, BRANCH_B]);
    const inTransit = rows.filter((r) => r.reasonCode === 'timing_in_transit');
    expect(inTransit).toHaveLength(1);
    expect(inTransit[0]?.transferId).toBe(
      '33333333-3333-3333-3333-333333333333',
    );
    expect(inTransit[0]?.fromBranchName).toBe('Branch A');
    expect(inTransit[0]?.toBranchName).toBe('Branch B');
  });
});

describe('deriveConsolidationKpiStatus', () => {
  it('returns clean when residual is tiny and severity clean', () => {
    expect(deriveConsolidationKpiStatus(0, 'clean')).toBe('clean');
  });

  it('returns minor for warning severity', () => {
    expect(deriveConsolidationKpiStatus(50, 'warning')).toBe('minor');
  });

  it('returns critical for large residual', () => {
    expect(deriveConsolidationKpiStatus(1500, 'warning')).toBe('critical');
  });
});
