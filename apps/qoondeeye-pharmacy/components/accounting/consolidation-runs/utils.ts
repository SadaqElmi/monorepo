import type { VariantProps } from "class-variance-authority";
import { format } from "date-fns";

import { badgeVariants } from "@/components/ui/badge";
import type { ConsolidationRunItem } from "@/lib/services/accounting";

export function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

export function periodFromDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return format(new Date(), "yyyy-MM");
  return format(d, "yyyy-MM");
}

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return format(d, "yyyy-MM-dd HH:mm");
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

export function humanizeKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function statusBadgeVariant(
  status: ConsolidationRunItem["status"],
): NonNullable<VariantProps<typeof badgeVariants>["variant"]> {
  switch (status) {
    case "finalized":
      return "success";
    case "posted":
      return "default";
    case "draft":
      return "outline";
    case "reversed":
      return "destructive";
    default:
      return "secondary";
  }
}

export function formatScalarForDisplay(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Math.abs(value) > 1e6 || (Math.abs(value) < 1e-2 && value !== 0)) {
      return value.toLocaleString(undefined, { maximumSignificantDigits: 6 });
    }
    return fmtAmount(value);
  }
  if (typeof value === "string") return value.length ? value : "—";
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === "object") return "Object";
  return String(value);
}
