type HeaderValue = string | string[] | undefined;

function parseCookies(
  cookieHeader: string | undefined,
): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const rawVal = trimmed.slice(eqIdx + 1);
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

export function getBearerToken(authorizationHeader: HeaderValue): string | null {
  const raw = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;
  if (!raw) return null;
  const [scheme, token] = raw.trim().split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

export function getAuthTokenFromHeaders(headers: {
  authorization?: HeaderValue;
  cookie?: string;
}): string | null {
  const cookies = parseCookies(headers.cookie);
  return getBearerToken(headers.authorization) ?? cookies['auth_token'] ?? null;
}
