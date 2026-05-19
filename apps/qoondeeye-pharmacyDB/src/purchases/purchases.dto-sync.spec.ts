import { createPurchaseSchema } from '@repo/validation';

import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { expectDtoZodAgree } from '../common/validation/dto-sync.util';

const productId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('Purchases DTO sync', () => {
  describe('createPurchaseSchema ↔ CreatePurchaseDto', () => {
    it('requires at least one item', () => {
      expect(createPurchaseSchema.safeParse({ items: [] }).success).toBe(false);
      expectDtoZodAgree(
        createPurchaseSchema,
        CreatePurchaseDto,
        { items: [] },
        false,
      );
    });

    it('accepts valid payload', () => {
      expectDtoZodAgree(
        createPurchaseSchema,
        CreatePurchaseDto,
        {
          items: [
            {
              productId,
              quantity: 5,
              costPrice: 12.5,
              expiryDate: '2026-12-31',
            },
          ],
        },
        true,
      );
    });

    it('rejects invalid product UUID', () => {
      expectDtoZodAgree(
        createPurchaseSchema,
        CreatePurchaseDto,
        {
          items: [{ productId: 'not-a-uuid', quantity: 1 }],
        },
        false,
      );
    });
  });
});
