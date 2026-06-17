import { SetMetadata } from '@nestjs/common';
import type { AdminPermission } from './admin-permissions';

export const ADMIN_PERMISSIONS_KEY = 'required_admin_permissions';

export const RequireAdminPermissions = (...codes: AdminPermission[]) =>
  SetMetadata(ADMIN_PERMISSIONS_KEY, codes);
