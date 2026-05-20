import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

/** Minimal Zod surface used by dto-sync tests (avoids a direct zod dependency). */
type ZodLike = {
  safeParse: (input: unknown) => { success: boolean };
};

const validateOpts = {
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

function classValidatorErrors(DtoClass: new () => object, payload: unknown) {
  const instance = plainToInstance(DtoClass, payload);
  return validateSync(instance, validateOpts);
}

/** Assert Zod and class-validator agree for the same payload (same field names). */
export function expectDtoZodAgree(
  schema: ZodLike,
  DtoClass: new () => object,
  payload: unknown,
  expectValid: boolean,
): void {
  const zodResult = schema.safeParse(payload);
  const cvErrors = classValidatorErrors(DtoClass, payload);

  if (expectValid) {
    expect(zodResult.success).toBe(true);
    expect(cvErrors).toHaveLength(0);
  } else {
    expect(zodResult.success).toBe(false);
    expect(cvErrors.length).toBeGreaterThan(0);
  }
}

/** Zod-only assertion (e.g. camelCase client payload vs snake_case DTO). */
export function expectZodValid(schema: ZodLike, payload: unknown): void {
  expect(schema.safeParse(payload).success).toBe(true);
}

export function expectZodInvalid(schema: ZodLike, payload: unknown): void {
  expect(schema.safeParse(payload).success).toBe(false);
}

/** class-validator-only assertion (e.g. snake_case API body). */
export function expectDtoValid(
  DtoClass: new () => object,
  payload: unknown,
): void {
  expect(classValidatorErrors(DtoClass, payload)).toHaveLength(0);
}

export function expectDtoInvalid(
  DtoClass: new () => object,
  payload: unknown,
): void {
  expect(classValidatorErrors(DtoClass, payload).length).toBeGreaterThan(0);
}
