import type { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';

type AuditHashParams = {
  prevHash: string | null;
  entityType: string;
  entityId: string;
  action: string;
  branchId: string | null;
  userId: string | null;
  eventTs: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

type AuditLogHashTestApi = {
  computeAuditHash(params: AuditHashParams): string;
};

function auditHashApi(prisma: PrismaService): AuditLogHashTestApi {
  return new AuditLogService(prisma) as unknown as AuditLogHashTestApi;
}

describe('AuditLogService hash chain', () => {
  it('verifies a deterministic hash link', () => {
    const mockPrisma = {} as unknown as PrismaService;
    const hashApi = auditHashApi(mockPrisma);
    const svc = new AuditLogService(mockPrisma);
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
    const auditHash = hashApi.computeAuditHash(payload);
    expect(auditHash).toHaveLength(64);
    expect(
      svc.verifyHashLink({
        ...payload,
        auditHash,
      }),
    ).toBe(true);
  });

  it('rejects missing hash in verification', () => {
    const mockPrisma = {} as unknown as PrismaService;
    const svc = new AuditLogService(mockPrisma);
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
