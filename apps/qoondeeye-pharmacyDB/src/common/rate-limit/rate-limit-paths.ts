export type RateLimitTier =
  | 'login'
  | 'pin'
  | 'staff'
  | 'authOther'
  | 'public'
  | 'reports'
  | 'default';

const LOGIN_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/super-admin/login',
  '/api/auth/tenant/login',
]);

function normalizePath(pathname: string): string {
  const base = pathname.split('?')[0] ?? pathname;
  return base.replace(/\/+$/, '') || '/';
}

function isLoginPath(path: string, method: string): boolean {
  if (method !== 'POST') return false;
  if (LOGIN_PATHS.has(path)) return true;
  return path.startsWith('/api/auth/') && path.endsWith('/login');
}

function isReportsPath(path: string): boolean {
  if (path.startsWith('/api/reports')) return true;
  if (path.startsWith('/api/v1/reports')) return true;
  if (path === '/api/audit/export') return true;
  if (/^\/api\/pos\/sessions\/[^/]+\/(x-report|z-report)$/i.test(path)) {
    return true;
  }
  return false;
}

export function resolveRateLimitTier(
  pathname: string,
  method: string,
): RateLimitTier {
  const path = normalizePath(pathname);
  const m = method.toUpperCase();

  if (path === '/api/inventory/stream' && m === 'GET') {
    return 'default';
  }

  if (isLoginPath(path, m)) return 'login';
  if (path === '/api/auth/pin-login' && m === 'POST') return 'pin';
  if (path === '/api/auth/staff-login' && m === 'POST') return 'staff';

  if (path.startsWith('/api/auth/') && m === 'POST') return 'authOther';

  if (
    path.startsWith('/api/tenants') ||
    path.startsWith('/api/domains') ||
    path.startsWith('/api/system-users')
  ) {
    return 'public';
  }

  if (isReportsPath(path)) return 'reports';

  return 'default';
}

export function shouldSkipRateLimitPath(pathname: string, method: string): boolean {
  const path = normalizePath(pathname);
  const m = method.toUpperCase();
  if (m === 'OPTIONS') return true;
  if (path === '/api' && m === 'GET') return true;
  if (path === '/api/inventory/stream' && m === 'GET') return true;
  return false;
}

export function isReportsPathForLogging(pathname: string): boolean {
  return isReportsPath(normalizePath(pathname));
}
