import { createSaleSchema } from '@repo/validation';

import { CreateSaleDto } from './dto/create-sale.dto';
import {
  expectDtoInvalid,
  expectDtoValid,
  expectDtoZodAgree,
  expectZodInvalid,
} from '../common/validation/dto-sync.util';

const productId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('Sales DTO sync', () => {
  describe('createSaleSchema ↔ CreateSaleDto', () => {
    it('requires at least one item', () => {
      expectDtoZodAgree(createSaleSchema, CreateSaleDto, { items: [] }, false);
    });

    it('accepts valid product line', () => {
      expectDtoZodAgree(
        createSaleSchema,
        CreateSaleDto,
        {
          items: [{ productId, quantity: 2, price: 10.5 }],
        },
        true,
      );
    });

    it('Zod rejects line with both productId and miscChargeKind', () => {
      expectZodInvalid(createSaleSchema, {
        items: [
          {
            productId,
            miscChargeKind: 'delivery',
            quantity: 1,
          },
        ],
      });
    });

    it('class-validator still accepts both ids on a line (service enforces XOR)', () => {
      expectDtoValid(CreateSaleDto, {
        items: [
          {
            productId,
            miscChargeKind: 'delivery',
            quantity: 1,
          },
        ],
      });
    });

    it('rejects missing items array', () => {
      expectDtoZodAgree(createSaleSchema, CreateSaleDto, {}, false);
      expectDtoInvalid(CreateSaleDto, {});
    });

    it('accepts offline sync metadata', () => {
      const clientSaleRef = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      expectDtoValid(CreateSaleDto, {
        clientSaleRef,
        syncSource: 'offline',
        items: [{ productId, quantity: 1 }],
      });
    });

    it('rejects invalid syncSource', () => {
      expectDtoInvalid(CreateSaleDto, {
        syncSource: 'queued',
        items: [{ productId, quantity: 1 }],
      });
    });
  });
});
