import { PosAuditQueryService } from './pos-audit-query.service';

describe('PosAuditQueryService', () => {
  const service = new PosAuditQueryService(
    {} as never,
    {} as never,
  );

  describe('sanitizePayload', () => {
    it('strips forbidden secret keys', () => {
      const result = service.sanitizePayload({
        terminalUsername: 'pos01',
        password: 'secret',
        pin: '1234',
        deviceCredential: 'cred',
        outcome: 'success',
      });
      expect(result).toEqual({
        terminalUsername: 'pos01',
        outcome: 'success',
      });
    });

    it('returns null when payload only contains forbidden keys', () => {
      expect(
        service.sanitizePayload({
          password: 'x',
          device_secret: 'y',
        }),
      ).toBeNull();
    });
  });
});
