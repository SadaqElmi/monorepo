import {
  consolidationFxPolicySchema,
  createConsolidationRunSchema,
} from '@repo/validation';

import { ConsolidationFxPolicyDto } from './dto/consolidation-fx-policy.dto';
import { CreateConsolidationRunDto } from './dto/create-consolidation-run.dto';
import { expectDtoZodAgree } from '../common/validation/dto-sync.util';

const validRun = {
  periodKey: '2026-04',
  asOfDate: '2026-04-30',
  fromDate: '2026-04-01',
  toDate: '2026-04-30',
  scopeHash: 'scope:test',
};

describe('Consolidation DTO sync', () => {
  describe('consolidationFxPolicySchema ↔ ConsolidationFxPolicyDto', () => {
    it('accepts valid fxPolicy legs', () => {
      expectDtoZodAgree(
        consolidationFxPolicySchema,
        ConsolidationFxPolicyDto,
        {
          bs: 'closing',
          pnl: 'average',
          equity: 'historical',
        },
        true,
      );
    });

    it('rejects invalid rate on bs leg', () => {
      expectDtoZodAgree(
        consolidationFxPolicySchema,
        ConsolidationFxPolicyDto,
        {
          bs: 'invalid',
          pnl: 'average',
          equity: 'historical',
        },
        false,
      );
    });
  });

  describe('createConsolidationRunSchema ↔ CreateConsolidationRunDto', () => {
    it('requires core run fields', () => {
      expect(createConsolidationRunSchema.safeParse({}).success).toBe(false);
      expectDtoZodAgree(createConsolidationRunSchema, CreateConsolidationRunDto, {}, false);
    });

    it('accepts valid run with fxPolicy and asDraft', () => {
      expectDtoZodAgree(
        createConsolidationRunSchema,
        CreateConsolidationRunDto,
        {
          ...validRun,
          fxPolicy: {
            bs: 'closing',
            pnl: 'average',
            equity: 'historical',
          },
          asDraft: true,
        },
        true,
      );
    });

    it('supports fxPolicy with distinct legs (contract smoke)', () => {
      const body = {
        ...validRun,
        fxPolicy: {
          bs: 'closing' as const,
          pnl: 'average' as const,
          equity: 'historical' as const,
        },
        asDraft: true,
      };
      expect(body.fxPolicy.pnl).toBe('average');
      expect(body.asDraft).toBe(true);
      expect(createConsolidationRunSchema.safeParse(body).success).toBe(true);
    });
  });
});
