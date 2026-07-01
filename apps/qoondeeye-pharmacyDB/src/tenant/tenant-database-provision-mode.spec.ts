import { usesSharedDatabaseOwner } from './tenant-database-provision-mode';

describe('usesSharedDatabaseOwner', () => {
  const originalAdminUrl = process.env.TENANT_DB_ADMIN_URL;
  const originalFlag = process.env.TENANT_DB_SHARED_OWNER;

  afterEach(() => {
    process.env.TENANT_DB_ADMIN_URL = originalAdminUrl;
    process.env.TENANT_DB_SHARED_OWNER = originalFlag;
  });

  it('detects Neon admin URLs', () => {
    process.env.TENANT_DB_SHARED_OWNER = '';
    process.env.TENANT_DB_ADMIN_URL =
      'postgresql://user:pass@ep-example.eu-central-1.aws.neon.tech/neondb';
    expect(usesSharedDatabaseOwner()).toBe(true);
  });

  it('detects Supabase pooler admin URLs', () => {
    process.env.TENANT_DB_SHARED_OWNER = '';
    process.env.TENANT_DB_ADMIN_URL =
      'postgresql://postgres.ref:pass@aws-1-eu-central-1.pooler.supabase.com:5432/postgres';
    expect(usesSharedDatabaseOwner()).toBe(true);
  });

  it('detects Supabase direct admin URLs', () => {
    process.env.TENANT_DB_SHARED_OWNER = '';
    process.env.TENANT_DB_ADMIN_URL =
      'postgresql://postgres:pass@db.jysoktynkaysumsrtuna.supabase.co:5432/postgres';
    expect(usesSharedDatabaseOwner()).toBe(true);
  });

  it('honors explicit opt-out', () => {
    process.env.TENANT_DB_ADMIN_URL =
      'postgresql://user:pass@ep-example.eu-central-1.aws.neon.tech/neondb';
    process.env.TENANT_DB_SHARED_OWNER = 'false';
    expect(usesSharedDatabaseOwner()).toBe(false);
  });

  it('uses per-tenant roles on self-hosted Postgres', () => {
    process.env.TENANT_DB_SHARED_OWNER = '';
    process.env.TENANT_DB_ADMIN_URL =
      'postgresql://postgres:pass@localhost:5432/postgres';
    expect(usesSharedDatabaseOwner()).toBe(false);
  });
});
