import type {
  ChartAccountRow,
  ChartOfAccountRow,
  JournalEntryRow,
} from "@/lib/services/accounting";

type CoaTreeSource = Pick<
  ChartOfAccountRow | ChartAccountRow,
  "id" | "code" | "name" | "account_type" | "account_key" | "parent_id"
>;

export function money(n: number) {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function journalSourceLabel(sourceType: string): string {
  const map: Record<string, string> = {
    sale: "POS / Sale",
    customer_invoice: "Customer invoice",
    purchase: "Vendor bill",
    purchase_reversal: "Purchase void",
    purchase_refund: "Vendor refund",
    sale_return: "Credit note",
    expense: "Expense",
    manual: "Manual entry",
    ap_payment: "Supplier payment",
    ar_payment: "Customer payment",
  };
  return map[sourceType] ?? sourceType.replace(/_/g, " ");
}

export function journalEntryAmount(entry: JournalEntryRow): number {
  let total = 0;
  for (const ln of entry.lines) {
    total += Number(ln.debit);
  }
  return total;
}

export function journalEntryPartner(entry: JournalEntryRow): string {
  const line = entry.lines.find((l) => l.partner_id);
  if (!line?.partner_id) return "—";
  return (
    (line.partner_kind === "customer" ? "Customer " : "Supplier ") +
    line.partner_id.slice(0, 8) +
    "…"
  );
}

/** Order COA rows as a tree (parent before children) for display. */
export function sortCoaTree(
  rows: CoaTreeSource[],
): Array<CoaTreeSource & { depth: number }> {
  const children = new Map<string | null, CoaTreeSource[]>();
  for (const r of rows) {
    const p = r.parent_id ?? null;
    const list = children.get(p) ?? [];
    list.push(r);
    children.set(p, list);
  }
  for (const [, list] of children) {
    list.sort((a, b) =>
      String(a.code ?? "").localeCompare(String(b.code ?? ""), undefined, {
        numeric: true,
      }),
    );
  }
  const out: Array<CoaTreeSource & { depth: number }> = [];
  function walk(parentId: string | null, depth: number) {
    for (const r of children.get(parentId) ?? []) {
      out.push({ ...r, depth });
      walk(r.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

/** Split flat COA tree rows into accordion groups (one top-level row + descendants). */
export function groupCoaByRoot(
  rows: Array<CoaTreeSource & { depth: number }>,
): {
  id: string;
  title: string;
  rows: Array<CoaTreeSource & { depth: number }>;
}[] {
  const groups: {
    id: string;
    title: string;
    rows: Array<CoaTreeSource & { depth: number }>;
  }[] = [];
  let current: Array<CoaTreeSource & { depth: number }> = [];
  let title = "Accounts";
  let id = "root";
  for (const r of rows) {
    if (r.depth === 0) {
      if (current.length) {
        groups.push({ id, title, rows: [...current] });
      }
      title = r.name;
      id = r.id;
      current = [r];
    } else {
      current.push(r);
    }
  }
  if (current.length) {
    groups.push({ id, title, rows: current });
  }
  return groups;
}
