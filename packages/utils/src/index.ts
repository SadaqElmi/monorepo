import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(
  value: number,
  currency = "USD",
  locale = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(value);
}

export function toNumberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Bumped when ERP product/catalog data changes (POS + pharmacy register listen). */
export const PHARMCARE_CATALOG_BUMP_KEY = "pharmcare:catalog-bump";

export const PHARMCARE_CATALOG_BUMP_EVENT = "pharmcare:catalog-bump";

/** Notify POS (same or other tab on same origin) to refetch catalog. */
export function bumpCatalogCache(): void {
  if (typeof window === "undefined") return;
  const next = String(Date.now());
  try {
    localStorage.setItem(PHARMCARE_CATALOG_BUMP_KEY, next);
  } catch {
    // ignore quota / private mode
  }
  window.dispatchEvent(
    new CustomEvent(PHARMCARE_CATALOG_BUMP_EVENT, { detail: next }),
  );
}

export function subscribeCatalogBump(onBump: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onStorage = (e: StorageEvent) => {
    if (e.key === PHARMCARE_CATALOG_BUMP_KEY) onBump();
  };
  const onCustom = () => onBump();

  window.addEventListener("storage", onStorage);
  window.addEventListener(PHARMCARE_CATALOG_BUMP_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PHARMCARE_CATALOG_BUMP_EVENT, onCustom);
  };
}
