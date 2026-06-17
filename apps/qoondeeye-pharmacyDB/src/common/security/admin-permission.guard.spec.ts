import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { AdminPermissionGuard } from './admin-permission.guard';
import { ADMIN_PERMISSIONS_KEY } from './require-admin-permissions.decorator';

function mockContext(token?: string, required: string[] = []) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === ADMIN_PERMISSIONS_KEY) return required;
    return undefined;
  });
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  };
  const guard = new AdminPermissionGuard(
    reflector,
    { get: jest.fn().mockReturnValue('test-secret') } as never,
  );
  return { guard, context: context as never, req };
}

describe('AdminPermissionGuard', () => {
  it('allows platform admin JWTs with required permissions', () => {
    const token = jwt.sign(
      { sub: 'admin-1', role: 'super_admin', type: 'super_admin' },
      'test-secret',
    );
    const { guard, context, req } = mockContext(token, ['view_tenants']);

    expect(guard.canActivate(context)).toBe(true);
    expect(req).toMatchObject({
      isSystem: true,
      userId: 'admin-1',
      userRole: 'super_admin',
      permissionCodes: ['view_tenants'],
    });
  });

  it('rejects tenant user JWTs', () => {
    const token = jwt.sign(
      { sub: 'tenant-user-1', role: 'admin', type: 'tenant_user' },
      'test-secret',
    );
    const { guard, context } = mockContext(token, ['view_tenants']);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects roles outside platform RBAC map', () => {
    const token = jwt.sign(
      { sub: 'staff-1', role: 'manager', type: 'super_admin' },
      'test-secret',
    );
    const { guard, context } = mockContext(token, ['view_tenants']);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
