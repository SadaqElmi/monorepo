import { z } from "zod";

import { miscChargeKind, uuid } from "./primitives";

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/sales/dto/create-sale.dto.ts — CreateSaleItemDto
 */
export const saleLineSchema = z
  .object({
    productId: uuid.optional(),
    uomId: uuid.optional(),
    miscChargeKind: miscChargeKind.optional(),
    quantity: z.number().int().min(1),
    price: z.number().nonnegative().optional(),
    priceGroupId: uuid.optional(),
    offerId: uuid.optional(),
    lineDiscount: z.number().nonnegative().optional(),
    discountSource: z.string().optional(),
  })
  .superRefine((line, ctx) => {
    const hasProduct = Boolean(line.productId);
    const hasMisc = Boolean(line.miscChargeKind);
    if (hasProduct === hasMisc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each line must have either productId or miscChargeKind",
      });
    }
  });

export type SaleLineInput = z.infer<typeof saleLineSchema>;

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/sales/dto/create-sale.dto.ts — CreateSaleDto
 */
export const saleCreditOverrideSchema = z.object({
  managerUserId: uuid,
  reason: z.string().min(1),
});

export const createSaleSchema = z.object({
  branchId: uuid.optional(),
  totalAmount: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  tax: z.number().nonnegative().optional(),
  paymentMethod: z.string().optional(),
  onAccount: z.boolean().optional(),
  customerId: uuid.optional(),
  posSessionId: uuid.optional(),
  creditOverride: saleCreditOverrideSchema.optional(),
  items: z.array(saleLineSchema).min(1, "Add at least one line item"),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
