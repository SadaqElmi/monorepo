import { ForbiddenException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { assertHasPermission } from './assert-permission.util';
import { PermissionGuard } from './permission.guard';
import { Reflector } from '@nestjs/core';

function mockReq(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    userRole: 'manager',
    permissionCodes: [],
    ...overrides,
  } as FastifyRequest;
}

describe('assertHasPermission', () => {
  it('allows admin without permission codes', () => {
    expect(() =>
      assertHasPermission(mockReq({ userRole: 'admin' }), 'delete_product'),
    ).not.toThrow();
  });

  it('allows super_admin without permission codes', () => {
    expect(() =>
      assertHasPermission(
        mockReq({ userRole: 'super_admin', permissionCodes: [] }),
        'create_staff',
      ),
    ).not.toThrow();
  });

  it('allows isSuperAdmin flag without permission codes', () => {
    expect(() =>
      assertHasPermission(
        mockReq({ isSuperAdmin: true, permissionCodes: [] }),
        'create_staff',
      ),
    ).not.toThrow();
  });

  it('throws when permission is missing', () => {
    expect(() =>
      assertHasPermission(mockReq({ permissionCodes: ['edit_product'] }), 'delete_product'),
    ).toThrow(ForbiddenException);
  });

  it('passes when permission is present', () => {
    expect(() =>
      assertHasPermission(mockReq({ permissionCodes: ['change_lock_date'] }), 'change_lock_date'),
    ).not.toThrow();
  });

  it('passes when coarse alias implies required permission', () => {
    expect(() =>
      assertHasPermission(
        mockReq({ permissionCodes: ['manage_users'] }),
        'view_roles',
      ),
    ).not.toThrow();
  });
});

describe('PermissionGuard', () => {
  const guard = new PermissionGuard(new Reflector());

  it('bypasses for admin role', () => {
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => mockReq({ userRole: 'admin', permissionCodes: [] }),
      }),
    } as never;
    jest.spyOn(guard['reflector'], 'getAllAndOverride').mockReturnValue(['manage_users']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('bypasses for super_admin role', () => {
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () =>
          mockReq({ userRole: 'super_admin', isSuperAdmin: true, permissionCodes: [] }),
      }),
    } as never;
    jest.spyOn(guard['reflector'], 'getAllAndOverride').mockReturnValue(['create_staff']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when required permission is absent', () => {
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => mockReq({ permissionCodes: [] }),
      }),
    } as never;
    jest.spyOn(guard['reflector'], 'getAllAndOverride').mockReturnValue(['manage_users']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows when all required permissions are present', () => {
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => mockReq({ permissionCodes: ['view_audit_logs'] }),
      }),
    } as never;
    jest.spyOn(guard['reflector'], 'getAllAndOverride').mockReturnValue(['view_audit_logs']);
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
