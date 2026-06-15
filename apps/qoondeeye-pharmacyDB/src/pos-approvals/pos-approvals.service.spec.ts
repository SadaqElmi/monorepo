import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PosApprovalsService } from './pos-approvals.service';

describe('PosApprovalsService', () => {
  const schemaName = 'hayat';
  const branchId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  function buildService(txMocks: {
    queryRaw?: jest.Mock;
  }) {
    const prisma = {
      withTenantSchema: jest.fn(
        async (
          _schema: string,
          cb: (tx: { $queryRawUnsafe: jest.Mock }) => Promise<unknown>,
        ) => cb({ $queryRawUnsafe: txMocks.queryRaw ?? jest.fn() }),
      ),
    };
    const posAudit = { record: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = { getTenant: jest.fn() };

    return {
      service: new PosApprovalsService(
        prisma as never,
        posAudit as never,
        tenantContext as never,
      ),
      prisma,
      posAudit,
      tenantContext,
    };
  }

  describe('verifySupervisorPin', () => {
    it('accepts manager PIN', async () => {
      const pinHash = await bcrypt.hash('5678', 4);
      const queryRaw = jest.fn().mockResolvedValue([
        {
          id: 'mgr-1',
          name: 'Manager One',
          pin_hash: pinHash,
          role_name: 'manager',
        },
      ]);
      const { service } = buildService({ queryRaw });

      const result = await service.verifySupervisorPin(schemaName, 'MGR01', '5678');

      expect(result).toEqual({
        userId: 'mgr-1',
        role: 'manager',
        name: 'Manager One',
      });
    });

    it('rejects cashier role even with valid PIN', async () => {
      const pinHash = await bcrypt.hash('1234', 4);
      const queryRaw = jest.fn().mockResolvedValue([
        {
          id: 'cashier-1',
          name: 'Cashier',
          pin_hash: pinHash,
          role_name: 'cashier',
        },
      ]);
      const { service } = buildService({ queryRaw });

      await expect(
        service.verifySupervisorPin(schemaName, 'CASH01', '1234'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects wrong PIN', async () => {
      const pinHash = await bcrypt.hash('5678', 4);
      const queryRaw = jest.fn().mockResolvedValue([
        {
          id: 'mgr-1',
          name: 'Manager',
          pin_hash: pinHash,
          role_name: 'admin',
        },
      ]);
      const { service } = buildService({ queryRaw });

      await expect(
        service.verifySupervisorPin(schemaName, 'mgr-1', '0000'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('requestApproval', () => {
    it('creates pending approval with expiry', async () => {
      const inserted = {
        id: 'approval-1',
        branch_id: branchId,
        action_type: 'high_discount',
        status: 'pending',
        requested_by: 'user-1',
        approved_by: null,
        reason_code: 'discount',
        reason_note: 'Customer loyalty',
        payload: { percent: 15 },
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
        created_at: new Date(),
        resolved_at: null,
      };
      const queryRaw = jest.fn().mockResolvedValue([inserted]);
      const { service, posAudit } = buildService({ queryRaw });

      const result = await service.requestApproval(
        schemaName,
        branchId,
        {
          actionType: 'high_discount',
          reasonCode: 'discount',
          reasonNote: 'Customer loyalty',
          payload: { percent: 15 },
        },
        'user-1',
        'device-1',
      );

      expect(result).toMatchObject({
        id: 'approval-1',
        actionType: 'high_discount',
        status: 'pending',
      });
      expect(posAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'pos_approval_requested',
          deviceId: 'device-1',
        }),
      );
    });
  });
});
