import type { ZodError, ZodSchema } from "zod";

/** User-facing message from a Zod error. */
export function formatZodError(error: ZodError): string {
  const first = error.errors[0];
  if (!first) return "Validation failed";
  const path = first.path.length ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Parse or throw ValidationError with a formatted message. */
export function parseInput<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(formatZodError(result.error));
  }
  return result.data;
}

export type ValidateResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/** Safe parse for UI submit handlers (toast-friendly). */
export function validateForSubmit<T>(
  schema: ZodSchema<T>,
  data: unknown,
): ValidateResult<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { ok: false, message: formatZodError(result.error) };
  }
  return { ok: true, data: result.data };
}
