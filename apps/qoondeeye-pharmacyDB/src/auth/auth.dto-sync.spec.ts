import {
  loginSchema,
  staffLoginSchema,
} from '@repo/validation';

import {
  LoginDto,
  StaffLoginDto,
} from './dto/auth.dto';
import { expectDtoZodAgree } from '../common/validation/dto-sync.util';

const branchId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('Auth DTO sync', () => {
  describe('loginSchema ↔ LoginDto', () => {
    it('requires email and password', () => {
      expect(loginSchema.safeParse({}).success).toBe(false);
      expectDtoZodAgree(loginSchema, LoginDto, {}, false);
    });

    it('accepts valid payload', () => {
      expectDtoZodAgree(
        loginSchema,
        LoginDto,
        { email: 'user@example.com', password: 'secret1' },
        true,
      );
    });

    it('rejects short password', () => {
      expectDtoZodAgree(
        loginSchema,
        LoginDto,
        { email: 'user@example.com', password: 'short' },
        false,
      );
    });
  });

  describe('staffLoginSchema ↔ StaffLoginDto', () => {
    it('requires staffId, pin, and deviceCredential', () => {
      expect(staffLoginSchema.safeParse({}).success).toBe(false);
      expectDtoZodAgree(staffLoginSchema, StaffLoginDto, {}, false);
    });

    it('accepts valid payload', () => {
      expectDtoZodAgree(
        staffLoginSchema,
        StaffLoginDto,
        {
          staffId: 'STAFF-001',
          pin: '5678',
          deviceCredential: 'device-token-abc',
          branchId,
        },
        true,
      );
    });
  });
});
