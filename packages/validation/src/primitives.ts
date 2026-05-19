import { z } from "zod";

/** UUID v4 (matches Nest @IsUUID()). */
export const uuid = z.string().uuid();

/** ISO date string YYYY-MM-DD (matches Nest @IsDateString()). */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date in YYYY-MM-DD format");

export const nonEmptyString = z.string().trim().min(1);

export const positiveInt = z.number().int().positive();

/** Cashier PIN: 4–12 digits (matches PinLoginDto / StaffLoginDto). */
export const pinDigits = z
  .string()
  .min(4, "PIN must be at least 4 digits")
  .max(12, "PIN must be at most 12 digits")
  .regex(/^\d+$/, "PIN must contain digits only");

export const consolidationRatePolicy = z.enum([
  "closing",
  "average",
  "historical",
]);

export const miscChargeKind = z.enum(["delivery", "tailor"]);
