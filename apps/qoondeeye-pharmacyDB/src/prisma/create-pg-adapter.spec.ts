import { normalizePgConnectionStringForPool, resolvePgSsl } from './create-pg-adapter';

describe('resolvePgSsl', () => {
  const originalStrict = process.env.PG_SSL_REJECT_UNAUTHORIZED;

  afterEach(() => {
    if (originalStrict === undefined) {
      delete process.env.PG_SSL_REJECT_UNAUTHORIZED;
    } else {
      process.env.PG_SSL_REJECT_UNAUTHORIZED = originalStrict;
    }
  });

  it('disables SSL for sslmode=disable', () => {
    expect(
      resolvePgSsl(
        'postgresql://user:pass@localhost:5432/db?sslmode=disable',
      ),
    ).toBe(false);
  });

  it('relaxes verification for sslmode=require', () => {
    expect(
      resolvePgSsl(
        'postgresql://user:pass@example.com:5432/db?sslmode=require',
      ),
    ).toEqual({ rejectUnauthorized: false });
  });

  it('relaxes verification for sslmode=prefer', () => {
    expect(
      resolvePgSsl(
        'postgresql://user:pass@example.com:5432/db?sslmode=prefer',
      ),
    ).toEqual({ rejectUnauthorized: false });
  });

  it('enforces verification for sslmode=verify-full', () => {
    expect(
      resolvePgSsl(
        'postgresql://user:pass@example.com:5432/db?sslmode=verify-full',
      ),
    ).toEqual({ rejectUnauthorized: true });
  });

  it('does not force SSL for localhost without sslmode', () => {
    expect(
      resolvePgSsl('postgresql://postgres:pass@localhost:5432/postgres'),
    ).toBeUndefined();
  });

  it('enables relaxed SSL for Supabase pooler hosts', () => {
    expect(
      resolvePgSsl(
        'postgresql://postgres:pass@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
      ),
    ).toEqual({ rejectUnauthorized: false });
  });

  it('enables relaxed SSL for Supabase direct hosts', () => {
    expect(
      resolvePgSsl(
        'postgresql://postgres:pass@db.projectref.supabase.co:5432/postgres',
      ),
    ).toEqual({ rejectUnauthorized: false });
  });

  it('honors PG_SSL_REJECT_UNAUTHORIZED=true for sslmode=require', () => {
    process.env.PG_SSL_REJECT_UNAUTHORIZED = 'true';
    expect(
      resolvePgSsl(
        'postgresql://user:pass@example.com:5432/db?sslmode=require',
      ),
    ).toEqual({ rejectUnauthorized: true });
  });
});

describe('normalizePgConnectionStringForPool', () => {
  it('adds uselibpqcompat for relaxed SSL with sslmode=require', () => {
    const normalized = normalizePgConnectionStringForPool(
      'postgresql://user:pass@example.com:5432/db?sslmode=require',
      { rejectUnauthorized: false },
    );
    expect(normalized).toContain('uselibpqcompat=true');
    expect(normalized).toContain('sslmode=require');
  });

  it('leaves URL unchanged for strict SSL', () => {
    const url =
      'postgresql://user:pass@example.com:5432/db?sslmode=verify-full';
    expect(
      normalizePgConnectionStringForPool(url, { rejectUnauthorized: true }),
    ).toBe(url);
  });
});
