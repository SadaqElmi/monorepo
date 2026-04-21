import type { ReconciliationSeverity } from './reconciliation.types';

/** Missing transfer journals, ship/receive journal links */
export function severityTransferMissingJournal(): ReconciliationSeverity {
  return 'critical';
}

/** Unbalanced journal entry (debits vs credits) */
export function severityJournalUnbalanced(): ReconciliationSeverity {
  return 'critical';
}

/** Journal integrity assertion failure (lines, COA, etc.) */
export function severityJournalIntegrityFailure(): ReconciliationSeverity {
  return 'critical';
}

/** Cross-branch DueFrom/DueTo pair mismatch */
export function severityBranchCrossMismatch(): ReconciliationSeverity {
  return 'critical';
}

/** Inventory vs GL — never critical per reconciliation policy */
export function severityInventoryGlMismatch(): ReconciliationSeverity {
  return 'warning';
}

/** Event replay vs row state — informational */
export function severityEventReplayMismatch(): ReconciliationSeverity {
  return 'info';
}

/** A whole check phase threw (DB/timeout); does not imply financial severity */
export function severityPhaseFailure(): ReconciliationSeverity {
  return 'warning';
}
