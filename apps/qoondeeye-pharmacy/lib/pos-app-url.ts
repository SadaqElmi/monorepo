/** Standalone POS application URL (production register clients). */
export function getPosAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_POS_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "https://pos.qoondeeye.online";
}
