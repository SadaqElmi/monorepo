import {
  compareDerivedToDb,
  deriveStateFromEvents,
  describeReplayMismatchesForLog,
} from './transfer-replay.util';

describe('Transfer replay reducer', () => {
  it('derives canonical received flow state', () => {
    const state = deriveStateFromEvents([
      { type: 'CREATED' },
      { type: 'CONFIRMED' },
      { type: 'APPROVED' },
      { type: 'SHIPPED', metadata: { journal_entry_id: 'ship-j1' } },
      { type: 'RECEIVED', metadata: { journal_entry_id: 'recv-j1' } },
    ]);

    expect(state).toMatchObject({
      status: 'received',
      approval_state: 'approved',
      shipped_journal_entry_id: 'ship-j1',
      receive_journal_entry_id: 'recv-j1',
      is_reversed: false,
    });
  });

  it('tracks reversal journal references from event metadata', () => {
    const state = deriveStateFromEvents([
      { type: 'CREATED' },
      { type: 'CONFIRMED' },
      { type: 'APPROVED' },
      { type: 'SHIPPED', metadata: { journal_entry_id: 'ship-j2' } },
      {
        type: 'REVERSED',
        metadata: {
          ship_reversal_journal_entry_id: 'ship-r2',
          receive_reversal_journal_entry_id: 'recv-r2',
        },
      },
    ]);

    expect(state.is_reversed).toBe(true);
    expect(state.ship_reversal_journal_entry_id).toBe('ship-r2');
    expect(state.receive_reversal_journal_entry_id).toBe('recv-r2');
  });

  it('compares derived and db projection for mismatch reporting', () => {
    const derived = deriveStateFromEvents([
      { type: 'CREATED' },
      { type: 'CONFIRMED' },
      { type: 'APPROVED' },
      { type: 'SHIPPED', metadata: { journal_entry_id: 'ship-j3' } },
    ]);
    const mismatches = compareDerivedToDb(derived, {
      status: 'received',
      approval_state: 'approved',
      shipped_journal_entry_id: 'ship-j3',
      receive_journal_entry_id: null,
      is_reversed: false,
    });

    expect(mismatches.some((m) => m.includes('status'))).toBe(true);
  });

  it('describes journal mismatches without raw UUIDs in operator text', () => {
    const derived = deriveStateFromEvents([
      { type: 'CREATED' },
      { type: 'CONFIRMED' },
      { type: 'APPROVED' },
      { type: 'SHIPPED' },
      { type: 'RECEIVED' },
    ]);
    const human = describeReplayMismatchesForLog(derived, {
      status: 'received',
      approval_state: 'approved',
      is_reversed: false,
      shipped_journal_entry_id: 'b05613fc-2933-4db7-8162-c45f812a73e5',
      receive_journal_entry_id: '61236e8f-5bdf-4ea4-b8d8-6eb3af2a81a2',
    });
    expect(human.join(' ')).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
    expect(human.some((s) => s.includes('Shipment journal'))).toBe(true);
    expect(human.some((s) => s.includes('Receive journal'))).toBe(true);
  });
});
