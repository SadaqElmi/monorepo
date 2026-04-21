import {
  severityBranchCrossMismatch,
  severityEventReplayMismatch,
  severityInventoryGlMismatch,
  severityJournalIntegrityFailure,
  severityJournalUnbalanced,
  severityPhaseFailure,
  severityTransferMissingJournal,
} from './reconciliation-severity.policy';

describe('reconciliation-severity.policy', () => {
  it('maps financial-critical domains to critical', () => {
    expect(severityTransferMissingJournal()).toBe('critical');
    expect(severityJournalUnbalanced()).toBe('critical');
    expect(severityJournalIntegrityFailure()).toBe('critical');
    expect(severityBranchCrossMismatch()).toBe('critical');
  });

  it('never uses critical for inventory vs GL', () => {
    expect(severityInventoryGlMismatch()).toBe('warning');
  });

  it('treats event replay drift as info', () => {
    expect(severityEventReplayMismatch()).toBe('info');
  });

  it('uses warning for phase-level failures', () => {
    expect(severityPhaseFailure()).toBe('warning');
  });
});
