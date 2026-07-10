/** Normalize NEXT_PUBLIC_API_URL values that omit a scheme (common in Vercel env vars). */
export function normalizePublicApiUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const host = trimmed.split("/")[0] ?? trimmed;
  if (
    host === "localhost" ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".local")
  ) {
    return `http://${trimmed}`;
  }

  return `https://${trimmed}`;
}
