import { z } from "zod";

import { nonEmptyString, pinDigits, uuid } from "./primitives";

/**
 * ERP dashboard email/password login only — not used by standalone POS.
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
 * apps/qoondeeye-pharmacyDB/src/auth/dto/pos-setup.dto.ts — PosSetupDto
 */
export const posSetupSchema = z.object({
  tenantCode: z
    .string()
    .trim()
    .min(1, { message: "Tenant code is required" })
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message:
        "Tenant code may only contain letters, numbers, underscores, and hyphens",
    }),
  terminalUsername: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message:
        "Terminal username may only contain letters, numbers, underscores, and hyphens",
    }),
  password: z.string().min(6).max(128),
  deviceFingerprint: z.string().trim().max(128).optional(),
});

export type PosSetupInput = z.infer<typeof posSetupSchema>;
