import { z } from "zod";

import { isoDate, uuid } from "./primitives";

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/purchases/dto/create-purchase.dto.ts — CreatePurchaseItemDto
 */
export const purchaseLineSchema = z.object({
  productId: uuid,
  uomId: uuid.optional(),
  quantity: z.number().int().min(1),
  batchNumber: z.string().optional(),
  costPrice: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative().optional(),
  updateSellingPrice: z.boolean().optional(),
  expiryDate: isoDate.optional(),
  lineDiscount: z.number().nonnegative().optional(),
  taxAmount: z.number().nonnegative().optional(),
  lineNotes: z.string().optional(),
});

export type PurchaseLineInput = z.infer<typeof purchaseLineSchema>;

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/purchases/dto/create-purchase.dto.ts — CreatePurchaseDto
 */
export const createPurchaseSchema = z.object({
  workflow: z.enum(["immediate", "draft"]).optional(),
  supplierId: uuid.optional(),
  branchId: uuid.optional(),
  invoiceNumber: z.string().optional(),
  supplierInvoiceNo: z.string().optional(),
  purchaseOrderNo: z.string().optional(),
  totalAmount: z.number().nonnegative().optional(),
  purchaseDate: isoDate.optional(),
  orderDate: isoDate.optional(),
  postingDate: isoDate.optional(),
  dueDate: isoDate.optional(),
  notes: z.string().optional(),
  onCredit: z.boolean().optional(),
  items: z.array(purchaseLineSchema).min(1, "Add at least one item"),
});

export const updatePurchaseSchema = createPurchaseSchema
  .omit({ workflow: true })
  .partial()
  .extend({
    items: z.array(purchaseLineSchema).min(1).optional(),
  });

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;
