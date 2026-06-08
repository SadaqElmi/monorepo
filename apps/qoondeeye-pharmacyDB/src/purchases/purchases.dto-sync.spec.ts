import { createPurchaseSchema, updatePurchaseSchema } from '@repo/validation';

import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import {
  expectDtoInvalid,
  expectDtoZodAgree,
} from '../common/validation/dto-sync.util';

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

    it('accepts ERP draft header fields', () => {
      expectDtoZodAgree(
        createPurchaseSchema,
        CreatePurchaseDto,
        {
          workflow: 'draft',
          supplierId: productId,
          branchId: productId,
          supplierInvoiceNo: 'INV-1',
          purchaseOrderNo: 'PO-1',
          orderDate: '2026-06-04',
          postingDate: '2026-06-04',
          purchaseDate: '2026-06-04',
          dueDate: '2026-07-04',
          notes: 'test',
          onCredit: true,
          items: [{ productId, quantity: 1, costPrice: 10 }],
        },
        true,
      );
    });
  });

  describe('updatePurchaseSchema ↔ UpdatePurchaseDto', () => {
    it('accepts ERP draft header fields without workflow', () => {
      expectDtoZodAgree(
        updatePurchaseSchema,
        UpdatePurchaseDto,
        {
          supplierInvoiceNo: 'INV-1',
          purchaseOrderNo: 'PO-1',
          orderDate: '2026-06-04',
          postingDate: '2026-06-04',
          purchaseDate: '2026-06-04',
          dueDate: '2026-07-04',
          notes: 'test',
          items: [{ productId, quantity: 1, costPrice: 10 }],
        },
        true,
      );
    });

    it('rejects workflow on update (not in DTO)', () => {
      expectDtoInvalid(UpdatePurchaseDto, {
        workflow: 'draft',
        items: [{ productId, quantity: 1 }],
      });
    });
  });
});
