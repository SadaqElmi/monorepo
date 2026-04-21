import {
  getClientBranchIdHeaderForApi,
  getEffectiveClientBranchId,
} from "@/lib/branch-access";

export type JsonHeaders = Record<string, string>;

/** Single-branch UUID for UI (undefined when switcher is on "all"). */
export function getClientBranchId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return getEffectiveClientBranchId();
}

function hasExplicitBranchHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === "x-branch-id");
}

export async function jsonFetch<TResponse>(
  url: string,
  init?: RequestInit,
): Promise<TResponse> {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const mergedHeaders: Record<string, string> = { ...headers };
  const branchHeader = getClientBranchIdHeaderForApi();
  if (!hasExplicitBranchHeader(mergedHeaders) && branchHeader) {
    mergedHeaders["x-branch-id"] = branchHeader;
  }

  const res = await fetch(url, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers: mergedHeaders,
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof (data as { message?: unknown }).message === "string"
        ? ((data as { message: string }).message as string)
        : Array.isArray((data as { message?: unknown }).message)
          ? ((data as { message: string[] }).message as string[]).join(", ")
          : "Request failed";
    throw new Error(message);
  }

  return data as TResponse;
}

export async function authPost<TResponse>(
  url: string,
  body: Record<string, unknown>,
  headers?: JsonHeaders,
): Promise<TResponse> {
  return jsonFetch<TResponse>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
