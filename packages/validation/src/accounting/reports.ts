import { z } from "zod";

import { isoDate, uuid } from "../primitives";

/**
 * Keep in sync with GET query params on:
 * apps/qoondeeye-pharmacyDB/src/accounting/financial-reports.controller.ts
 * (from, to, compareFrom, compareTo, branchId)
 */
export const reportDateRangeSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    compareFrom: isoDate.optional(),
    compareTo: isoDate.optional(),
    branchId: uuid.optional(),
  })
  .refine((d) => d.from <= d.to, {
    message: "From date must be on or before to date",
    path: ["to"],
  })
  .refine(
    (d) => {
      if (!d.compareFrom && !d.compareTo) return true;
      if (!d.compareFrom || !d.compareTo) return false;
      return d.compareFrom <= d.compareTo;
    },
    {
      message: "Compare from must be on or before compare to",
      path: ["compareTo"],
    },
  );

export type ReportDateRangeInput = z.infer<typeof reportDateRangeSchema>;
