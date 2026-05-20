import { z } from "zod";

import { isoDate, uuid } from "./primitives";

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/transfers/dto/transfer-line.dto.ts — TransferLineDto (snake_case API: product_id)
 */
export const transferLineSchema = z.object({
  productId: uuid,
  quantity: z.number().int().min(1),
});

export type TransferLineInput = z.infer<typeof transferLineSchema>;

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/transfers/dto/create-transfer.dto.ts — CreateTransferDto (camelCase client payload)
 */
export const createTransferSchema = z.object({
  fromBranchId: uuid.optional(),
  toBranchId: uuid,
  expectedDate: isoDate.optional(),
  items: z.array(transferLineSchema).min(1, "Add at least one line"),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;

/** Draft save from UI may omit fromBranchId (server derives source). */
export const createTransferDraftSchema = z.object({
  toBranchId: uuid,
  items: z.array(transferLineSchema).min(1, "Add at least one line with a product and quantity"),
});

export type CreateTransferDraftInput = z.infer<typeof createTransferDraftSchema>;
