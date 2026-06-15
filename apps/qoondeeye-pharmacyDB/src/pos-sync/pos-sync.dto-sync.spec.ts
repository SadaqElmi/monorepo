import {
  expectDtoInvalid,
  expectDtoValid,
} from '../common/validation/dto-sync.util';
import { BatchSyncDto, BatchSyncSaleItemDto } from './dto/batch-sync.dto';

const clientSaleRef = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const productId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const validSale = {
  items: [{ productId, quantity: 1, price: 12.5 }],
};

describe('POS sync DTO validation', () => {
  describe('BatchSyncSaleItemDto', () => {
    it('accepts valid offline sale item', () => {
      expectDtoValid(BatchSyncSaleItemDto, {
        clientSaleRef,
        idempotencyKey: clientSaleRef,
        sale: validSale,
      });
    });

    it('rejects missing clientSaleRef uuid', () => {
      expectDtoInvalid(BatchSyncSaleItemDto, {
        clientSaleRef: 'not-a-uuid',
        sale: validSale,
      });
    });

    it('rejects sale without items', () => {
      expectDtoInvalid(BatchSyncSaleItemDto, {
        clientSaleRef,
        sale: { items: [] },
      });
    });
  });

  describe('BatchSyncDto', () => {
    it('accepts batch up to 50 sales', () => {
      expectDtoValid(BatchSyncDto, {
        sales: [{ clientSaleRef, sale: validSale }],
      });
    });

    it('rejects empty batch', () => {
      expectDtoInvalid(BatchSyncDto, { sales: [] });
    });

    it('rejects more than 50 sales', () => {
      const sales = Array.from({ length: 51 }, (_, i) => ({
        clientSaleRef: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        sale: validSale,
      }));
      expectDtoInvalid(BatchSyncDto, { sales });
    });
  });
});
