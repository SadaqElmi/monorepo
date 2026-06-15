import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const CIPHER = 'aes-256-gcm';
const VERSION = 'v1';

function encryptionKey(): Buffer {
  const raw =
    process.env.TENANT_DATABASE_URL_ENCRYPTION_KEY ??
    process.env.DATABASE_URL_ENCRYPTION_KEY;
  if (!raw?.trim()) {
    throw new Error(
      'TENANT_DATABASE_URL_ENCRYPTION_KEY is required for tenant database URL encryption',
    );
  }

  const trimmed = raw.trim();
  const decoded = tryDecodeKey(trimmed);
  if (decoded.length !== 32) {
    throw new Error(
      'TENANT_DATABASE_URL_ENCRYPTION_KEY must decode to exactly 32 bytes',
    );
  }
  return decoded;
}

function tryDecodeKey(raw: string): Buffer {
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  try {
    return Buffer.from(raw, 'base64');
  } catch {
    return Buffer.from(raw, 'utf8');
  }
}

export function encryptTenantDatabaseUrl(databaseUrl: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(databaseUrl, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptTenantDatabaseUrl(encrypted: string): string {
  const [version, ivRaw, tagRaw, ciphertextRaw] = encrypted.split(':');
  if (
    version !== VERSION ||
    !ivRaw?.trim() ||
    !tagRaw?.trim() ||
    !ciphertextRaw?.trim()
  ) {
    throw new Error('Invalid encrypted tenant database URL payload');
  }

  const decipher = createDecipheriv(
    CIPHER,
    encryptionKey(),
    Buffer.from(ivRaw, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function redactDatabaseUrl(databaseUrl: string | null | undefined): string {
  if (!databaseUrl) return '[none]';
  try {
    const url = new URL(databaseUrl);
    return `${url.protocol}//${url.username ? '[user]' : ''}${url.username ? '@' : ''}${url.host}${url.pathname}`;
  } catch {
    return '[redacted-database-url]';
  }
}

