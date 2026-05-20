import { z } from "zod";

import { nonEmptyString, pinDigits, uuid } from "./primitives";

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/auth/dto/auth.dto.ts — PinLoginDto
 */
export const pinLoginSchema = z.object({
  pin: pinDigits,
  tenant: nonEmptyString,
  branchId: uuid.optional(),
  staffId: z.string().trim().min(1).max(120).optional(),
});

export type PinLoginInput = z.infer<typeof pinLoginSchema>;

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/auth/dto/auth.dto.ts — LoginDto
 */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  tenant: z.string().trim().min(1).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/auth/dto/auth.dto.ts — StaffLoginDto
 */
export const staffLoginSchema = z.object({
  staffId: nonEmptyString,
  pin: pinDigits,
  deviceCredential: nonEmptyString,
  branchId: uuid.optional(),
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

/**
 * Keep in sync with:
 * apps/qoondeeye-pharmacyDB/src/auth/dto/auth.dto.ts — PosDeviceEnrollDto
 */
export const posDeviceEnrollSchema = z.object({
  tenant: nonEmptyString,
  email: z.string().email(),
  password: z.string().min(6),
  deviceCode: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  branchId: uuid.optional(),
});

export type PosDeviceEnrollInput = z.infer<typeof posDeviceEnrollSchema>;
