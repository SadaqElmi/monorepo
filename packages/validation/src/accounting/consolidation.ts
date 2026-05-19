import { z } from "zod";

import { consolidationRatePolicy, isoDate, nonEmptyString, uuid } from "../primitives";

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/accounting/dto/consolidation-fx-policy.dto.ts — ConsolidationFxPolicyDto
 */
export const consolidationFxPolicySchema = z.object({
  bs: consolidationRatePolicy,
  pnl: consolidationRatePolicy,
  equity: consolidationRatePolicy,
});

export type ConsolidationFxPolicyInput = z.infer<
  typeof consolidationFxPolicySchema
>;

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/accounting/dto/create-consolidation-run.dto.ts — CreateConsolidationRunDto
 */
export const createConsolidationRunSchema = z.object({
  periodKey: nonEmptyString,
  asOfDate: isoDate,
  fromDate: isoDate,
  toDate: isoDate,
  scopeHash: nonEmptyString,
  branchIds: z.array(uuid).optional(),
  entityId: uuid.optional(),
  dryRun: z.boolean().optional(),
  asDraft: z.boolean().optional(),
  replaceDraftRunId: uuid.optional(),
  asOfFxDate: isoDate.optional(),
  groupCurrency: z.string().optional(),
  ratePolicy: consolidationRatePolicy.optional(),
  fxPolicy: consolidationFxPolicySchema.optional(),
  includeAdjustments: z.boolean().optional(),
});

export type CreateConsolidationRunInput = z.infer<
  typeof createConsolidationRunSchema
>;
