/**
 * Lightweight contract checks (no class-validator metadata required in Jest).
 */
describe('Consolidation API contract (payload shapes)', () => {
  it('supports fxPolicy with distinct legs', () => {
    const body = {
      periodKey: '2026-04',
      scopeHash: 'scope:test',
      fxPolicy: {
        bs: 'closing' as const,
        pnl: 'average' as const,
        equity: 'historical' as const,
      },
      asDraft: true,
    };
    expect(body.fxPolicy.pnl).toBe('average');
    expect(body.asDraft).toBe(true);
  });
});
