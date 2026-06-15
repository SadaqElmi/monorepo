import {
  expandPermissionCodes,
  hasEffectivePermission,
  PERMISSION_CATALOG,
  ALL_PERMISSION_CODES,
  COARSE_PERMISSION_ALIASES,
} from './permission-catalog';
import * as fs from 'fs';
import * as path from 'path';
describe('permission-catalog', () => {
  it('has unique permission codes', () => {
    const codes = PERMISSION_CATALOG.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('expandPermissionCodes includes manage_users aliases', () => {
    const expanded = expandPermissionCodes(['manage_users']);
    expect(expanded.has('view_roles')).toBe(true);
    expect(expanded.has('create_staff')).toBe(true);
  });

  it('hasEffectivePermission resolves coarse aliases', () => {
    expect(hasEffectivePermission(['manage_users'], 'edit_role')).toBe(true);
    expect(hasEffectivePermission(['view_products'], 'edit_role')).toBe(false);
  });

  it('includes POS supervisor approval permission', () => {
    expect(ALL_PERMISSION_CODES).toContain('pos_approve_variance');
    expect(hasEffectivePermission(['pos_approve_variance'], 'pos_approve_variance')).toBe(
      true,
    );
  });

  it('every alias coarse code exists in catalog or is legacy', () => {
    for (const alias of COARSE_PERMISSION_ALIASES) {
      expect(
        ALL_PERMISSION_CODES.includes(alias.coarse) ||
          alias.coarse.startsWith('manage_'),
      ).toBe(true);
    }
  });

  it('frontend ALL_PERMISSIONS matches backend catalog codes', () => {
    const frontendPath = path.resolve(
      __dirname,
      '../../../../qoondeeye-pharmacy/lib/permissions.ts',
    );
    const source = fs.readFileSync(frontendPath, 'utf8');
    const match = source.match(
      /export const ALL_PERMISSIONS = \[([\s\S]*?)\] as const/,
    );
    expect(match).toBeTruthy();
    const frontendCodes = [...(match![1].match(/"([^"]+)"/g) ?? [])].map((s) =>
      s.slice(1, -1),
    );
    const backendCodes = PERMISSION_CATALOG.map((p) => p.code).sort();
    expect(frontendCodes.sort()).toEqual(backendCodes);
  });
});
