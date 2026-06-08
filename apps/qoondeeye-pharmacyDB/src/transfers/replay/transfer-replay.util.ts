export type ReplayEvent = {
  type?: string | null;
  event_type?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type DerivedTransferState = {
  status: 'draft' | 'confirmed' | 'shipped' | 'received' | 'closed';
  approval_state: 'none' | 'pending' | 'approved' | 'rejected';
  is_reversed: boolean;
  shipped_journal_entry_id: string | null;
  receive_journal_entry_id: string | null;
  ship_reversal_journal_entry_id: string | null;
  receive_reversal_journal_entry_id: string | null;
};

function asText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

export function deriveStateFromEvents(
  events: ReplayEvent[],
): DerivedTransferState {
  const state: DerivedTransferState = {
    status: 'draft',
    approval_state: 'none',
    is_reversed: false,
    shipped_journal_entry_id: null,
    receive_journal_entry_id: null,
    ship_reversal_journal_entry_id: null,
    receive_reversal_journal_entry_id: null,
  };

  for (const event of events) {
    const rawType = (event.type ?? event.event_type ?? '').toLowerCase().trim();
    const meta = event.metadata ?? {};

    if (rawType === 'created') {
      state.status = 'draft';
      continue;
    }
    if (rawType === 'confirmed') {
      state.status = 'confirmed';
      continue;
    }
    if (rawType === 'approved') {
      state.approval_state = 'approved';
      continue;
    }
    if (rawType === 'rejected') {
      state.approval_state = 'rejected';
      continue;
    }
    if (rawType === 'shipped') {
      state.status = 'shipped';
      state.shipped_journal_entry_id =
        asText(meta.journal_entry_id) ?? state.shipped_journal_entry_id;
      continue;
    }
    if (rawType === 'received') {
      state.status = 'received';
      state.receive_journal_entry_id =
        asText(meta.journal_entry_id) ?? state.receive_journal_entry_id;
      continue;
    }
    if (rawType === 'closed') {
      state.status = 'closed';
      continue;
    }
    if (rawType === 'reversed') {
      state.is_reversed = true;
      state.ship_reversal_journal_entry_id =
        asText(meta.ship_reversal_journal_entry_id) ??
        state.ship_reversal_journal_entry_id;
      state.receive_reversal_journal_entry_id =
        asText(meta.receive_reversal_journal_entry_id) ??
        state.receive_reversal_journal_entry_id;
    }
  }

  return state;
}

export function compareDerivedToDb(
  derived: DerivedTransferState,
  db: Partial<DerivedTransferState>,
): string[] {
  const mismatches: string[] = [];
  const keys: Array<keyof DerivedTransferState> = [
    'status',
    'approval_state',
    'is_reversed',
    'shipped_journal_entry_id',
    'receive_journal_entry_id',
    'ship_reversal_journal_entry_id',
    'receive_reversal_journal_entry_id',
  ];
  for (const key of keys) {
    const d = derived[key] ?? null;
    const b = (db[key] ?? null) as unknown;
    if (d !== b) {
      mismatches.push(`${key}: derived=${String(d)} db=${String(b)}`);
    }
  }
  return mismatches;
}

function normJournalId(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : null;
  }
  return null;
}

/**
 * Short operator-facing sentences for reconciliation logs (no raw UUIDs in text).
 */
export function describeReplayMismatchesForLog(
  derived: DerivedTransferState,
  db: Partial<DerivedTransferState>,
): string[] {
  const lines: string[] = [];
  const keys: Array<keyof DerivedTransferState> = [
    'status',
    'approval_state',
    'is_reversed',
    'shipped_journal_entry_id',
    'receive_journal_entry_id',
    'ship_reversal_journal_entry_id',
    'receive_reversal_journal_entry_id',
  ];
  for (const key of keys) {
    const d = derived[key] ?? null;
    const b = (db[key] ?? null) as unknown;
    if (d === b) continue;

    if (key === 'status') {
      lines.push(
        `Status: the database shows “${String(b)}”, but replaying events suggests “${String(d)}”.`,
      );
      continue;
    }
    if (key === 'approval_state') {
      lines.push(
        `Approval: the database shows “${String(b)}”, but replaying events suggests “${String(d)}”.`,
      );
      continue;
    }
    if (key === 'is_reversed') {
      lines.push(
        `Reversed flag: database is ${Boolean(b)}, replay suggests ${Boolean(d)}.`,
      );
      continue;
    }
    if (key === 'shipped_journal_entry_id') {
      const hasDb = Boolean(normJournalId(b));
      const hasDerived = Boolean(normJournalId(d));
      if (hasDb && !hasDerived) {
        lines.push(
          'Shipment journal: the transfer row links to a posted shipment journal, but the event replay did not find journal_entry_id on a SHIPPED event (missing metadata, renamed event type, or incomplete history).',
        );
      } else if (!hasDb && hasDerived) {
        lines.push(
          'Shipment journal: a SHIPPED event references a journal id, but the transfer row does not link one.',
        );
      } else {
        lines.push(
          'Shipment journal: the linked journal id from events does not match the one on the transfer row.',
        );
      }
      continue;
    }
    if (key === 'receive_journal_entry_id') {
      const hasDb = Boolean(normJournalId(b));
      const hasDerived = Boolean(normJournalId(d));
      if (hasDb && !hasDerived) {
        lines.push(
          'Receive journal: the transfer row links to a posted receive journal, but the event replay did not find journal_entry_id on a RECEIVED event (missing metadata, renamed event type, or incomplete history).',
        );
      } else if (!hasDb && hasDerived) {
        lines.push(
          'Receive journal: a RECEIVED event references a journal id, but the transfer row does not link one.',
        );
      } else {
        lines.push(
          'Receive journal: the linked journal id from events does not match the one on the transfer row.',
        );
      }
      continue;
    }
    if (key === 'ship_reversal_journal_entry_id') {
      lines.push(
        'Ship reversal journal: event replay and the transfer row disagree on the linked reversal journal.',
      );
      continue;
    }
    if (key === 'receive_reversal_journal_entry_id') {
      lines.push(
        'Receive reversal journal: event replay and the transfer row disagree on the linked reversal journal.',
      );
    }
  }
  return lines;
}
