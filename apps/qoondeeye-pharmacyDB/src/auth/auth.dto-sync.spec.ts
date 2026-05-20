import {
  loginSchema,
  pinLoginSchema,
  staffLoginSchema,
} from '@repo/validation';

import {
  LoginDto,
  PinLoginDto,
  StaffLoginDto,
} from './dto/auth.dto';
import { expectDtoZodAgree } from '../common/validation/dto-sync.util';

const branchId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('Auth DTO sync', () => {
  describe('pinLoginSchema ↔ PinLoginDto', () => {
    it('requires pin and tenant', () => {
      expect(pinLoginSchema.safeParse({}).success).toBe(false);
      expectDtoZodAgree(pinLoginSchema, PinLoginDto, {}, false);
    });

    it('accepts valid payload', () => {
      expectDtoZodAgree(
        pinLoginSchema,
        PinLoginDto,
        { pin: '1234', tenant: 'demo-pharmacy' },
        true,
      );
    });

    it('rejects non-digit PIN', () => {
      expectDtoZodAgree(
        pinLoginSchema,
        PinLoginDto,
        { pin: '12ab', tenant: 'demo-pharmacy' },
        false,
      );
    });

    it('rejects PIN shorter than 4 digits', () => {
      expectDtoZodAgree(
        pinLoginSchema,
        PinLoginDto,
        { pin: '123', tenant: 'demo-pharmacy' },
        false,
      );
    });
  });

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
