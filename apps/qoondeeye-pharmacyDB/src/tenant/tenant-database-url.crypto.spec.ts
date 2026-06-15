import {
  decryptTenantDatabaseUrl,
  encryptTenantDatabaseUrl,
  redactDatabaseUrl,
} from './tenant-database-url.crypto';

describe('tenant-database-url.crypto', () => {
  const key = 'a'.repeat(64);

  beforeAll(() => {
    process.env.TENANT_DATABASE_URL_ENCRYPTION_KEY = key;
  });

  it('encrypts and decrypts tenant database URLs', () => {
    const plain = 'postgresql://tenant_user:secret@localhost:5432/tenant_demo_db';
    const encrypted = encryptTenantDatabaseUrl(plain);
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(decryptTenantDatabaseUrl(encrypted)).toBe(plain);
  });

  it('redacts credentials from database URLs for logs', () => {
    expect(
      redactDatabaseUrl(
        'postgresql://tenant_user:secret@localhost:5432/tenant_demo_db',
      ),
    ).toBe('postgresql://[user]@localhost:5432/tenant_demo_db');
    expect(redactDatabaseUrl(null)).toBe('[none]');
  });
});
