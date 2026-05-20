export function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr;
}

export function formatMoney(value: unknown) {
  if (value === null || value === undefined) return "—";

  const n =
    typeof value === "string"
      ? Number(value)
      : typeof value === "number"
        ? value
        : NaN;

  if (!Number.isFinite(n)) return "—";

  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
