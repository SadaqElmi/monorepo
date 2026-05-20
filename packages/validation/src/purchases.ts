import { z } from "zod";

import { isoDate, uuid } from "./primitives";

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/purchases/dto/create-purchase.dto.ts — CreatePurchaseItemDto
 */
export const purchaseLineSchema = z.object({
  productId: uuid,
  quantity: z.number().int().min(1),
  batchNumber: z.string().optional(),
  costPrice: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative().optional(),
  expiryDate: isoDate.optional(),
});

export type PurchaseLineInput = z.infer<typeof purchaseLineSchema>;

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/purchases/dto/create-purchase.dto.ts — CreatePurchaseDto
 */
export const createPurchaseSchema = z.object({
  supplierId: uuid.optional(),
  branchId: uuid.optional(),
  invoiceNumber: z.string().optional(),
  totalAmount: z.number().nonnegative().optional(),
  purchaseDate: isoDate.optional(),
  onCredit: z.boolean().optional(),
  items: z.array(purchaseLineSchema).min(1, "Add at least one item"),
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
