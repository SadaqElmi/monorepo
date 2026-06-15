"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { searchCachedCustomers } from "@/lib/offline/customer-cache";
import { searchCustomers } from "@/lib/services/customers";
import type { CustomerSummary } from "@repo/types";
import { cn } from "@/lib/utils";

type CustomerSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string | null;
  onSelect: (customer: CustomerSummary) => void;
};

function formatCustomerLabel(c: CustomerSummary): string {
  const parts: string[] = [];
  if (c.name?.trim()) parts.push(c.name.trim());
  if (c.phone?.trim()) parts.push(c.phone.trim());
  if (c.customer_no?.trim()) parts.push(`#${c.customer_no.trim()}`);
  return parts.join(" · ") || c.id.slice(0, 8);
}

export function CustomerSearchDialog({
  open,
  onOpenChange,
  tenantSlug,
  onSelect,
}: CustomerSearchDialogProps) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<CustomerSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const debouncedQuery = useDebouncedValue(query, 300);
  const { isOffline } = useNetworkStatus();

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setHighlight(0);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || !tenantSlug) return;
    const q = debouncedQuery.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const load = isOffline
      ? searchCachedCustomers(q).then((cached) =>
          cached.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone ?? null,
          })),
        )
      : searchCustomers(tenantSlug, q).catch(() =>
          searchCachedCustomers(q).then((cached) =>
            cached.map((c) => ({
              id: c.id,
              name: c.name,
              phone: c.phone ?? null,
            })),
          ),
        );

    load
      .then((rows) => {
        if (!cancelled) {
          setResults(rows);
          setHighlight(0);
        }
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open, tenantSlug, isOffline]);

  const pick = (customer: CustomerSummary) => {
    onSelect(customer);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Select customer</DialogTitle>
          <DialogDescription>
            Search by name, phone, customer no., or member card no.
          </DialogDescription>
        </DialogHeader>
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers…"
              className="pl-9"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && results[highlight]) {
                  e.preventDefault();
                  pick(results[highlight]);
                }
              }}
            />
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-md border">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            ) : results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {query.trim()
                  ? "No customers found."
                  : "Type to search customers."}
              </p>
            ) : (
              <ul>
                {results.map((c, idx) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted",
                        idx === highlight && "bg-muted",
                      )}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => pick(c)}
                    >
                      <span className="font-medium">
                        {c.name?.trim() || "Unnamed customer"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatCustomerLabel(c)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter className="border-t px-4 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
