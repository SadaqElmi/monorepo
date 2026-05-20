import {
  isoDate,
  reportDateRangeSchema,
  validateForSubmit,
} from "@/lib/validation";

/** Validate accounting report from/to before API calls. */
export function validateReportDateRange(
  from: string,
  to: string,
  opts?: { compareFrom?: string; compareTo?: string; branchId?: string },
): { ok: true } | { ok: false; message: string } {
  const result = validateForSubmit(reportDateRangeSchema, {
    from,
    to,
    compareFrom: opts?.compareFrom || undefined,
    compareTo: opts?.compareTo || undefined,
    branchId: opts?.branchId,
  });
  if (!result.ok) return result;
  return { ok: true };
}

/** Validate a single as-of date (balance sheet, trial balance, etc.). */
export function validateReportAsOf(
  asOf: string,
): { ok: true } | { ok: false; message: string } {
  const result = validateForSubmit(isoDate, asOf);
  if (!result.ok) return result;
  return { ok: true };
}
