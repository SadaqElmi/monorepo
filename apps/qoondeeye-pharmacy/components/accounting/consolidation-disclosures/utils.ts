import { format } from "date-fns";

export function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

export function periodFromDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return format(new Date(), "yyyy-MM");
  return format(d, "yyyy-MM");
}

export function fmtAmount(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function truncId(id: string | null | undefined, head = 8, tail = 4) {
  if (!id) return "—";
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value))
    return fmtAmount(value);
  if (typeof value === "string") return value || "—";
  return String(value);
}

export type DisclosureTab = "nci" | "fx" | "adj" | "ic";

export function disclosureTabTitle(tab: DisclosureTab): string {
  switch (tab) {
    case "nci":
      return "Non-controlling interest (NCI)";
    case "fx":
      return "FX impact & CTA";
    case "adj":
      return "Consolidation adjustments";
    case "ic":
      return "Intercompany elimination";
  }
}
