import { AuditLogService } from './audit-log.service';

describe('AuditLogService hash chain', () => {
  it('verifies a deterministic hash link', () => {
    const svc = new AuditLogService({} as any);
    const payload = {
      prevHash: 'abc123',
      entityType: 'transfer',
      entityId: '11111111-1111-1111-1111-111111111111',
      action: 'interbranch_receive',
      branchId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
      eventTs: '2026-04-17T00:00:00.000Z',
      before: { status: 'shipped' },
      after: { status: 'received' },
    };
    const auditHash = (svc as any).computeAuditHash(payload) as string;
    expect(auditHash).toHaveLength(64);
    expect(
      svc.verifyHashLink({
        ...payload,
        auditHash,
      }),
    ).toBe(true);
  });

  it('rejects missing hash in verification', () => {
    const svc = new AuditLogService({} as any);
    expect(
      svc.verifyHashLink({
        prevHash: null,
        entityType: 'security',
        entityId: 'GET:/api/sales',
        action: 'branch_access_denied',
        branchId: null,
        userId: null,
        eventTs: '2026-04-17T00:00:00.000Z',
        before: null,
        after: { reason: 'scope_denied' },
        auditHash: null,
      }),
    ).toBe(false);
  });
});
