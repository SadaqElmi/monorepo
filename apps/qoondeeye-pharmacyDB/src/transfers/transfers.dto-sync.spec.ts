import { createTransferSchema } from '@repo/validation';

import { CreateTransferDto } from './dto/create-transfer.dto';
import {
  expectDtoInvalid,
  expectDtoValid,
  expectZodInvalid,
  expectZodValid,
} from '../common/validation/dto-sync.util';

const productId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const toBranchId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

describe('Transfers DTO sync', () => {
  describe('createTransferSchema (camelCase client)', () => {
    it('requires toBranchId and items', () => {
      expectZodInvalid(createTransferSchema, {});
      expectZodInvalid(createTransferSchema, {
        toBranchId,
        items: [],
      });
    });

    it('accepts valid camelCase payload', () => {
      expectZodValid(createTransferSchema, {
        toBranchId,
        items: [{ productId, quantity: 3 }],
        expectedDate: '2026-06-01',
      });
    });
  });

  describe('CreateTransferDto (snake_case API)', () => {
    it('rejects invalid to_branch_id UUID', () => {
      expectDtoInvalid(CreateTransferDto, {
        to_branch_id: 'not-a-uuid',
        items: [{ product_id: productId, quantity: 1 }],
      });
    });

    it('accepts valid snake_case payload', () => {
      expectDtoValid(CreateTransferDto, {
        to_branch_id: toBranchId,
        items: [{ product_id: productId, quantity: 3 }],
        expected_date: '2026-06-01',
      });
    });

    it('rejects invalid product_id UUID', () => {
      expectDtoInvalid(CreateTransferDto, {
        to_branch_id: toBranchId,
        items: [{ product_id: 'bad', quantity: 1 }],
      });
    });
  });
});
