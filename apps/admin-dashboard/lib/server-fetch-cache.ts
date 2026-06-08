import "server-only";

export const SERVER_REPORT_REVALIDATE_SEC = 30;

export type ServerFetchCacheMode = "default" | "report" | "no-store";

export function serverFetchCacheInit(
  mode: ServerFetchCacheMode = "default",
): Pick<RequestInit, "cache" | "next"> {
  if (mode === "report") {
    return { next: { revalidate: SERVER_REPORT_REVALIDATE_SEC } };
  }
  if (mode === "no-store") {
    return { cache: "no-store" };
  }
  return { cache: "no-store" };
}
